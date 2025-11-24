
import { Person, PeopleConfig, MonthlyPeopleMetrics, PromotionRow } from "../types";
import { formatCurrency } from "./dataService";

// Calculate days active in a month
const calculateProportionality = (
    person: Person,
    extractionDate: string, // YYYY-MM-01
    admissionDate: string,
    terminationDate?: string
): { activeDays: number, factor: number } => {
    if (!extractionDate || !admissionDate) return { activeDays: 0, factor: 0 };

    const year = parseInt(extractionDate.substring(0, 4));
    const month = parseInt(extractionDate.substring(5, 7)) - 1; // 0-11
    
    if (isNaN(year) || isNaN(month)) return { activeDays: 0, factor: 0 };

    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    
    // Safety check for invalid dates
    if (isNaN(startOfMonth.getTime()) || isNaN(endOfMonth.getTime())) return { activeDays: 0, factor: 0 };

    const daysInMonth = endOfMonth.getDate();

    const adm = new Date(admissionDate);
    // If admission date is invalid, we can't calculate
    if (isNaN(adm.getTime())) return { activeDays: 0, factor: 0 };

    const dem = terminationDate ? new Date(terminationDate) : null;
    if (dem && isNaN(dem.getTime())) return { activeDays: 0, factor: 0 };

    // Start Activity: Max(StartMonth, Admission)
    let startAct = startOfMonth > adm ? startOfMonth : adm;
    
    // End Activity: Min(EndMonth, Termination (or EndMonth if null))
    let endAct = endOfMonth;
    if (dem) {
        endAct = dem < endOfMonth ? dem : endOfMonth;
    }

    // If admitted after month end or terminated before month start -> 0
    if (adm > endOfMonth || (dem && dem < startOfMonth)) {
        return { activeDays: 0, factor: 0 };
    }

    // Safety: ensure start <= end
    if (startAct > endAct) return { activeDays: 0, factor: 0 };

    const diffTime = endAct.getTime() - startAct.getTime();
    const activeDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    const factor = Math.max(0, Math.min(1, activeDays / daysInMonth));
    
    return { activeDays, factor };
};

const getContractType = (role: string): 'PJ' | 'CLT' | 'Estagiário' | 'Sócio' | 'Outros' => {
    if (!role) return 'Outros';
    const r = role.toLowerCase().trim();
    // Normalize to handle accents (Sócio, Sócia)
    const normalized = r.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
    const rClean = normalized.replace(/[\.\-\s]/g, '');

    if (rClean.startsWith('pj') || normalized.includes('(pj)')) return 'PJ';
    if (rClean.startsWith('cl') || rClean.startsWith('clt') || normalized.includes('(clt)')) return 'CLT';
    if (rClean.startsWith('es') || rClean.startsWith('est') || normalized.includes('estag')) return 'Estagiário';
    if (rClean.startsWith('so') || rClean.startsWith('soc') || normalized.includes('socio')) return 'Sócio';
    return 'Outros';
};

export const processPeopleData = (
    rawPeople: Person[], 
    configs: PeopleConfig[]
): Person[] => {
    
    // 1. Sort by Date to help history lookup
    const sorted = [...rawPeople].sort((a,b) => (a.extractionDate || '').localeCompare(b.extractionDate || ''));

    const processed: Person[] = [];
    const history: Record<string, 'Billable'|'NB'> = {}; // Key: DOC

    for (const p of sorted) {
        if (!p.isValid) {
            processed.push(p); // Invalid, skip calcs but keep for C2
            continue;
        }

        // A. Billable Logic
        if (!p.billableStatus) {
            if (history[p.doc]) {
                p.billableStatus = history[p.doc];
                p.isBillableMissing = false; // Fixed by history
            } else {
                p.isBillableMissing = true; // Flag for C2
            }
        } else if (p.billableStatus === 'Billable' || p.billableStatus === 'NB') {
            history[p.doc] = p.billableStatus;
        }

        // B. Contract Type
        p.contractType = getContractType(p.role);

        // C. Proportionality
        const { activeDays, factor } = calculateProportionality(p, p.extractionDate, p.admissionDate, p.terminationDate);
        p.activeDays = activeDays;
        p.proportionality = factor;

        // D. Cost
        const config = configs.find(c => c.contractType === p.contractType);
        const mult = config ? config.multiplier : 1;
        const sum = config ? config.sumFactor : 0;
        
        const monthlyCost = (p.salary * mult) + sum;
        p.estimatedCost = monthlyCost * factor;

        processed.push(p);
    }

    return processed;
};

