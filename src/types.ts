
export enum CompanyType {
  TL = 'TL',
  PL = 'PL',
  NT = 'NT'
}

export enum TransactionStatus {
  QUITADO = 'Quitado',
  EM_ABERTO = 'Em Aberto',
  CANCELADA = 'Cancelada'
}

export enum InvoiceType {
  RECEITA = 'Receita',
  DESPESA = 'Despesa',
  TRANSFERENCIA = 'Transferência',
  AJUSTE = 'Ajuste de Saldo'
}

export interface Transaction {
  id: string;
  docNumber: string;
  category: string;
  company: CompanyType;
  nf?: string;
  status: TransactionStatus;
  client?: string;
  supplier?: string;
  value: number;
  type: InvoiceType;
  dueDate: string; // YYYY-MM-DD
  billingDate?: string; // YYYY-MM-DD
  paymentDate?: string; // YYYY-MM-DD (New)
  vencPgtoReal?: string; // Raw column from sheet "Venc / Pagto"
  reconciled?: string; // Conciliado column
  description?: string; // Título / Descrição (New)
  competenceDate: string; // YYYY-MM-DD (First of month usually)
  relatedTo?: string; // Chave de Agrupamento
  costCenter?: string;
}

export interface Budget {
  category: string;
  monthlyValues: number[]; // Index 0 = Jan, 11 = Dec
  total: number;
}

export interface CashFlow {
  competenceDate: string;
  balance: number;
}

export interface FilterState {
  startDate: string; // YYYY-MM
  endDate: string; // YYYY-MM
  companies: CompanyType[];
  statuses: TransactionStatus[];
  types: InvoiceType[];
  categories: string[];
  costCenters: string[];
  relatedToFilter: 'ALL' | 'PRO' | 'MIN';
}

export interface Cat2Mapping {
  category: string;
  cat2: string;
}

export interface RepasseGroup {
  relatedTo: string;
  totalIn: number;
  totalOut: number;
  balance: number;
  statusIn: TransactionStatus;
  statusOut: TransactionStatus;
  transactions: Transaction[];
  clientName?: string;
  supplierName?: string;
  hasNfIn: boolean;
  hasNfOut: boolean;
}

// Generic Bucket for aggregation with drill-down support
export interface Bucket {
  value: number;
  transactions: Transaction[];
}

// For B3 (Revenue by Client)
export interface ClientRevenueRow {
  name: string;
  monthly: Bucket[]; // 0-11
  totalCurrent: Bucket;
  totalPrev: Bucket;
  diff: number;
}

// For B4 (Provisions)
export interface ProvisionRow {
  client: string;
  buckets: {
    base: Bucket; // 0-30 days
    minus1: Bucket; // 31-60
    minus2: Bucket; // 61-90
    minus3: Bucket; // 91-120
    minus4: Bucket; // 121-150
    minus5: Bucket; // 151-180
    older: Bucket; // >180
  };
  total: Bucket;
}

// For B5 (Receivables)
export interface ReceivableRow {
  client: string;
  buckets: {
    overduePrev: Bucket;   // Atrasado (Meses Anteriores)
    currentMonth: Bucket;  // Vence no Mês Atual
    month1: Bucket;
    month2: Bucket;
    month3: Bucket;
    future: Bucket;
  };
  total: Bucket;
}

export interface DRELine {
  label: string;
  isCalculated: boolean;
  isHeader?: boolean; 
  cat2?: string;
  
  // CHANGED: Now using Bucket to support DrillDown
  values: Bucket[]; // 0-11 (Jan-Dec)
  total: Bucket;
  ytd: Bucket;
  toProject: Bucket;

  // For B2 Columns
  prevMonthVal?: Bucket;
  currMonthVal?: Bucket;
  nextMonthVal?: Bucket;
  nextMonthPlus1Val?: Bucket;
  yearTotal?: Bucket;
  
  // Comparisons remain simple numbers/percentages
  budgetTotal?: number;
  lastYearTotal?: number;
  varYear?: number;
  varBudget?: number;
}

// --- MODULE C TYPES ---

export interface Person {
  id: string;
  extractionDate: string; // YYYY-MM-DD (First of month)
  billableStatus: 'Billable' | 'NB' | '';
  name: string;
  doc: string; // CNPJ / CPF
  salary: number;
  admissionDate: string; // YYYY-MM-DD
  terminationDate?: string; // YYYY-MM-DD
  role: string;
  email: string;
  status: string; // Original string from sheet

  // Calculated Fields
  isValid: boolean; // Has Doc
  isBillableMissing: boolean; 
  contractType: 'PJ' | 'CLT' | 'Estagiário' | 'Sócio' | 'Outros';
  activeDays: number;
  proportionality: number; // 0 to 1
  estimatedCost: number;
}

export interface PeopleConfig {
  contractType: string; // 'PJ', 'CLT', 'Estagiário', 'Sócio'
  multiplier: number;
  sumFactor: number;
}

export interface MonthlyPeopleMetrics {
  month: string; // YYYY-MM
  totalHeadcount: number; // Sum of Proportionality
  billableHeadcount: number;
  nbHeadcount: number;
  
  totalCostBillable: number;
  totalCostNB: number;
  
  avgSalaryPJ: number;
  avgCostCLT: number;
  avgCostEstag: number; // NEW

  // Movement
  admissions: number;
  terminations: number;
  turnoverRate: number;
  avgTenureMonths: number;

  // From Module B Integration
  revenue: number;
  revenuePerBillable: number;
  marginPerBillable: number;
}

// For C4 (Promotions)
export interface PromotionRow {
    doc: string;
    name: string;
    contractType: string;
    admissionDate: string;
    terminationDate?: string; // New field for filtering active
    
    currentSalary: number;
    currentSalaryDate: string; // Month of current extraction

    previousSalary?: number;
    lastIncreaseDate?: string; // Month when salary changed to current

    salary12MonthsAgo?: number; // Salary exactly 1 year before reference

    hasIncreaseInPeriod: boolean;
}
