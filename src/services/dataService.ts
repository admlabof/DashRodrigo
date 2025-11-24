
import { DEFAULT_CAT2_MAPPING, MOCK_BUDGET, MOCK_CASH } from "../constants";
import { Cat2Mapping, FilterState, RepasseGroup, Transaction, TransactionStatus, InvoiceType, DRELine, ProvisionRow, ReceivableRow, Bucket, ClientRevenueRow, CashFlow } from "../types";

// --- FORMATTING ---
export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

// Helper for normalized comparison
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").trim();

// Helper to detect Transferencia
const isTransfer = (t: Transaction): boolean => {
    // Check Type Enum
    if (t.type === InvoiceType.TRANSFERENCIA || t.type === InvoiceType.AJUSTE) return true;
    
    // Check strings in case import missed it
    const combined = (t.client || '') + ' ' + (t.supplier || '') + ' ' + (t.category || '') + ' ' + (t.description || '');
    return norm(combined).includes('transferencia');
};

// --- HELPER FUNCTIONS FOR BUCKETS ---
const emptyBucket = (): Bucket => ({ value: 0, transactions: [] });

const addTx = (b: Bucket, t: Transaction) => {
    b.value += t.value;
    b.transactions.push(t);
};

const sumBuckets = (buckets: Bucket[]): Bucket => {
    const res = emptyBucket();
    buckets.forEach(b => {
        res.value += b.value;
        if (b.transactions.length > 0) {
            res.transactions = [...res.transactions, ...b.transactions];
        }
    });
    return res;
};

const createBucket = (val: number, txs: Transaction[] = []): Bucket => ({ value: val, transactions: txs });


// --- AUTO CLASSIFICATION ENGINE (STRICT PREFIX BASED) ---
export const autoClassifyCategory = (rawCategory: string): string => {
  const c = rawCategory.trim();
  const lower = norm(c);
  
  // 1. REPASSES (1.8, 2.12)
  if (c.startsWith('1.8')) return 'Repasse Entrada';
  if (c.startsWith('2.12.3') || c.startsWith('2.12')) return 'Repasse Saída';

  // 2. RECEITAS (1.x)
  if (c.startsWith('1.1')) return 'Rec Fee Mensal';
  if (c.startsWith('1.2')) return 'Rec Extras';
  if (c.startsWith('1.6')) return 'Rec Projetos';
  if (c.startsWith('1.9')) return 'Rec Financeira';
  
  // Unify Rebates
  if (lower.includes('rebate')) return 'Rec Rebate';

  // Catch-all for other revenues
  if (c.startsWith('1.') || lower.startsWith('rec ')) return c.replace(/^[0-9.-]+\s-\s/, ''); 

  // 3. IMPOSTOS (2.1)
  if (c.startsWith('2.1.') || c.startsWith('2.1 ')) return 'Impostos';
  if (c === '2.1' || c === '2.1 - Impostos') return 'Impostos';

  // 4. PESSOAL (2.11)
  if (lower.includes('benef') || lower.includes('swile') || lower.includes('seg vida') || lower.includes('vt ')) {
      return 'Benefícios';
  }
  
  if (c.startsWith('2.11')) {
      if (c.startsWith('2.11.1') && !c.startsWith('2.11.10') && !c.startsWith('2.11.12') && !c.startsWith('2.11.13') && !c.startsWith('2.11.14')) return 'Benefícios';
      if (c.startsWith('2.11.12') || c.startsWith('2.11.2')) return 'Sócios';
      if (c.startsWith('2.11.3')) return 'Encargos Sociais';
      if (c.startsWith('2.11.14')) return 'PJs Terceiros';
      if (c.startsWith('2.11.9')) return 'Comissões';
      return 'Salários (Estag, CLT, PJs)';
  }

  // 5. ESCRITÓRIO (2.13)
  if (c.startsWith('2.13')) return 'Escritório / Arena';

  // 6. COMERCIAL (2.14)
  if (c.startsWith('2.14')) return 'Comercial & Mkt';

  // 7. IT (2.15)
  if (c.startsWith('2.15')) return 'IT';

  // 8. G&A (2.16)
  if (c.startsWith('2.16')) return 'G&A';

  // 9. INFLUENCIADORES (2.17)
  if (c.startsWith('2.17')) return 'Influenciadores';

  // 10. CAPEX (2.10)
  if (c.startsWith('2.10')) return 'CAPEX';

  // 11. BONUS (2.19)
  if (c.startsWith('2.19')) return 'BÔNUS & DIV - SÓCIOS';

  return rawCategory; 
};