export const aggregatePeopleMetrics = (
    people: Person[],
    monthlyRevenue: Record<string, number> // Key YYYY-MM, Value Revenue
): MonthlyPeopleMetrics[] => {
    const metricsMap: Record<string, MonthlyPeopleMetrics> = {};

    people.forEach(p => {
        if (!p.isValid) return;
        if (!p.extractionDate || p.extractionDate.length !== 10) return; // Skip invalid dates
        
        const month = p.extractionDate.substring(0, 7); // YYYY-MM

        if (!metricsMap[month]) {
            metricsMap[month] = {
                month,
                totalHeadcount: 0,
                billableHeadcount: 0,
                nbHeadcount: 0,
                totalCostBillable: 0,
                totalCostNB: 0,
                avgSalaryPJ: 0, // Temp sum
                avgCostCLT: 0, // Temp sum
                avgCostEstag: 0, // Temp sum
                admissions: 0,
                terminations: 0,
                turnoverRate: 0,
                avgTenureMonths: 0,
                revenue: monthlyRevenue[month] || 0,
                revenuePerBillable: 0,
                marginPerBillable: 0
            };
        }

        const m = metricsMap[month];

        // Aggregations (Weighted by Proportionality for Headcount)
        m.totalHeadcount += p.proportionality;
        
        if (p.billableStatus === 'Billable') {
            m.billableHeadcount += p.proportionality;
            m.totalCostBillable += p.estimatedCost;
        } else if (p.billableStatus === 'NB') {
            m.nbHeadcount += p.proportionality;
            m.totalCostNB += p.estimatedCost;
        }

        // Movements
        if (p.admissionDate && p.admissionDate.startsWith(month)) m.admissions++;
        if (p.terminationDate && p.terminationDate.startsWith(month)) m.terminations++;
        
        // Tenure (Simple calc: Extraction - Admission)
        if (p.admissionDate) {
            const ext = new Date(p.extractionDate);
            const adm = new Date(p.admissionDate);
            if (!isNaN(ext.getTime()) && !isNaN(adm.getTime())) {
                const tenureMonths = (ext.getFullYear() - adm.getFullYear()) * 12 + (ext.getMonth() - adm.getMonth());
                if (tenureMonths >= 0) {
                     // Add to total, divide later
                     m.avgTenureMonths += tenureMonths; 
                }
            }
        }
    });
    
    // Finalize Averages
    Object.values(metricsMap).forEach(m => {
        // Re-filter to get specific denominators
        const pjs = people.filter(p => p.isValid && p.extractionDate.startsWith(m.month) && p.contractType === 'PJ');
        const pjCount = pjs.reduce((acc, p) => acc + p.proportionality, 0);
        const pjSum = pjs.reduce((acc, p) => acc + (p.salary * p.proportionality), 0);
        m.avgSalaryPJ = pjCount > 0 ? pjSum / pjCount : 0;

        const clts = people.filter(p => p.isValid && p.extractionDate.startsWith(m.month) && p.contractType === 'CLT');
        const cltCount = clts.reduce((acc, p) => acc + p.proportionality, 0);
        const cltSum = clts.reduce((acc, p) => acc + p.estimatedCost, 0);
        m.avgCostCLT = cltCount > 0 ? cltSum / cltCount : 0;

        const estags = people.filter(p => p.isValid && p.extractionDate.startsWith(m.month) && p.contractType === 'Estagiário');
        const estagCount = estags.reduce((acc, p) => acc + p.proportionality, 0);
        const estagSum = estags.reduce((acc, p) => acc + p.estimatedCost, 0);
        m.avgCostEstag = estagCount > 0 ? estagSum / estagCount : 0;

        // Tenure Avg
        const activeCount = people.filter(p => p.isValid && p.extractionDate.startsWith(m.month)).length;
        m.avgTenureMonths = activeCount > 0 ? m.avgTenureMonths / activeCount : 0;

        // Financials
        if (m.billableHeadcount > 0) {
            m.revenuePerBillable = m.revenue / m.billableHeadcount;
            const totalCost = m.totalCostBillable + m.totalCostNB; // Total People Cost
            m.marginPerBillable = (m.revenue - totalCost) / m.billableHeadcount;
        }
    });

    return Object.values(metricsMap).sort((a,b) => a.month.localeCompare(b.month));
};

