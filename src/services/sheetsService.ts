
import { CompanyType, InvoiceType, Transaction, TransactionStatus, Cat2Mapping, CashFlow, Person } from "../types";

// Robust CSV Line Parser (Handles commas inside quotes and escaped quotes "")
const parseCSVLine = (str: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuote = false;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const nextChar = str[i + 1];
    
    if (char === '"') {
      if (inQuote && nextChar === '"') {
        // Handle escaped quote "" inside a quoted field -> becomes single "
        current += '"';
        i++; // Skip the next quote
      } else {
        // Toggle quote state
        inQuote = !inQuote;
      }
    } else if (char === ',' && !inQuote) {
      // Field separator
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

// Normalizes string to remove accents, lowercase, and collapse spaces
const normalizeStr = (str: string): string => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u00A0\s]+/g, ' ') 
    .trim();
};

// "Slugify" for strict header matching (removes all non-alphanumeric)
const slugify = (str: string): string => {
  return normalizeStr(str).replace(/[^a-z0-9]/g, '');
};

// Fix common UTF-8 encoding errors (Mojibake) often found in Excel/CSV
const fixEncoding = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/Ã­/g, 'í')
    .replace(/Ã©/g, 'é')
    .replace(/Ã£/g, 'ã')
    .replace(/Ã¢/g, 'â')
    .replace(/Ã³/g, 'ó')
    .replace(/Ã§/g, 'ç')
    .replace(/Ã¡/g, 'á')
    .replace(/Ãª/g, 'ê')
    .replace(/ï¿½/g, ''); 
};

const parseValue = (valStr: string): number => {
  if (!valStr) return 0;
  let cleanStr = valStr.replace(/[R$\s]/g, '');
  // Brazilian format 1.000,00 -> 1000.00
  if (cleanStr.includes(',') && cleanStr.includes('.')) {
      // If both exist, remove dots (thousands) and swap comma to dot
      cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
  } else if (cleanStr.includes(',')) {
      // If only comma, it's decimal separator
      cleanStr = cleanStr.replace(',', '.');
  }
  
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : num;
};

const parseDate = (dateStr: string): string => {
    if (!dateStr) return '';
    let clean = dateStr.trim();
    
    // Handle DD/MM/YYYY
    if (clean.includes('/')) {
        const parts = clean.split('/');
        if (parts.length === 3) {
            const p0 = parts[0].padStart(2, '0');
            const p1 = parts[1].padStart(2, '0');
            const p2 = parts[2];
            
            // Check if YYYY is first (YYYY/MM/DD)
            if (p0.length === 4) return `${p0}-${p1}-${p2}`;
            
            // Else DD/MM/YYYY -> YYYY-MM-DD
            return `${p2}-${p1}-${p0}`; 
        }
    }
    // Handle YYYY-MM-DD (ensure padding for cases like 2025-1-1)
    if (clean.includes('-')) {
         const parts = clean.split('-');
         if (parts.length === 3) {
             const y = parts[0];
             const m = parts[1].padStart(2, '0');
             const d = parts[2].padStart(2, '0');
             return `${y}-${m}-${d}`;
         }
         return clean;
    }
    
    return '';
};

// Robust Parser for Extraction Date which can be YYYYMM, YYYY-MM-DD, or DD/MM/YYYY
const parseExtractionDate = (val: string): string => {
    if (!val) return '';
    const clean = val.replace(/[^0-9/-]/g, '').trim();
    
    // Case 1: YYYYMM (e.g. 202501)
    if (/^\d{6}$/.test(clean)) {
        const y = clean.substring(0, 4);
        const m = clean.substring(4, 6);
        return `${y}-${m}-01`;
    }

    // Case 2: Standard Date
    const parsed = parseDate(clean);
    if (parsed && parsed.length === 10) {
        // Force to 1st of month
        return parsed.substring(0, 7) + '-01';
    }

    return '';
};