export const getCat2 = (category: string, mapping: Cat2Mapping[]): string => {
  const found = mapping.find(m => m.category === category);
  const res = found ? found.cat2 : category;
  // Ensure we never return an empty string, which causes "Ghost Rows" in B1/B2
  return (res && res.trim().length > 0) ? res.trim() : 'SEM CATEGORIA';
};

// --- FILTERING ---
export const applyGlobalFilters = (
  transactions: Transaction[],
  filters: FilterState,
  cat2Mapping: Cat2Mapping[],
  ignoreDate: boolean = false
): Transaction[] => {
  return transactions.filter((t) => {
    // HARD STOP FOR CANCELLED
    if (t.status === TransactionStatus.CANCELADA) return false;

    // Date Filter (Optional)
    if (!ignoreDate) {
        const tDate = t.competenceDate.substring(0, 7); // YYYY-MM
        if (tDate < filters.startDate || tDate > filters.endDate) return false;
    }

    if (filters.companies.length > 0 && !filters.companies.includes(t.company)) return false;
    
    if (filters.statuses.length > 0 && !filters.statuses.includes(t.status)) return false;
    // InvoiceType filter handles exclusion of Transferencias if they are not selected in filter.
    // Typically only RECEITA/DESPESA are selected by default.
    if (filters.types.length > 0 && !filters.types.includes(t.type)) return false;
    
    if (filters.costCenters.length > 0) {
         if (!filters.costCenters.includes(t.costCenter || '')) return false;
    }

    if (filters.categories.length > 0) {
        const tCat2 = getCat2(t.category, cat2Mapping);
        if (!filters.categories.includes(tCat2)) return false;
    }

    return true;
  });
};


// --- MODULE A LOGIC (REPASSE) ---
export const processModuleA = (transactions: Transaction[], relatedToFilter: 'ALL' | 'PRO' | 'MIN'): RepasseGroup[] => {
  const groups: Record<string, RepasseGroup> = {};

  transactions.forEach(t => {
    if (t.status === TransactionStatus.CANCELADA) return;
    
    // Strictly only Receita/Despesa
    if (t.type !== InvoiceType.RECEITA && t.type !== InvoiceType.DESPESA) return;

    if (!t.category.toLowerCase().includes('repasse') || !t.relatedTo) return;

    const key = t.relatedTo!;
    if (relatedToFilter === 'PRO' && !key.toUpperCase().includes('PRO')) return; 
    if (relatedToFilter === 'MIN' && !key.toUpperCase().includes('MID')) return;

    if (!groups[key]) {
      groups[key] = {
        relatedTo: key,
        totalIn: 0,
        totalOut: 0,
        balance: 0,
        statusIn: TransactionStatus.QUITADO, // Start optimistic
        statusOut: TransactionStatus.QUITADO, 
        transactions: [],
        hasNfIn: true,
        hasNfOut: true
      };
    }

    const g = groups[key];
    g.transactions.push(t);
    
    // Determine Clients/Suppliers
    if (t.type === InvoiceType.RECEITA) {
        g.totalIn += t.value;
        if (t.client && !g.clientName) g.clientName = t.client;
        
        // Status Logic: If ANY transaction is Open, the whole leg is Open
        if (t.status !== TransactionStatus.QUITADO) g.statusIn = TransactionStatus.EM_ABERTO;
        
        if (!t.docNumber && !t.nf) g.hasNfIn = false;

    } else {
        g.totalOut += Math.abs(t.value); // Store positive for display
        if (t.supplier && !g.supplierName) g.supplierName = t.supplier;

        if (t.status !== TransactionStatus.QUITADO) g.statusOut = TransactionStatus.EM_ABERTO;

        if (!t.docNumber && !t.nf) g.hasNfOut = false;
    }
  });

  // Calculate Balances
  Object.values(groups).forEach(g => {
    g.balance = g.totalIn - g.totalOut;
  });

  return Object.values(groups).sort((a, b) => a.relatedTo.localeCompare(b.relatedTo));
};

