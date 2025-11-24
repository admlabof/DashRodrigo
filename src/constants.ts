
import { Budget, CashFlow, Cat2Mapping, CompanyType, InvoiceType, PeopleConfig, Transaction, TransactionStatus } from "./types";

const currentYear = new Date().getFullYear();

// 1. RAW CATEGORIES (Simulating a subset of the real chart of accounts for mock data)
export const RAW_CATEGORIES = [
  '1.1 - Rec Fee Mensal',
  '1.6 - Rec Projetos',
  '1.2 - Rec Extras',
  '1.9 - Rec Financeira',
  '1.8.1 - Repasse E - Mídia',
  '1.8.2 - Repasse E - Produção',
  '2.1.1 - DAS SIMPLES',
  '2.11.7 - Salários CLT',
  '2.11.13 - PJs (Func)',
  '2.13.1 - Aluguel',
  '2.14.1 - Eventos e Patrocinios',
  '2.10.1 - CAPEX - TI'
];

// 2. CONFIGURATION (DE_PARA) - STRICT MAPPING PROVIDED BY USER
export const DEFAULT_CAT2_MAPPING: Cat2Mapping[] = [
  // --- REPASSES ---
  { category: '1.8 - Repasse - Entrada', cat2: 'Repasse Entrada' },
  { category: '1.8.1 - Repasse E - Mídia', cat2: 'Repasse Entrada' },
  { category: '1.8.2 - Repasse E - Produção', cat2: 'Repasse Entrada' },
  { category: '1.8.3 - Repasse E - Influ', cat2: 'Repasse Entrada' },
  
  { category: '2.12 - Repasse - Saída', cat2: 'Repasse Saída' },
  { category: '2.12.1 - Repasse S - Mídia', cat2: 'Repasse Saída' },
  { category: '2.12.2 - Repasse S - Produção', cat2: 'Repasse Saída' },
  { category: '2.12.3 - Repasse S - Influ', cat2: 'Repasse Saída' },

  // --- RECEITAS ---
  { category: '1.1 - Rec Fee Mensal', cat2: 'Rec Fee Mensal' },
  { category: '1.2 - Rec Extras', cat2: 'Rec Extras' },
  { category: '1.6 - Rec Projetos', cat2: 'Rec Projetos' },
  { category: '1.9 - Rec Financeira', cat2: 'Rec Financeira' },
  { category: '1.3 - Rec Rebate', cat2: 'Rec Rebate' }, 
  { category: 'Rec Rebate', cat2: 'Rec Rebate' }, 

  // --- IMPOSTOS ---
  { category: '2.1 - Impostos', cat2: 'Impostos' },
  { category: '2.1.1 - DAS SIMPLES', cat2: 'Impostos' },
  { category: '2.1.2 - Outros Impostos', cat2: 'Impostos' },
  { category: '2.1.3 - ISS', cat2: 'Impostos' },
  { category: '2.1.4 - PIS/COFINS', cat2: 'Impostos' },
  { category: '2.1.5 - IR/CSLL', cat2: 'Impostos' },

  // --- PESSOAL & TERCEIRIZADOS ---
  // Benefícios - Normalized Key
  { category: '2.11.1 - Benefícios', cat2: 'Benefícios' },
  { category: '2.11.1 - BenefÃ­cios', cat2: 'Benefícios' }, // Common encoding error
  { category: '2.11.1 - Benefí­cios', cat2: 'Benefícios' }, 
  { category: '2.11.1.1 - SWILE (VR/VA/ VT de Estag)', cat2: 'Benefícios' },
  { category: '2.11.1.2 - VT (CLTs)', cat2: 'Benefícios' },
  { category: '2.11.1.4 - Seg Vida', cat2: 'Benefícios' },
  
  // Salários
  { category: '2.11.5 - Férias', cat2: 'Salários (Estag, CLT, PJs)' },
  { category: '2.11.10 - Bolsa Auxílio (Estag)', cat2: 'Salários (Estag, CLT, PJs)' },
  { category: '2.11.4 - 13º Salário', cat2: 'Salários (Estag, CLT, PJs)' },
  { category: '2.11.6 - Rescisão', cat2: 'Salários (Estag, CLT, PJs)' },
  { category: '2.11.7 - Salários CLT', cat2: 'Salários (Estag, CLT, PJs)' },
  { category: '2.11.13 - PJs (Func)', cat2: 'Salários (Estag, CLT, PJs)' },
  
  // Sócios
  { category: '2.11.12 - Pro-Labore', cat2: 'Sócios' },
  { category: '2.11.2 - Salários Sócios (Dividendos)', cat2: 'Sócios' },

  // Encargos
  { category: '2.11.3 - Encargos Sociais', cat2: 'Encargos Sociais' },
  
  // PJs Terceiros
  { category: '2.11.14 - PJs (Tercerizados)', cat2: 'PJs Terceiros' },
  
  // Comissões
  { category: '2.11.9 - Comissões', cat2: 'Comissões' },

  // --- ESCRITÓRIO / ARENA ---
  { category: '2.13 - Escritório / Arena', cat2: 'Escritório / Arena' },
  { category: '2.13.1 - Aluguel', cat2: 'Escritório / Arena' },
  { category: '2.13.5 - Limpeza', cat2: 'Escritório / Arena' },
  { category: '2.13.7 - Manutenção', cat2: 'Escritório / Arena' },
  { category: '2.13.3 - Água e Esgoto', cat2: 'Escritório / Arena' },
  { category: '2.13.4 - Energia Elétrica', cat2: 'Escritório / Arena' },
  { category: '2.13.6 - Telefonia', cat2: 'Escritório / Arena' },
  { category: '2.13.9 - IPTU', cat2: 'Escritório / Arena' },
  { category: '2.13.8 - Outros - Office', cat2: 'Escritório / Arena' },

  // --- COMERCIAL & MKT ---
  { category: '2.14 - Comercial & Mkt', cat2: 'Comercial & Mkt' },
  { category: '2.14.1 - Eventos e Patrocinios', cat2: 'Comercial & Mkt' },
  { category: '2.14.2 - Viagens e Concorrências', cat2: 'Comercial & Mkt' },
  { category: '2.14.3 - Outros - Mkt', cat2: 'Comercial & Mkt' },
  { category: '2.14.4 - Alimentação e Transporte (Reemb)', cat2: 'Comercial & Mkt' },

  // --- IT ---
  { category: '2.15 - IT & Operações', cat2: 'IT' },
  { category: '2.15.1 - SaaS', cat2: 'IT' },
  { category: '2.15.2 - IT Hardware Expenses', cat2: 'IT' },
  { category: '2.15.3 - Outros IT', cat2: 'IT' },

  // --- G&A ---
  { category: '2.16 - G&A', cat2: 'G&A' },
  { category: '2.16.1 - Contabilidade & BPO', cat2: 'G&A' },
  { category: '2.16.2 - Legal', cat2: 'G&A' },
  { category: '2.16.3 - Tarifas Bancárias', cat2: 'G&A' },
  { category: '2.16.4 - Endomarketing & Treinamentos', cat2: 'G&A' },
  { category: '2.16.5 - Materiais de Escritório', cat2: 'G&A' },
  { category: '2.16.6 - Outros - G&A', cat2: 'G&A' },

  // --- INFLUENCIADORES ---
  { category: '2.17 - Influenciadores', cat2: 'Influenciadores' },

  // --- CAPEX ---
  { category: '2.10 - CAPEX', cat2: 'CAPEX' },
  { category: '2.10.1 - CAPEX - TI', cat2: 'CAPEX' },
  { category: '2.10.2 - Capex - Móveis', cat2: 'CAPEX' },

  // --- BONUS & DIV ---
  { category: '2.19 - Bônus Sócios', cat2: 'BÔNUS & DIV - SÓCIOS' }
];