const fetchCSV = async (spreadsheetId: string, gid: string): Promise<string> => {
    const urlExport = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
    const urlGviz = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;

    try {
        const response = await fetch(urlExport);
        if (!response.ok) throw new Error('Export Error');
        return await response.text();
    } catch (exportError) {
        console.warn('Failed to fetch via Export, trying GVIZ endpoint...', exportError);
        try {
            const response = await fetch(urlGviz);
            if (!response.ok) throw new Error('GVIZ Error');
            return await response.text();
        } catch (gvizError) {
            console.error('Both endpoints failed.', gvizError);
            throw new Error('Erro de conexão. Verifique se a planilha está "Publicada na Web" ou acessível por link público.');
        }
    }
};

export const fetchGoogleSheetData = async (spreadsheetId: string, gid: string): Promise<Transaction[]> => {
  const csvText = await fetchCSV(spreadsheetId, gid);

  if (csvText.trim().toLowerCase().startsWith('<!doctype html') || csvText.trim().toLowerCase().startsWith('<html')) {
    throw new Error("O link retornou uma página HTML em vez de dados CSV. Isso geralmente significa que a planilha não está pública ou 'Publicada na Web'.");
  }

  try {
    const allLines = csvText.split(/\r?\n/);
    
    // --- HEADER DETECTION ---
    let bestHeaderRowIndex = 0;
    
    if (allLines.length > 0) {
        const row0Raw = parseCSVLine(allLines[0]);
        const row0Slug = row0Raw.map(slugify);
        const hasVal = row0Slug.some(s => s.includes('valor') || s.includes('total') || s.includes('liquido'));
        const hasCat = row0Slug.some(s => s.includes('categoria') || s.includes('cat') || s.includes('conta') || s.includes('classificacao'));
        
        // If Row 0 looks like a header, use it.
        if (hasVal && hasCat) {
            bestHeaderRowIndex = 0;
        } else {
            // Deep scan if Row 0 is suspicious
            let maxScore = 0;
            for (let i = 0; i < Math.min(allLines.length, 15); i++) {
                const rowRaw = parseCSVLine(allLines[i]);
                const rowSlug = rowRaw.map(slugify);
                let score = 0;

                if (rowSlug.some(s => s.includes('categoria') || s.includes('cat') || s.includes('classificacao'))) score += 3;
                if (rowSlug.some(s => s.includes('valor') || s.includes('total') || s.includes('liquido'))) score += 3;
                if (rowSlug.some(s => s === 'docnf' || s === 'nfdoc' || s === 'ndoc' || s === 'doc')) score += 2;
                if (rowSlug.some(s => s.includes('data') || s.includes('competencia'))) score += 2;
                
                const populatedCols = rowRaw.filter(c => c.trim().length > 0).length;
                if (populatedCols < 3) score -= 5;

                if (score > maxScore) {
                    maxScore = score;
                    bestHeaderRowIndex = i;
                }
            }
        }
    }

    if (allLines.length < 2) return [];

    const headers = parseCSVLine(allLines[bestHeaderRowIndex]).map(normalizeStr);
    const headersSlug = parseCSVLine(allLines[bestHeaderRowIndex]).map(slugify);

    // --- COLUMN FINDING HELPERS ---
    
    const findColBySlug = (targetSlugs: string[]) => headersSlug.findIndex(h => targetSlugs.includes(h));
    const findColLoose = (keywords: string[], exclude: string[] = []) => headers.findIndex(h => {
         if (exclude.some(ex => h.includes(ex))) return false;
         return keywords.some(k => h.includes(k));
    });
    
    const findColTiered = (tiers: string[][], exclude: string[] = []) => {
        for (const keywords of tiers) {
            const idx = headers.findIndex(h => {
                if (exclude.some(ex => h.includes(ex))) return false;
                return keywords.some(k => h.includes(k));
            });
            if (idx !== -1) return idx;
        }
        return -1;
    };

    // --- FIELD MAPPING ---

    const idCol = findColLoose(['id lancamento', 'id', 'identifier']);
    
    // PRIORITY to "Valor Liquido"
    let valCol = findColLoose(['valor liquido', 'valor liq', 'vlr liq', 'liq', 'valor líquido']);
    if (valCol === -1) {
        valCol = findColTiered([['valor', 'valor r$'], ['amount', 'total']], ['pago', 'previsto']);
    }

    // STATUS - STRICT PRIORITY to "Situacao"
    const statusCol = findColTiered([
        ['situacao', 'sit.'],
        ['status', 'st', 'estado', 'situação do pagamento'],
        ['pago', 'pgto', 'baixa', 'liquidacao']
    ], ['valor', 'data', 'dt', 'vencimento']);

    // CLIENT
    const clientCol = findColLoose(['sacado / cedente', 'sacado', 'cedente', 'cliente', 'tomador', 'razao social', 'nome fantasia']);
    
    // DOC / NF - EXACT MATCH PRIORITY
    let docCol = findColBySlug(['docnf', 'nfdoc', 'ndoc', 'numdoc']);
    if (docCol === -1) {
        docCol = findColTiered([
            ['nº doc', 'num doc', 'numero doc'],
            ['doc', 'documento', 'nf']
        ], ['data', 'dt', 'vencimento', 'emissao', 'status', 'tipo', 'obs', 'link', 'drive']);
    }
    
    const nfCol = findColTiered([['nota fiscal', 'nfs', 'nf-e'], ['nf']], ['data', 'status', 'link', 'doc']);
    
    // TITLE / DESCRIPTION
    const descCol = findColLoose(['titulo', 'descricao', 'historico', 'detalhe', 'descricao do lancamento']);

    // CATEGORY - Expanded keywords to avoid confusion with Description
    const catCol = findColLoose(['categoria', 'category', 'conta', 'classificacao', 'natureza', 'plano de contas'], ['descricao']);

    // TYPE - Expanded keywords
    const typeCol = findColLoose(['tipo de fatura', 'tipo', 'type', 'natureza', 'movimento', 'd/c']);

    const payDateCol = findColTiered([
        ['data pagamento', 'data pgto', 'dt pagamento', 'dt pgto', 'pagamento em'],
        ['pagamento']
    ], ['previsao', 'vencimento', 'status']);

    const vencPgtoCol = findColLoose(['venc / pagto', 'venc/pgto', 'venc / pgto'], ['status', 'dias']);
    const concCol = findColLoose(['conciliado', 'conciliacao']);

    const colMap = {
      id: idCol,
      doc: docCol,
      cat: catCol,
      comp: findColLoose(['empresa', 'company']),
      nf: nfCol,
      status: statusCol,
      client: clientCol,
      supplier: findColLoose(['fornecedor', 'prestador']),
      val: valCol,
      type: typeCol,
      due: findColLoose(['data de vencimento', 'vencimento']),
      billing: findColLoose(['data de faturamento', 'faturamento']),
      payment: payDateCol,
      vencPgto: vencPgtoCol,
      reconciled: concCol,
      competence: findColLoose(['competencia', 'mes']),
      related: findColLoose(['relacionado a', 'agrupamento']),
      cc: findColLoose(['centro de custo', 'cost center']),
      desc: descCol
    };

    if (colMap.cat === -1 || colMap.val === -1) {
         console.warn("Warning: Critical columns (Category or Value) missing", colMap);
    }

    const transactions: Transaction[] = [];

    for (let i = bestHeaderRowIndex + 1; i < allLines.length; i++) {
      if (!allLines[i].trim()) continue;
      const cols = parseCSVLine(allLines[i]);
      
      if (cols.length < 3) continue;

      // --- FOOTER / TOTALIZER ROW DETECTION ---
      // Ignora linhas que parecem ser totalizadores.
      // Regra: Se não tem CATEGORIA nem DATA, não é uma transação financeira válida.
      // Isso cobre o caso onde ID ou Cliente podem ser lidos erroneamente, ou onde o Totalizador tem apenas valores.
      const rawCat = colMap.cat > -1 ? cols[colMap.cat] : '';
      const rawDate = colMap.due > -1 ? cols[colMap.due] : '';
      const rawCompetence = colMap.competence > -1 ? cols[colMap.competence] : '';

      // Se Categoria vazia E (Data Vencimento vazia E Data Competência vazia) -> Ignora
      if (!rawCat.trim() && !rawDate.trim() && !rawCompetence.trim()) {
          continue;
      }
      // -----------------------------------------

      // --- ROBUST TYPE DETECTION ---
      // 1. Check explicit column "Tipo"
      const typeStr = (colMap.type > -1 ? cols[colMap.type] : '').toLowerCase();
      const typeNorm = normalizeStr(typeStr);
      
      let type: InvoiceType;
      const rawValue = parseValue(cols[colMap.val]);

      // Check for Transferencia / Ajuste
      if (typeNorm.includes('transfer') || typeNorm.includes('transf')) {
          type = InvoiceType.TRANSFERENCIA;
      } else if (typeNorm.includes('ajuste') || typeNorm.includes('saldo')) {
          type = InvoiceType.AJUSTE;
      } else {
          // Check for Rec/Desp
          let isExpense = false;

          // Rules for Expense:
          // A. Explicit "Despesa" or "Saída" string in Type column
          if (typeStr.includes('despesa') || typeStr.includes('saida') || typeStr.includes('debito') || typeStr.includes('pagamento')) {
              isExpense = true;
          } 
          // B. If Type is empty but Value is Negative -> Expense
          else if (rawValue < 0) {
              isExpense = true;
          }
          
          // Explicit "Receita" string overrides (unless value is clearly negative and signed)
          if (typeStr.includes('receita') || typeStr.includes('entrada') || typeStr.includes('credito')) {
              isExpense = false;
          }

          type = isExpense ? InvoiceType.DESPESA : InvoiceType.RECEITA;
      }
      
      // --- FINAL VALUE CALCULATION ---
      let finalValue = Math.abs(rawValue);
      
      // Apply sign based on type
      if (type === InvoiceType.DESPESA) {
          finalValue = -finalValue;
      } else if (type === InvoiceType.TRANSFERENCIA || type === InvoiceType.AJUSTE) {
          // Trust the raw value sign for transfers/adjustments, or default to raw
          finalValue = rawValue;
      }

      // --- STATUS DETECTION ---
      const statusRaw = (colMap.status > -1 ? cols[colMap.status] : '');
      const statusNorm = normalizeStr(statusRaw);
      
      let status = TransactionStatus.EM_ABERTO;
      
      if (
          statusNorm.includes('cancel') || 
          statusNorm.includes('anulad') || 
          statusNorm.includes('inativ') || 
          statusNorm.includes('void') || 
          statusNorm.includes('desfeito') ||
          statusNorm.includes('estorn')
      ) {
        status = TransactionStatus.CANCELADA;
      } else if (
          statusNorm.includes('quitad') || 
          statusNorm.includes('pago') || 
          statusNorm.includes('pag') || 
          statusNorm === 'ok' || 
          statusNorm.includes('sim') || 
          statusNorm === 's' ||
          statusNorm.includes('liquid') || 
          statusNorm.includes('compensad') ||
          statusNorm.includes('efetivad') ||
          statusNorm.includes('conciliad') ||
          statusNorm.includes('baixad') ||
          statusNorm.includes('realizad')
      ) {
        status = TransactionStatus.QUITADO;
      } 
      
      if (
          statusNorm.includes('agendad') || 
          statusNorm.includes('pendente') || 
          statusNorm.includes('programad') ||
          statusNorm.includes('provisionad') ||
          statusNorm.includes('vencer') ||
          statusNorm.includes('a pagar') 
      ) {
          status = TransactionStatus.EM_ABERTO;
      }

      const companyRaw = (colMap.comp > -1 ? cols[colMap.comp] : '');
      const companyNorm = normalizeStr(companyRaw);
      let company = CompanyType.NT; 

      if (companyNorm.includes('player') || companyNorm.includes('pl')) {
          company = CompanyType.PL;
      } else if (companyNorm.includes('tulos') || companyNorm.includes('tl')) {
          company = CompanyType.TL;
      } else if (companyNorm.includes('non') || companyNorm.includes('nt') || companyNorm.includes('trad')) {
          company = CompanyType.NT;
      }

      const rawCategory = colMap.cat > -1 ? cols[colMap.cat] : 'Sem Categoria';
      const cleanCategory = fixEncoding(rawCategory);

      const docVal = (colMap.doc > -1 && cols[colMap.doc]) ? cols[colMap.doc].trim() : '';
      const nfVal = (colMap.nf > -1 && cols[colMap.nf]) ? cols[colMap.nf].trim() : '';

      transactions.push({
        id: colMap.id > -1 ? cols[colMap.id] : `GEN-${i}`,
        docNumber: docVal,
        category: cleanCategory, 
        company: company,
        nf: nfVal,
        status: status,
        client: colMap.client > -1 ? cols[colMap.client] : '',
        supplier: colMap.supplier > -1 ? cols[colMap.supplier] : '',
        value: finalValue,
        type: type,
        dueDate: colMap.due > -1 ? parseDate(cols[colMap.due]) : '',
        billingDate: colMap.billing > -1 ? parseDate(cols[colMap.billing]) : '',
        paymentDate: colMap.payment > -1 ? parseDate(cols[colMap.payment]) : '',
        vencPgtoReal: colMap.vencPgto > -1 ? parseDate(cols[colMap.vencPgto]) : '',
        reconciled: colMap.reconciled > -1 ? cols[colMap.reconciled] : '',
        description: colMap.desc > -1 ? cols[colMap.desc] : '',
        competenceDate: colMap.competence > -1 ? parseDate(cols[colMap.competence]) : '',
        relatedTo: colMap.related > -1 ? cols[colMap.related] : '',
        costCenter: colMap.cc > -1 ? cols[colMap.cc] : ''
      });
    }

    return transactions;
  } catch (error: any) {
    console.error("Error parsing/loading sheet:", error);
    throw error;
  }
};