// --- MODULE B1: DRE MENSAL (STRICT STRUCTURE) ---
export const processModuleB1 = (
    transactions: Transaction[], 
    year: number, 
    currentMonthIdx: number, 
    cat2Mapping: Cat2Mapping[],
    cashFlowData: CashFlow[],
    endMonthIdx: number
): DRELine[] => {
    
    const lines: DRELine[] = [];
    
    // Core structure definitions
    const structure = {
        repasseEntrada: ['Repasse Entrada'],
        repasseSaida: ['Repasse Saída'],
        impostos: ['Impostos'],
        receitas: ['Rec Fee Mensal', 'Rec Extras', 'Rec Projetos', 'Rec Financeira', 'Rec Rebate'],
        despesas: [
            'Benefícios', 'Salários (Estag, CLT, PJs)', 'Sócios', 'Encargos Sociais',
            'PJs Terceiros', 'Comissões', 'Escritório / Arena', 'Comercial & Mkt',
            'IT', 'G&A', 'Influenciadores'
        ],
        capex: ['CAPEX'],
        opac: ['OPAC'],
        bonus: ['BÔNUS & DIV - SÓCIOS']
    };

    // Normalize structure for comparison
    const normReceitas = structure.receitas.map(norm);
    const normDespesas = structure.despesas.map(norm);
    const normImpostos = structure.impostos.map(norm);
    const normCapex = structure.capex.map(norm);
    const normBonus = structure.bonus.map(norm);
    const normOpac = structure.opac.map(norm);

    // Helper to init a line
    const initLine = (label: string, isCalc: boolean = false, isHead: boolean = false): DRELine => ({
        label, isCalculated: isCalc, isHeader: isHead, values: Array.from({length:12}, () => emptyBucket()), total: emptyBucket(), ytd: emptyBucket(), toProject: emptyBucket()
    });

    // 1. Identify Dynamic Cat2s that are NOT in the core structure but exist in data
    const allCat2s = new Set(transactions.map(t => getCat2(t.category, cat2Mapping)));
    
    const dynamicReceitas = Array.from(allCat2s).filter(c => {
        const n = norm(c);
        return c.startsWith('Rec') && !normReceitas.includes(n);
    });
    
    const dynamicDespesas = Array.from(allCat2s).filter(c => {
        const n = norm(c);
        return c && c.trim().length > 0 && // Ensure no empty strings
        !c.startsWith('Rec') && 
        !c.startsWith('Repasse') &&
        !normImpostos.includes(n) &&
        !normReceitas.includes(n) &&
        !normDespesas.includes(n) && // Strict normalized check prevents duplicates
        !normCapex.includes(n) &&
        !normBonus.includes(n) &&
        !normOpac.includes(n);
    });

    // --- BUILD ROWS ---

    const rowFat = initLine('Faturamento', true);
    const rowRepE = initLine('Repasse Entrada'); // We will aggregate sub-rows visually if needed, but for now simple
    const rowRepS = initLine('Repasse Saída');
    
    const rowRecHeader = initLine('RECEITAS', true, true);
    // Expand Receitas
    let recRows = [...structure.receitas, ...dynamicReceitas].map(r => ({ ...initLine(r), cat2: r }));

    const rowImpHeader = initLine('Impostos'); // Often singular line, but good to have consistency
    
    const rowDespHeader = initLine('DESPESAS', true, true);
    // Expand Despesas
    let despRows = [...structure.despesas, ...dynamicDespesas].map(d => ({ ...initLine(d), cat2: d }));

    const rowLucro = initLine('LUCRO', true);
    const rowLucroPct = initLine('LUCRO %', true);
    
    const rowCapex = initLine('CAPEX');
    const rowOpac = initLine('OPAC', true);
    const rowBonus = initLine('BÔNUS & DIV - SÓCIOS');
    
    const rowCaixa = initLine('Caixa Fim do mês', true);

    // --- POPULATE DATA ---
    transactions.forEach(t => {
        if (t.status === TransactionStatus.CANCELADA) return;
        
        // EXCLUDE TRANSFERÊNCIA / AJUSTE - STRICTLY ONLY REC/DESP
        if (t.type !== InvoiceType.RECEITA && t.type !== InvoiceType.DESPESA) return;

        // Use String Parsing instead of Date Object to avoid Timezone shifts
        // Format: YYYY-MM-DD
        if (!t.competenceDate || t.competenceDate.length < 10) return;

        const tYear = parseInt(t.competenceDate.substring(0, 4));
        if (tYear !== year) return;
        
        const m = parseInt(t.competenceDate.substring(5, 7)) - 1; // 0-11
        if (m < 0 || m > 11) return;

        const cat2 = getCat2(t.category, cat2Mapping);
        const normCat2 = norm(cat2);

        // Faturamento: All Rec* + Repasse* (Positive)
        if (cat2.startsWith('Rec') || cat2.startsWith('Repasse')) {
            if (t.value > 0) addTx(rowFat.values[m], t);
        }

        // Repasses
        if (structure.repasseEntrada.includes(cat2)) addTx(rowRepE.values[m], t);
        if (structure.repasseSaida.includes(cat2)) addTx(rowRepS.values[m], t);

        // Receitas (Detail)
        const recRow = recRows.find(r => r.cat2 === cat2 || norm(r.cat2!) === normCat2);
        if (recRow) addTx(recRow.values[m], t);

        // Impostos
        if (structure.impostos.includes(cat2)) addTx(rowImpHeader.values[m], t);

        // Despesas (Detail)
        // Check strict equality first, then normalized for safety
        const despRow = despRows.find(r => r.cat2 === cat2 || norm(r.cat2!) === normCat2);
        if (despRow) addTx(despRow.values[m], t);

        // Capex
        if (structure.capex.includes(cat2)) addTx(rowCapex.values[m], t);

        // Bonus
        if (structure.bonus.includes(cat2)) addTx(rowBonus.values[m], t);
    });

    // --- AGGREGATE & CALCULATE TOTALS ---
    const calcTotals = (row: DRELine) => {
        // Calculate Total Period (Sum of months up to endMonthIdx)
        const rangeValues = row.values.slice(0, endMonthIdx + 1);
        row.total = sumBuckets(rangeValues);
    };

    [rowFat, rowRepE, rowRepS, rowImpHeader, rowCapex, rowBonus, ...recRows, ...despRows].forEach(calcTotals);

    // FILTER OUT ZERO ROWS
    recRows = recRows.filter(r => r.total.value !== 0);
    despRows = despRows.filter(r => r.total.value !== 0);

    // Calculate Headers Sums (Receitas & Despesas)
    for (let m = 0; m < 12; m++) {
        // Receitas Header = Sum of all Rec Rows
        recRows.forEach(r => {
             const src = r.values[m];
             rowRecHeader.values[m].value += src.value;
             if (src.transactions.length) rowRecHeader.values[m].transactions.push(...src.transactions);
        });
        
        // Despesas Header = Sum of all Desp Rows
        despRows.forEach(r => {
             const src = r.values[m];
             rowDespHeader.values[m].value += src.value;
             if (src.transactions.length) rowDespHeader.values[m].transactions.push(...src.transactions);
        });
    }
    calcTotals(rowRecHeader);
    calcTotals(rowDespHeader);

    // Calculate Calculated Rows (Lucro, OPAC, Caixa)
    for (let m = 0; m < 12; m++) {
        // Lucro = Receita (Header) + Despesas (Header) + Impostos (Negative usually)
        const receita = rowRecHeader.values[m].value;
        const despesa = rowDespHeader.values[m].value; // already negative
        const imposto = rowImpHeader.values[m].value; // already negative
        
        const lucroVal = receita + despesa + imposto;
        
        // Aggregate transactions for Lucro drilldown
        const lucroTxs = [
            ...rowRecHeader.values[m].transactions, 
            ...rowDespHeader.values[m].transactions,
            ...rowImpHeader.values[m].transactions
        ];
        
        rowLucro.values[m] = createBucket(lucroVal, lucroTxs);

        // Lucro %
        const pct = receita !== 0 ? (lucroVal / receita) * 100 : 0;
        rowLucroPct.values[m] = createBucket(pct); // No txs for %

        // OPAC = Lucro + Capex
        const capex = rowCapex.values[m].value;
        const opacVal = lucroVal + capex; 
        const opacTxs = [...lucroTxs, ...rowCapex.values[m].transactions];
        rowOpac.values[m] = createBucket(opacVal, opacTxs);

        // Caixa (From Cash Flow Data)
        const mStr = (m + 1).toString().padStart(2, '0');
        const cDate = `${year}-${mStr}`;
        // Find cash flow entry for this month
        const cashEntry = cashFlowData.find(c => c.competenceDate.startsWith(cDate));
        if (cashEntry) {
            rowCaixa.values[m] = createBucket(cashEntry.balance);
        }
    }
    
    calcTotals(rowLucro);
    calcTotals(rowOpac);
    
    // Fix Lucro % Total
    const totalRec = rowRecHeader.total.value;
    const totalLucro = rowLucro.total.value;
    rowLucroPct.total = createBucket(totalRec !== 0 ? (totalLucro / totalRec) * 100 : 0);

    // Fix Caixa Total (Should be Last Available Balance, not sum)
    let lastBalance = 0;
    for (let i = endMonthIdx; i >= 0; i--) {
        if (rowCaixa.values[i].value !== 0) {
            lastBalance = rowCaixa.values[i].value;
            break;
        }
    }
    rowCaixa.total = createBucket(lastBalance);


    // Assemble Final List
    lines.push(rowFat);
    lines.push(rowRepE);
    lines.push(rowRepS);
    lines.push({ ...initLine(''), isCalculated: true }); // Spacer
    
    lines.push(rowRecHeader);
    lines.push(...recRows);
    
    lines.push({ ...initLine(''), isCalculated: true });
    lines.push(rowImpHeader);
    
    lines.push({ ...initLine(''), isCalculated: true });
    lines.push(rowDespHeader);
    lines.push(...despRows);
    
    lines.push({ ...initLine(''), isCalculated: true });
    lines.push(rowLucro);
    lines.push(rowLucroPct);
    
    lines.push({ ...initLine(''), isCalculated: true });
    lines.push(rowCapex);
    
    lines.push({ ...initLine(''), isCalculated: true });
    lines.push(rowOpac);
    
    lines.push({ ...initLine(''), isCalculated: true });
    lines.push(rowBonus);
    
    lines.push({ ...initLine(''), isCalculated: true });
    lines.push(rowCaixa);

    return lines;
};