export const calculatePromotions = (people: Person[], startDate: string, endDate: string): PromotionRow[] => {
    // 1. Group by Doc
    const grouped: Record<string, Person[]> = {};
    people.forEach(p => {
        if (!p.isValid || !p.doc) return;
        if (!grouped[p.doc]) grouped[p.doc] = [];
        grouped[p.doc].push(p);
    });

    const results: PromotionRow[] = [];
    const filterEnd = endDate ? endDate + '-31' : '9999-12-31';
    const filterStart = startDate ? startDate + '-01' : '0000-01-01';

    Object.values(grouped).forEach(history => {
        // Sort history: Oldest to Newest
        history.sort((a, b) => (a.extractionDate || '').localeCompare(b.extractionDate || ''));

        // Get latest record within the selection period
        const latestInPeriod = history.filter(p => p.extractionDate && p.extractionDate <= filterEnd).pop();

        if (!latestInPeriod) return; // Not present up to end date

        // Check if employee is strictly "active" in the selection window
        const isActiveInPeriod = history.some(p => p.extractionDate && p.extractionDate >= filterStart && p.extractionDate <= filterEnd);
        if (!isActiveInPeriod) return;

        // Check for termination before period start
        if (latestInPeriod.terminationDate && latestInPeriod.terminationDate < filterStart) return;

        const currentSalary = latestInPeriod.salary;
        
        // Find salary change point (walking backwards from latest)
        let previousSalary: number | undefined;
        let lastIncreaseDate: string | undefined;

        for (let i = history.indexOf(latestInPeriod); i > 0; i--) {
            const curr = history[i];
            const prev = history[i-1];
            
            if (curr.salary !== prev.salary) {
                if (curr.extractionDate && curr.extractionDate.length >= 7) {
                    lastIncreaseDate = curr.extractionDate.substring(0, 7); // YYYY-MM
                    previousSalary = prev.salary;
                }
                break; // Found the most recent change relative to current
            }
        }

        const hasIncreaseInPeriod = !!lastIncreaseDate && (lastIncreaseDate >= startDate && lastIncreaseDate <= endDate);

        // Find Salary 12 months ago
        let salary12MonthsAgo: number | undefined;
        if (latestInPeriod.extractionDate) {
            const targetDate = new Date(latestInPeriod.extractionDate);
            if (!isNaN(targetDate.getTime())) {
                targetDate.setFullYear(targetDate.getFullYear() - 1);
                
                try {
                    const targetStr = targetDate.toISOString().substring(0, 7); // YYYY-MM
                    // Find closest record to 12 months ago (must be <= target)
                    const pastRecord = history.find(p => p.extractionDate && p.extractionDate.startsWith(targetStr));
                    salary12MonthsAgo = pastRecord ? pastRecord.salary : undefined;
                } catch (e) {
                    // Safe guard for any date issues
                    console.warn("Error calculating 12 months ago date", e);
                }
            }
        }

        results.push({
            doc: latestInPeriod.doc,
            name: latestInPeriod.name,
            contractType: latestInPeriod.contractType,
            admissionDate: latestInPeriod.admissionDate,
            terminationDate: latestInPeriod.terminationDate,
            currentSalary,
            currentSalaryDate: latestInPeriod.extractionDate ? latestInPeriod.extractionDate.substring(0, 7) : '',
            previousSalary,
            lastIncreaseDate,
            salary12MonthsAgo,
            hasIncreaseInPeriod
        });
    });

    return results;
}