export const fetchCat2MappingFromSheet = async (spreadsheetId: string, gid: string): Promise<Cat2Mapping[]> => {
    try {
        const csvText = await fetchCSV(spreadsheetId, gid);
        const lines = csvText.split(/\r?\n/);
        if (lines.length < 2) return [];

        const headers = parseCSVLine(lines[0]).map(normalizeStr);
        const catCol = headers.findIndex(h => h.includes('lancamento') || h.includes('categoria') || h.includes('conta'));
        const cat2Col = headers.findIndex(h => h.includes('cat2') || h.includes('agrupamento'));

        if (catCol === -1 || cat2Col === -1) return [];

        const mapping: Cat2Mapping[] = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i]);
            if (cols[catCol] && cols[cat2Col]) {
                mapping.push({
                    category: fixEncoding(cols[catCol]), 
                    cat2: fixEncoding(cols[cat2Col])
                });
            }
        }
        return mapping;
    } catch (e) {
        console.error("Error fetching reference mapping:", e);
        return [];
    }
};

export const fetchCashFlowData = async (spreadsheetId: string, gid: string): Promise<CashFlow[]> => {
  try {
    const csvText = await fetchCSV(spreadsheetId, gid);
    const lines = csvText.split(/\r?\n/);
    
    let headerIndex = -1;
    for (let i=0; i < Math.min(lines.length, 20); i++) {
       const line = normalizeStr(lines[i]);
       if (line.includes('jan') && line.includes('fev') && line.includes('mar')) {
           headerIndex = i;
           break;
       }
    }

    let balanceIndex = -1;
    for (let i=0; i < lines.length; i++) {
        const firstCol = parseCSVLine(lines[i])[0];
        if (firstCol && normalizeStr(firstCol).startsWith('saldo geral')) {
            balanceIndex = i;
            break;
        }
    }

    if (balanceIndex === -1) {
        console.warn("Could not find 'Saldo geral' row");
        return [];
    }
    
    const headerRow = headerIndex > -1 ? parseCSVLine(lines[headerIndex]) : [];
    const balanceRow = parseCSVLine(lines[balanceIndex]);
    const cashFlows: CashFlow[] = [];

    for (let i = 1; i < balanceRow.length; i++) {
       const val = parseValue(balanceRow[i]);
       let dateStr = '';

       if (headerRow.length > i) {
           const h = headerRow[i];
           dateStr = parseDate(h); 
       }
       
       if (dateStr.includes('-') && dateStr.length === 10) {
           cashFlows.push({ competenceDate: dateStr, balance: val });
       }
    }
    
    if (cashFlows.length === 0 && headerIndex > -1) {
        const yearMatch = lines[headerIndex].match(/20\d{2}/);
        const year = yearMatch ? yearMatch[0] : new Date().getFullYear().toString();
        
        const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        
        for (let i = 1; i < balanceRow.length; i++) {
            const h = normalizeStr(headerRow[i] || '');
            const monthIdx = months.findIndex(m => h.includes(m));
            if (monthIdx > -1) {
                 const mStr = (monthIdx + 1).toString().padStart(2, '0');
                 cashFlows.push({
                     competenceDate: `${year}-${mStr}-01`,
                     balance: parseValue(balanceRow[i])
                 });
            }
        }
    }

    return cashFlows;

  } catch (e) {
    console.error("Error fetching Cash Flow:", e);
    return [];
  }
};