// --- MODULE B2: DRE ACUMULADO ---
export const processModuleB2 = (
    transactions: Transaction[], 
    year: number, 
    currentMonthIdx: number, 
    cat2Mapping: Cat2Mapping[],
    cashFlowData: CashFlow[]
): DRELine[] => {
    // Re-use B1 logic to generate the full year structure
    const baseLines = processModuleB1(transactions, year, 11, cat2Mapping, cashFlowData, 11);
    const lastYearLines = processModuleB1(transactions, year - 1, 11, cat2Mapping, cashFlowData, 11);

    const lines: DRELine[] = baseLines.map(line => {
        const lyLine = lastYearLines.find(l => l.label === line.label);
        const lyTotal = lyLine ? lyLine.total.value : 0;

        const yearTotalBucket = line.total; 
        const ytdValues = line.values.slice(0, currentMonthIdx + 1);
        const ytdBucket = sumBuckets(ytdValues);

        const prevMonthBucket = currentMonthIdx > 0 ? line.values[currentMonthIdx - 1] : emptyBucket();
        const currMonthBucket = line.values[currentMonthIdx];
        const nextMonthBucket = currentMonthIdx < 11 ? line.values[currentMonthIdx + 1] : emptyBucket();
        const nextMonthPlus1Bucket = currentMonthIdx < 10 ? line.values[currentMonthIdx + 2] : emptyBucket();

        const bud = MOCK_BUDGET.find(b => b.category === line.cat2);
        const budgetTotal = bud ? bud.total : 0;

        const varYear = lyTotal !== 0 ? ((yearTotalBucket.value - lyTotal) / Math.abs(lyTotal)) * 100 : 0;

        // Special Logic for Caixa
        if (line.label === 'Caixa Fim do mês') {
            ytdBucket.value = currMonthBucket.value; 
            yearTotalBucket.value = line.values[11].value;
        }

        return {
            ...line,
            prevMonthVal: prevMonthBucket,
            currMonthVal: currMonthBucket,
            nextMonthVal: nextMonthBucket,
            nextMonthPlus1Val: nextMonthPlus1Bucket,
            ytd: ytdBucket,
            yearTotal: yearTotalBucket,
            budgetTotal,
            lastYearTotal: lyTotal,
            varYear
        };
    });

    return lines;
};