// 3. COST CENTERS
export const ALL_COST_CENTERS = [
    'Presidência',
    'Comercial',
    'Marketing',
    'Produção',
    'Mídia',
    'Arena',
    'Financeiro/Adm',
    'Geral'
];

// 4. PEOPLE DEFAULT CONFIG
export const DEFAULT_PEOPLE_CONFIG: PeopleConfig[] = [
  { contractType: 'Estagiário', multiplier: 1, sumFactor: 800 },
  { contractType: 'CLT', multiplier: 1.08, sumFactor: 800 },
  { contractType: 'PJ', multiplier: 1, sumFactor: 0 },
  { contractType: 'Sócio', multiplier: 1, sumFactor: 0 },
];

// 5. MOCK DATA GENERATOR
const generateTransactions = () => {
    const t: Transaction[] = [];
    let idCounter = 1;
    
    const add = (date: string, cat: string, val: number, type: InvoiceType, status: TransactionStatus, entity: string, cc: string, related: string = '', nf: string = '') => {
        t.push({
            id: (idCounter++).toString(),
            docNumber: `DOC-${idCounter}`,
            category: cat,
            company: CompanyType.NT, 
            status: status,
            client: type === InvoiceType.RECEITA ? entity : undefined,
            supplier: type === InvoiceType.DESPESA ? entity : undefined,
            value: val,
            type: type,
            dueDate: date,
            competenceDate: date.substring(0, 8) + '01',
            billingDate: date,
            relatedTo: related,
            nf: nf,
            costCenter: cc
        });
    };

    // Generate data for Jan - Dec
    for (let m = 1; m <= 12; m++) {
        const mStr = m.toString().padStart(2, '0');
        const date = `${currentYear}-${mStr}-15`;
        const isPast = m <= 9; 

        // --- RECEITAS ---
        add(date, '1.1 - Rec Fee Mensal', 120000, InvoiceType.RECEITA, isPast ? TransactionStatus.QUITADO : TransactionStatus.EM_ABERTO, 'Coca-Cola', 'Comercial', '', `NF-CC-${m}`);
        if(m === 3 || m === 7) {
            add(date, '1.6 - Rec Projetos', 250000, InvoiceType.RECEITA, isPast ? TransactionStatus.QUITADO : TransactionStatus.EM_ABERTO, 'Campanha Verão', 'Produção', `PROJ-VERAO-${m}`, `NF-JOB-${m}`);
        }

        // --- REPASSES ---
        if(m % 2 === 0) {
             const campId = `CAMP-${m}`;
             add(date, '1.8.1 - Repasse E - Mídia', 50000, InvoiceType.RECEITA, isPast ? TransactionStatus.QUITADO : TransactionStatus.EM_ABERTO, 'Cliente Nike', 'Mídia', campId, `NF-NIKE-${m}`);
             add(`${currentYear}-${mStr}-20`, '2.12.1 - Repasse S - Mídia', -40000, InvoiceType.DESPESA, isPast ? TransactionStatus.QUITADO : TransactionStatus.EM_ABERTO, 'Influencer Top', 'Mídia', campId, `NF-INF-${m}`);
        }

        // --- DESPESAS ---
        const dStatus = isPast ? TransactionStatus.QUITADO : TransactionStatus.EM_ABERTO;
        
        add(date, '2.11.7 - Salários CLT', -90000, InvoiceType.DESPESA, dStatus, 'Folha Pagamento', 'Geral');
        add(date, '2.11.13 - PJs (Func)', -45000, InvoiceType.DESPESA, dStatus, 'PJs Fixos', 'Geral');
        add(date, '2.11.12 - Pro-Labore', -30000, InvoiceType.DESPESA, dStatus, 'Sócios', 'Presidência');
        
        add(date, '2.13.1 - Aluguel', -15000, InvoiceType.DESPESA, dStatus, 'WeWork', 'Geral');
        add(date, '2.14.1 - Eventos e Patrocinios', -20000, InvoiceType.DESPESA, dStatus, 'Evento X', 'Marketing');
        
        add(date, '2.1.1 - DAS SIMPLES', -25000, InvoiceType.DESPESA, dStatus, 'Receita Federal', 'Financeiro/Adm');

        if (m === 6) {
            add(date, '2.19 - Bônus Sócios', -100000, InvoiceType.DESPESA, TransactionStatus.QUITADO, 'Sócios', 'Presidência');
        }
        if (m === 2) {
            add(date, '2.10.1 - CAPEX - TI', -15000, InvoiceType.DESPESA, TransactionStatus.QUITADO, 'Dell', 'IT');
        }
    }

    return t;
};

export const MOCK_TRANSACTIONS: Transaction[] = generateTransactions();

export const ALL_CATEGORIES = RAW_CATEGORIES.sort();

export const MOCK_BUDGET: Budget[] = [
  { category: 'Rec Fee Mensal', total: 2500000, monthlyValues: Array(12).fill(208000) },
  { category: 'Salários (Estag, CLT, PJs)', total: 1200000, monthlyValues: Array(12).fill(100000) },
];

export const MOCK_CASH: CashFlow[] = Array.from({length: 12}, (_, i) => ({
    competenceDate: `${currentYear}-${(i+1).toString().padStart(2,'0')}-01`,
    balance: 500000 + (i * 50000) 
}));