// --- PEOPLE DATA FETCHING ---
export const fetchPeopleData = async (spreadsheetId: string, gid: string): Promise<Person[]> => {
    const csvText = await fetchCSV(spreadsheetId, gid);
    const lines = csvText.split(/\r?\n/);
    
    // --- SMART HEADER DETECTION FOR PEOPLE ---
    let headerIdx = 0;
    if (lines.length > 0) {
        let maxScore = 0;
        // Scan first 15 lines
        for (let i=0; i < Math.min(lines.length, 15); i++) {
            const cols = parseCSVLine(lines[i]).map(slugify);
            let score = 0;
            if (cols.some(c => c.includes('nome'))) score += 2;
            if (cols.some(c => c.includes('salario'))) score += 2;
            if (cols.some(c => c.includes('extracao'))) score += 2;
            if (cols.some(c => c.includes('billable'))) score += 2;
            if (cols.some(c => c.includes('cpf') || c.includes('cnpj') || c.includes('doc'))) score += 2;
            
            if (score > maxScore) {
                maxScore = score;
                headerIdx = i;
            }
        }
    }

    if (lines.length < headerIdx + 2) return [];

    const headers = parseCSVLine(lines[headerIdx]).map(normalizeStr);
    
    // Map columns
    const find = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)));
    
    const colDtExtra = find(['dt_extracao', 'extracao', 'data extracao']);
    const colBill = find(['billable', 'nb', 'billable / nb']);
    const colName = find(['nome', 'funcionario', 'colaborador']);
    const colDoc = find(['cnpj', 'cpf', 'documento']);
    const colSal = find(['salario', 'valor']);
    const colAdm = find(['admissao', 'data de admissao', 'data admissao']);
    const colDem = find(['demissao', 'data de demissao', 'data demissao']);
    const colRole = find(['funcao', 'cargo']);
    const colEmail = find(['email']);
    const colSit = find(['situacao', 'status']);

    const people: Person[] = [];

    for (let i = headerIdx + 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 3) continue;

        const docRaw = colDoc > -1 ? cols[colDoc].trim() : '';
        const doc = docRaw.replace(/[^0-9a-zA-Z]/g, ''); // Clean Doc for strict key
        
        // Parse Dates
        const dtExtRaw = colDtExtra > -1 ? cols[colDtExtra].trim() : ''; 
        const extractionDate = parseExtractionDate(dtExtRaw); // Uses robust parser

        // Filter Step 1: Must have valid DOC AND Valid Date to be processed in calcs
        const isValid = !!doc && !!extractionDate;

        const billableRaw = colBill > -1 ? cols[colBill].trim() : '';
        const bLower = billableRaw.toLowerCase();
        
        let billableStatus: 'Billable' | 'NB' | '' = '';
        if (bLower.includes('nb') || bLower.includes('non')) {
            billableStatus = 'NB';
        } else if (bLower.includes('yes') || bLower.includes('sim') || bLower.includes('billable') || bLower === 'y' || bLower === 's') {
            billableStatus = 'Billable';
        }

        people.push({
            id: `P-${i}`,
            extractionDate,
            billableStatus,
            name: colName > -1 ? cols[colName] : '',
            doc: doc,
            salary: colSal > -1 ? parseValue(cols[colSal]) : 0,
            admissionDate: colAdm > -1 ? parseDate(cols[colAdm]) : '',
            terminationDate: colDem > -1 ? parseDate(cols[colDem]) : undefined,
            role: colRole > -1 ? cols[colRole] : '',
            email: colEmail > -1 ? cols[colEmail] : '',
            status: colSit > -1 ? cols[colSit] : '',
            isValid,
            isBillableMissing: !billableStatus,
            contractType: 'Outros', // Calculated later
            activeDays: 0,
            proportionality: 0,
            estimatedCost: 0
        });
    }

    return people;
};