// --- MODULE B3: RECEITA POR CLIENTE ---
export const processModuleB3 = (
    transactions: Transaction[], 
    year: number, 
    cat2Mapping: Cat2Mapping[]
): ClientRevenueRow[] => {
    const clients: Record<string, ClientRevenueRow> = {};

    transactions.forEach(t => {
        if (t.status === TransactionStatus.CANCELADA) return;
        if (isTransfer(t)) return; // Exclude transfers
        
        const cat2 = getCat2(t.category, cat2Mapping);
        // Logic: ONLY "Rec*" items. Exclude Repasse explicitely.
        if (!cat2.toLowerCase().match(/^rec/i)) return; 
        if (cat2.startsWith('Repasse')) return;

        // Timezone Safe Parsing
        if (!t.competenceDate || t.competenceDate.length < 10) return;
        const tYear = parseInt(t.competenceDate.substring(0, 4));
        const m = parseInt(t.competenceDate.substring(5, 7)) - 1;

        const isCurrentYear = tYear === year;
        const isPrevYear = tYear === year - 1;

        if (!isCurrentYear && !isPrevYear) return;

        let clientName = t.client ? t.client.trim() : 'CLIENTE NÃO IDENTIFICADO';
        if (!clientName) clientName = 'CLIENTE NÃO IDENTIFICADO';

        if (!clients[clientName]) {
            clients[clientName] = {
                name: clientName,
                monthly: Array.from({length: 12}, () => emptyBucket()),
                totalCurrent: emptyBucket(),
                totalPrev: emptyBucket(),
                diff: 0
            };
        }

        if (isCurrentYear) {
            if (m >= 0 && m <= 11) addTx(clients[clientName].monthly[m], t);
            addTx(clients[clientName].totalCurrent, t);
        } else {
            addTx(clients[clientName].totalPrev, t);
        }
    });

    const result = Object.values(clients).map(c => {
        c.diff = c.totalCurrent.value - c.totalPrev.value;
        return c;
    });

    return result.sort((a, b) => b.totalCurrent.value - a.totalCurrent.value);
};

// --- MODULE B4: PROVISÕES ---
export const processModuleB4 = (
    transactions: Transaction[], 
    endDate: string, // YYYY-MM
    cat2Mapping: Cat2Mapping[],
    onlyRec: boolean = false
): ProvisionRow[] => {
    
    const cutoffDate = endDate + '-31'; // Ensure it covers the full month
    const buckets: Record<string, ProvisionRow> = {};

    transactions.forEach(t => {
        if (t.status === TransactionStatus.CANCELADA) return;
        if (t.status === TransactionStatus.QUITADO) return; // EXCLUDE QUITADO AS REQUESTED
        if (t.type !== InvoiceType.RECEITA) return; // ONLY RECEITA
        
        // EXCLUDE TRANSFERENCIA / AJUSTE / FINANCEIRA
        if (isTransfer(t)) return;
        if (t.category.includes('1.9') || t.category.includes('Financeira')) return;

        if (t.competenceDate > cutoffDate) return; // Provision must be past/current

        // Filter by Category
        const cat2 = getCat2(t.category, cat2Mapping);
        if (onlyRec && (!cat2.toLowerCase().match(/^rec/i) || cat2.startsWith('Repasse'))) return;

        // Provision Logic: 
        // 1. No Doc/NF 
        // OR 
        // 2. Billing Date > Cutoff Date
        
        const hasDoc = (t.docNumber && t.docNumber.trim().length > 0) || (t.nf && t.nf.trim().length > 0);
        const billedInFuture = t.billingDate && t.billingDate > cutoffDate;

        if (hasDoc && !billedInFuture) return; // It is invoiced and within period, so NOT a provision

        let clientName = t.client ? t.client.trim() : 'CLIENTE NÃO IDENTIFICADO';
        if (!clientName) clientName = 'CLIENTE NÃO IDENTIFICADO';

        if (!buckets[clientName]) {
            buckets[clientName] = {
                client: clientName,
                buckets: {
                    base: emptyBucket(),
                    minus1: emptyBucket(),
                    minus2: emptyBucket(),
                    minus3: emptyBucket(),
                    minus4: emptyBucket(),
                    minus5: emptyBucket(),
                    older: emptyBucket()
                },
                total: emptyBucket()
            };
        }

        const row = buckets[clientName];
        addTx(row.total, t);

        // Aging Logic based on Due Date relative to Cutoff
        const due = t.dueDate ? new Date(t.dueDate) : new Date(t.competenceDate);
        const cut = new Date(cutoffDate);
        
        // Fix timezone offset for accurate day calc
        const diffTime = cut.getTime() - due.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 30) addTx(row.buckets.base, t); // Includes future due dates (negative diff)
        else if (diffDays <= 60) addTx(row.buckets.minus1, t);
        else if (diffDays <= 90) addTx(row.buckets.minus2, t);
        else if (diffDays <= 120) addTx(row.buckets.minus3, t);
        else if (diffDays <= 150) addTx(row.buckets.minus4, t);
        else if (diffDays <= 180) addTx(row.buckets.minus5, t);
        else addTx(row.buckets.older, t);
    });

    return Object.values(buckets).sort((a, b) => b.total.value - a.total.value);
};

// --- MODULE B5: A RECEBER ---
export const processModuleB5 = (
    transactions: Transaction[], 
    endDate: string, // YYYY-MM
    cat2Mapping: Cat2Mapping[],
    onlyRec: boolean = false
): ReceivableRow[] => {
    
    const buckets: Record<string, ReceivableRow> = {};
    const filterYear = parseInt(endDate.substring(0, 4));
    const filterMonth = parseInt(endDate.substring(5, 7)); // 1-12

    // Helper to get month difference: Due Month - Filter Month
    const getMonthDiff = (dateStr: string): number => {
        if (!dateStr || dateStr.length < 7) return -999;
        const y = parseInt(dateStr.substring(0, 4));
        const m = parseInt(dateStr.substring(5, 7)); // 1-12
        return ((y - filterYear) * 12) + (m - filterMonth);
    };

    transactions.forEach(t => {
        if (t.status === TransactionStatus.CANCELADA) return;
        if (t.status === TransactionStatus.QUITADO) return;
        if (t.type !== InvoiceType.RECEITA) return;
        
        if (isTransfer(t)) return;

        // Must be Invoiced (Has Doc/NF)
        const hasDoc = (t.docNumber && t.docNumber.trim().length > 0) || (t.nf && t.nf.trim().length > 0);
        if (!hasDoc) return;

        // Filter by Category
        const cat2 = getCat2(t.category, cat2Mapping);
        if (onlyRec && (!cat2.toLowerCase().match(/^rec/i) || cat2.startsWith('Repasse'))) return;

        let clientName = t.client ? t.client.trim() : 'CLIENTE NÃO IDENTIFICADO';
        if (!clientName) clientName = 'CLIENTE NÃO IDENTIFICADO';

        if (!buckets[clientName]) {
            buckets[clientName] = {
                client: clientName,
                buckets: {
                    overduePrev: emptyBucket(),
                    currentMonth: emptyBucket(),
                    month1: emptyBucket(),
                    month2: emptyBucket(),
                    month3: emptyBucket(),
                    future: emptyBucket()
                },
                total: emptyBucket()
            };
        }

        const row = buckets[clientName];
        addTx(row.total, t);

        // Bucket Logic (String based Month Diff)
        const diff = getMonthDiff(t.dueDate);

        if (diff < 0) addTx(row.buckets.overduePrev, t); // Past months
        else if (diff === 0) addTx(row.buckets.currentMonth, t); // Selected Month
        else if (diff === 1) addTx(row.buckets.month1, t);
        else if (diff === 2) addTx(row.buckets.month2, t);
        else if (diff === 3) addTx(row.buckets.month3, t);
        else addTx(row.buckets.future, t);
    });

    return Object.values(buckets).sort((a, b) => b.total.value - a.total.value);
};
