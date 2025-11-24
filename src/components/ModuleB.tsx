
import React, { useMemo, useState } from 'react';
import { Transaction, Cat2Mapping, CashFlow } from '../types';
import { processModuleB1, processModuleB2, processModuleB3, processModuleB4, processModuleB5, formatCurrency } from '../services/dataService';
import DrillDownModal from './DrillDownModal';
import DataGridB6 from './DataGridB6';

interface ModuleBProps {
  transactions: Transaction[]; // Range Filtered
  yearTransactions: Transaction[]; // Full Year (Company/Status Filtered, but ignoring Date Range)
  rawTransactions: Transaction[]; // Full Raw Dataset (For B6)
  cashFlow: CashFlow[];
  filters: any;
  cat2Mapping: Cat2Mapping[];
  activeTab: 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6';
  setActiveTab: (tab: 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6') => void;
}

const ModuleB: React.FC<ModuleBProps> = ({ transactions, yearTransactions, rawTransactions, cashFlow, filters, cat2Mapping, activeTab, setActiveTab }) => {
  const [drillDownData, setDrillDownData] = useState<{title: string, data: any[]} | null>(null);
  
  // Repasse Filters
  const [filterB4Repasse, setFilterB4Repasse] = useState(true); // true = Com Repasse, false = Sem Repasse
  const [filterB5Repasse, setFilterB5Repasse] = useState(true);

  // B3 Sorting State
  const [sortConfigB3, setSortConfigB3] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'totalCurrent',
    direction: 'desc'
  });

  // B4 Sorting State
  const [sortConfigB4, setSortConfigB4] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'total',
    direction: 'desc'
  });

  // B5 Sorting State
  const [sortConfigB5, setSortConfigB5] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'total',
    direction: 'desc'
  });

  const currentYear = parseInt(filters.startDate.substring(0, 4));
  const currentMonth = parseInt(filters.endDate.substring(5, 7)) - 1; // 0-11

  // Month Range Calculation for B1 Table Display
  const startMonthIdx = parseInt(filters.startDate.substring(5, 7)) - 1;
  const endMonthIdx = parseInt(filters.endDate.substring(5, 7)) - 1;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const baseMonthName = monthNames[currentMonth];

  // --- DATA PROCESSING ---
  const dreLinesB1 = useMemo(() => processModuleB1(transactions, currentYear, currentMonth, cat2Mapping, cashFlow, endMonthIdx), [transactions, currentYear, currentMonth, cat2Mapping, cashFlow, endMonthIdx]);
  const dreLinesB2 = useMemo(() => processModuleB2(yearTransactions, currentYear, currentMonth, cat2Mapping, cashFlow), [yearTransactions, currentYear, currentMonth, cat2Mapping, cashFlow]);
  const rawTopClients = useMemo(() => processModuleB3(yearTransactions, currentYear, cat2Mapping), [yearTransactions, currentYear, cat2Mapping]);
  
  // Pass !filterB4Repasse as 'onlyRec' (Sem Repasse means Rec Only)
  const provisions = useMemo(() => processModuleB4(yearTransactions, filters.endDate, cat2Mapping, !filterB4Repasse), [yearTransactions, filters.endDate, cat2Mapping, filterB4Repasse]);
  const rawReceivables = useMemo(() => processModuleB5(yearTransactions, filters.endDate, cat2Mapping, !filterB5Repasse), [yearTransactions, filters.endDate, cat2Mapping, filterB5Repasse]);

  // Unidentified Clients Debug Data for B4
  const unidentifiedProvisions = useMemo(() => {
     const row = provisions.find(p => p.client === 'CLIENTE NÃO IDENTIFICADO');
     if (!row) return [];
     return [
         ...row.buckets.base.transactions,
         ...row.buckets.minus1.transactions,
         ...row.buckets.minus2.transactions,
         ...row.buckets.minus3.transactions,
         ...row.buckets.minus4.transactions,
         ...row.buckets.minus5.transactions,
         ...row.buckets.older.transactions,
     ].sort((a,b) => b.value - a.value);
  }, [provisions]);

  // Sort B3 Clients
  const topClients = useMemo(() => {
    const sorted = [...rawTopClients];
    sorted.sort((a, b) => {
        let valA: any = 0;
        let valB: any = 0;

        if (sortConfigB3.key === 'name') {
            valA = a.name.toLowerCase();
            valB = b.name.toLowerCase();
        } else if (sortConfigB3.key === 'totalCurrent') {
            valA = a.totalCurrent.value;
            valB = b.totalCurrent.value;
        } else if (sortConfigB3.key === 'totalPrev') {
            valA = a.totalPrev.value;
            valB = b.totalPrev.value;
        } else if (sortConfigB3.key.startsWith('month_')) {
            const idx = parseInt(sortConfigB3.key.split('_')[1]);
            valA = a.monthly[idx].value;
            valB = b.monthly[idx].value;
        }

        if (valA < valB) return sortConfigB3.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfigB3.direction === 'asc' ? 1 : -1;
        return 0;
    });
    return sorted;
  }, [rawTopClients, sortConfigB3]);

  // Sort B4 Provisions
  const sortedProvisions = useMemo(() => {
    const sorted = [...provisions];
    sorted.sort((a, b) => {
        let valA: any = 0;
        let valB: any = 0;

        switch(sortConfigB4.key) {
            case 'client': 
                valA = a.client.toLowerCase(); 
                valB = b.client.toLowerCase(); 
                break;
            case 'base': 
                valA = a.buckets.base.value; 
                valB = b.buckets.base.value; 
                break;
            case 'minus1': 
                valA = a.buckets.minus1.value; 
                valB = b.buckets.minus1.value; 
                break;
            case 'minus2': 
                valA = a.buckets.minus2.value; 
                valB = b.buckets.minus2.value; 
                break;
            case 'minus3': 
                valA = a.buckets.minus3.value; 
                valB = b.buckets.minus3.value; 
                break;
            case 'older': 
                valA = a.buckets.minus4.value + a.buckets.minus5.value + a.buckets.older.value;
                valB = b.buckets.minus4.value + b.buckets.minus5.value + b.buckets.older.value;
                break;
            case 'total': 
                valA = a.total.value; 
                valB = b.total.value; 
                break;
            default: 
                valA = a.total.value; 
                valB = b.total.value;
        }

        if (valA < valB) return sortConfigB4.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfigB4.direction === 'asc' ? 1 : -1;
        return 0;
    });
    return sorted;
  }, [provisions, sortConfigB4]);

  // Sort B5 Receivables
  const receivables = useMemo(() => {
    const sorted = [...rawReceivables];
    sorted.sort((a, b) => {
        let valA: any = 0;
        let valB: any = 0;
        
        switch(sortConfigB5.key) {
            case 'client': valA = a.client.toLowerCase(); valB = b.client.toLowerCase(); break;
            case 'overduePrev': valA = a.buckets.overduePrev.value; valB = b.buckets.overduePrev.value; break;
            case 'currentMonth': valA = a.buckets.currentMonth.value; valB = b.buckets.currentMonth.value; break;
            case 'month1': valA = a.buckets.month1.value; valB = b.buckets.month1.value; break;
            case 'month2': valA = a.buckets.month2.value; valB = b.buckets.month2.value; break;
            case 'month3': valA = a.buckets.month3.value; valB = b.buckets.month3.value; break;
            case 'future': valA = a.buckets.future.value; valB = b.buckets.future.value; break;
            case 'total': valA = a.total.value; valB = b.total.value; break;
            default: valA = a.total.value; valB = b.total.value;
        }

        if (valA < valB) return sortConfigB5.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfigB5.direction === 'asc' ? 1 : -1;
        return 0;
    });
    return sorted;
  }, [rawReceivables, sortConfigB5]);


  // Helper to open drilldown
  const handleDrill = (title: string, txs: Transaction[]) => {
      if(txs && txs.length > 0) {
          setDrillDownData({ title, data: txs });
      }
  };

  // Sorting Helpers
  const handleSortB3 = (key: string) => {
      setSortConfigB3(prev => ({
          key,
          direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
      }));
  };

  const handleSortB4 = (key: string) => {
    setSortConfigB4(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleSortB5 = (key: string) => {
    setSortConfigB5(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const renderSortArrow = (key: string, config: {key: string, direction: 'asc'|'desc'}) => {
      if (config.key !== key) return <span className="text-gray-300 ml-1 text-[10px]">⇅</span>;
      return <span className="text-blue-600 ml-1 text-[10px]">{config.direction === 'asc' ? '▲' : '▼'}</span>;
  };

  // --- EXPORT LOGIC ---
  const handleExport = (type: 'csv' | 'copy') => {
    let headers: string[] = [];
    let rows: (string|number)[] [] = [];
    let fileName = `Relatorio_${activeTab}_${filters.endDate}`;

    const fmt = (v: number) => v.toFixed(2).replace('.', ',');

    if (activeTab === 'B1') {
        headers = ['Categoria', ...monthNames.slice(startMonthIdx, endMonthIdx + 1), 'Total Período'];
        rows = dreLinesB1.map(l => [
            l.label,
            ...l.values.slice(startMonthIdx, endMonthIdx + 1).map(b => fmt(b.value)),
            fmt(l.total.value)
        ]);
    } else if (activeTab === 'B2') {
        headers = ['Categoria', 'Mes Ant', 'Mes Base', 'Prox Mes', 'Mes +2', 'YTD', 'Total Ano', 'Orcamento', 'Ano Ant', 'Var'];
        rows = dreLinesB2.map(l => [
            l.label,
            fmt(l.prevMonthVal?.value || 0),
            fmt(l.currMonthVal?.value || 0),
            fmt(l.nextMonthVal?.value || 0),
            fmt(l.nextMonthPlus1Val?.value || 0),
            fmt(l.ytd.value),
            fmt(l.yearTotal?.value || 0),
            fmt(l.budgetTotal || 0),
            fmt(l.lastYearTotal || 0),
            l.varYear ? l.varYear.toFixed(1) + '%' : '-'
        ]);
    } else if (activeTab === 'B3') {
        headers = ['Cliente', ...monthNames, 'Total Atual', 'Total Ant'];
        rows = topClients.map(c => [
            c.name,
            ...c.monthly.map(m => fmt(m.value)),
            fmt(c.totalCurrent.value),
            fmt(c.totalPrev.value)
        ]);
    } else if (activeTab === 'B4') {
        headers = ['Cliente', '0-30d', '31-60d', '61-90d', '91-120d', 'Antigos', 'Total'];
        rows = sortedProvisions.map(p => [
            p.client,
            fmt(p.buckets.base.value),
            fmt(p.buckets.minus1.value),
            fmt(p.buckets.minus2.value),
            fmt(p.buckets.minus3.value),
            fmt(p.buckets.minus4.value + p.buckets.minus5.value + p.buckets.older.value),
            fmt(p.total.value)
        ]);
    } else if (activeTab === 'B5') {
        headers = ['Cliente', 'Atrasado Ant', 'Mes Atual', 'M+1', 'M+2', 'M+3', 'Futuro', 'Total'];
        rows = receivables.map(r => [
            r.client,
            fmt(r.buckets.overduePrev.value),
            fmt(r.buckets.currentMonth.value),
            fmt(r.buckets.month1.value),
            fmt(r.buckets.month2.value),
            fmt(r.buckets.month3.value),
            fmt(r.buckets.future.value),
            fmt(r.total.value)
        ]);
    }

    if (activeTab === 'B6') {
         alert("Para B6, utilize as funções de exportação do próprio grid se disponível, ou copie os dados.");
         return;
    }

    if (type === 'copy') {
        const text = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
        navigator.clipboard.writeText(text).then(() => alert('Copiado para área de transferência!'));
    } else {
        const csvContent = [headers.join(';'), ...rows.map(r => r.map(c => `"${c}"`).join(';'))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${fileName}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex justify-between items-center gap-2 border-b border-gray-200 pb-2 overflow-x-auto">
        <div className="flex gap-2">
            {[
                {id: 'B1', label: 'B1 - DRE Mensal'},
                {id: 'B2', label: 'B2 - Acumulado'},
                {id: 'B3', label: 'B3 - Rec. Cliente'},
                {id: 'B4', label: 'B4 - Provisões'},
                {id: 'B5', label: 'B5 - A Receber'},
                {id: 'B6', label: 'B6 - BD Puro'},
            ].map(tab => (
                <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)} 
                    className={`px-4 py-2 rounded-t-lg font-medium text-sm whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-blue-600 border border-b-0 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    {tab.label}
                </button>
            ))}
        </div>
        
        {activeTab !== 'B6' && (
            <div className="flex gap-2 shrink-0">
                <button onClick={() => handleExport('copy')} className="text-xs flex items-center gap-1 text-gray-600 hover:text-blue-600 bg-white border px-2 py-1 rounded">
                    📋 Copiar
                </button>
                <button onClick={() => handleExport('csv')} className="text-xs flex items-center gap-1 text-gray-600 hover:text-green-600 bg-white border px-2 py-1 rounded">
                    📥 Excel
                </button>
            </div>
        )}
      </div>

      {/* --- B1 VIEW --- */}
      {activeTab === 'B1' && (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left font-bold text-slate-700 sticky left-0 bg-slate-100 z-10 border-r min-w-[200px]">Cat2 / Calculado</th>
                {monthNames.map((m, i) => {
                   if (i < startMonthIdx || i > endMonthIdx) return null;
                   return <th key={m} className="px-2 py-3 text-right font-medium text-gray-600 w-20">{m}</th>
                })}
                <th className="px-4 py-3 text-right font-bold text-slate-700 bg-slate-50 border-l">Total Período</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dreLinesB1.map((line, idx) => {
                 if(!line.label) return <tr key={idx} className="bg-white"><td colSpan={15} className="py-1"></td></tr>;
                 
                 const isHeader = line.isHeader;
                 const isBold = line.isCalculated || line.label.includes('LUCRO') || isHeader;
                 const isTotal = line.label.includes('LUCRO') || line.label.includes('Caixa') || line.label === 'Receita';
                 const rowBg = isHeader ? 'bg-gray-100' : isTotal ? 'bg-slate-50' : '';

                 return (
                  <tr key={idx} className={`hover:bg-blue-50 transition-colors ${rowBg}`}>
                    <td className={`px-4 py-2 border-r sticky left-0 z-10 truncate ${isHeader ? 'bg-gray-100 font-black text-slate-700 uppercase tracking-wider' : 'bg-inherit'} ${!isHeader && isBold ? 'font-bold text-slate-800' : 'text-gray-600'}`}>
                      {line.label}
                    </td>
                    {line.values.map((b, i) => {
                       if (i < startMonthIdx || i > endMonthIdx) return null;
                       return (
                          <td 
                            key={i} 
                            onClick={() => handleDrill(`${line.label} (${monthNames[i]})`, b.transactions)}
                            className={`px-2 py-2 text-right ${!isHeader ? 'cursor-pointer hover:text-blue-600 hover:bg-blue-100' : 'font-bold text-slate-700'} ${b.value < 0 ? 'text-red-500' : ''}`}
                          >
                            {b.value !== 0 ? formatCurrency(b.value) : (isHeader ? formatCurrency(0) : '-')}
                          </td>
                       );
                    })}
                    <td 
                        onClick={() => handleDrill(`${line.label} (Total Período)`, line.total.transactions)}
                        className={`px-4 py-2 text-right border-l cursor-pointer hover:bg-blue-100 ${isHeader ? 'bg-gray-200 font-bold' : 'bg-slate-50 font-bold'}`}
                    >
                        {formatCurrency(line.total.value)}
                    </td>
                  </tr>
                 );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* --- B2 VIEW --- */}
      {activeTab === 'B2' && (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left font-bold text-slate-700 sticky left-0 bg-slate-100 z-10 border-r min-w-[200px]">Cat2 / Calculado</th>
                <th className="px-4 py-3 text-right text-gray-500">Mês Ant.</th>
                <th className="px-4 py-3 text-right font-bold text-blue-700 bg-blue-50 border-x border-blue-100">Mês Base ({baseMonthName})</th>
                <th className="px-4 py-3 text-right text-gray-500">Próx. Mês</th>
                <th className="px-4 py-3 text-right text-gray-500">Mês +2</th>
                <th className="w-4"></th>
                <th className="px-4 py-3 text-right font-bold text-slate-800">Acumulado (YTD)</th>
                <th className="px-4 py-3 text-right font-bold text-slate-800">Total Ano</th>
                <th className="px-4 py-3 text-right text-gray-500">Orçamento</th>
                <th className="px-4 py-3 text-right text-gray-500">Ano Ant.</th>
                <th className="px-4 py-3 text-right text-gray-500">Var % Ano</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dreLinesB2.map((line, idx) => {
                 if(!line.label) return <tr key={idx}><td colSpan={12} className="py-1"></td></tr>;
                 
                 const isHeader = line.isHeader;
                 const isBold = line.isCalculated || isHeader;
                 const rowBg = isHeader ? 'bg-gray-100' : '';
                 
                 return (
                  <tr key={idx} className={`hover:bg-blue-50 ${rowBg}`}>
                    <td className={`px-4 py-2 border-r sticky left-0 z-10 ${isHeader ? 'bg-gray-100 font-black text-slate-700 uppercase' : 'bg-inherit'} ${!isHeader && isBold ? 'font-bold' : ''}`}>
                        {line.label}
                    </td>
                    <td 
                        onClick={() => handleDrill(`${line.label} (Mês Ant.)`, line.prevMonthVal?.transactions || [])}
                        className={`px-4 py-2 text-right cursor-pointer hover:text-blue-600 ${isHeader ? 'font-bold' : 'text-gray-500'}`}
                    >
                        {formatCurrency(line.prevMonthVal?.value || 0)}
                    </td>
                    <td 
                        onClick={() => handleDrill(`${line.label} (Mês Base)`, line.currMonthVal?.transactions || [])}
                        className={`px-4 py-2 text-right cursor-pointer hover:text-blue-600 ${isHeader ? 'font-bold bg-gray-200' : 'font-bold text-slate-800 bg-blue-50 border-x border-blue-100'}`}
                    >
                        {formatCurrency(line.currMonthVal?.value || 0)}
                    </td>
                    <td 
                        onClick={() => handleDrill(`${line.label} (Próx. Mês)`, line.nextMonthVal?.transactions || [])}
                        className={`px-4 py-2 text-right cursor-pointer hover:text-blue-600 ${isHeader ? 'font-bold' : 'text-gray-500'}`}
                    >
                        {formatCurrency(line.nextMonthVal?.value || 0)}
                    </td>
                    <td 
                        onClick={() => handleDrill(`${line.label} (Mês +2)`, line.nextMonthPlus1Val?.transactions || [])}
                        className={`px-4 py-2 text-right cursor-pointer hover:text-blue-600 ${isHeader ? 'font-bold' : 'text-gray-500'}`}
                    >
                        {formatCurrency(line.nextMonthPlus1Val?.value || 0)}
                    </td>
                    <td className={isHeader ? 'bg-gray-100' : 'bg-slate-50'}></td>
                    <td 
                        onClick={() => handleDrill(`${line.label} (YTD)`, line.ytd.transactions)}
                        className={`px-4 py-2 text-right cursor-pointer hover:text-blue-600 ${isHeader ? 'font-bold' : 'font-medium'}`}
                    >
                        {formatCurrency(line.ytd.value)}
                    </td>
                    <td 
                        onClick={() => handleDrill(`${line.label} (Total Ano)`, line.yearTotal?.transactions || [])}
                        className={`px-4 py-2 text-right cursor-pointer hover:text-blue-600 font-bold`}
                    >
                        {formatCurrency(line.yearTotal?.value || 0)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">{!isHeader && line.budgetTotal ? formatCurrency(line.budgetTotal) : '-'}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{!isHeader && line.lastYearTotal ? formatCurrency(line.lastYearTotal) : '-'}</td>
                    <td className={`px-4 py-2 text-right ${!isHeader && line.varYear && line.varYear > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {!isHeader && line.varYear ? line.varYear.toFixed(1) + '%' : '-'}
                    </td>
                  </tr>
                 );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* --- B3 VIEW --- */}
      {activeTab === 'B3' && (
         <div className="bg-white rounded shadow overflow-x-auto">
         <table className="min-w-full divide-y divide-gray-200 text-sm">
           <thead className="bg-slate-100">
             <tr>
               <th 
                 onClick={() => handleSortB3('name')}
                 className="px-6 py-3 text-left font-bold text-slate-700 cursor-pointer hover:bg-slate-200 select-none"
               >
                  Cliente {renderSortArrow('name', sortConfigB3)}
               </th>
               {monthNames.map((m, i) => (
                 <th 
                    key={m} 
                    onClick={() => handleSortB3(`month_${i}`)}
                    className="px-2 py-3 text-right font-medium text-gray-600 text-xs cursor-pointer hover:bg-slate-200 select-none w-16"
                 >
                    {m} {renderSortArrow(`month_${i}`, sortConfigB3)}
                 </th>
               ))}
               <th 
                 onClick={() => handleSortB3('totalCurrent')}
                 className="px-6 py-3 text-right font-bold text-slate-700 border-l cursor-pointer hover:bg-slate-200 select-none"
               >
                 Total {currentYear} {renderSortArrow('totalCurrent', sortConfigB3)}
               </th>
               <th 
                 onClick={() => handleSortB3('totalPrev')}
                 className="px-6 py-3 text-right font-medium text-gray-500 cursor-pointer hover:bg-slate-200 select-none"
               >
                 Total Ant. {renderSortArrow('totalPrev', sortConfigB3)}
               </th>
             </tr>
           </thead>
           <tbody className="divide-y divide-gray-100">
             {topClients.map((client) => (
               <tr key={client.name} className="hover:bg-blue-50 group">
                 <td className="px-6 py-2 font-medium text-gray-800">{client.name}</td>
                 {client.monthly.map((b, i) => (
                   <td 
                      key={i} 
                      onClick={() => handleDrill(`Rec: ${client.name} (${monthNames[i]})`, b.transactions)}
                      className={`px-2 py-2 text-right text-xs text-gray-600 cursor-pointer hover:text-blue-600 hover:bg-blue-100 ${b.value ? 'underline decoration-dotted decoration-gray-300' : ''}`}
                    >
                      {b.value > 0 ? formatCurrency(b.value) : '-'}
                   </td>
                 ))}
                 <td 
                    onClick={() => handleDrill(`Rec Total: ${client.name}`, client.totalCurrent.transactions)}
                    className="px-6 py-2 text-right font-bold text-slate-800 border-l bg-slate-50 cursor-pointer hover:bg-blue-100"
                 >
                    {formatCurrency(client.totalCurrent.value)}
                 </td>
                 <td 
                    onClick={() => handleDrill(`Rec Ano Ant: ${client.name}`, client.totalPrev.transactions)}
                    className="px-6 py-2 text-right text-gray-500 cursor-pointer hover:bg-blue-100"
                 >
                    {formatCurrency(client.totalPrev.value)}
                 </td>
               </tr>
             ))}
           </tbody>
           <tfoot className="bg-slate-200 font-bold text-slate-800">
                <tr>
                    <td className="px-6 py-3">TOTAL</td>
                    {Array.from({length: 12}).map((_, i) => {
                        const totalMonth = topClients.reduce((acc, c) => acc + c.monthly[i].value, 0);
                        return (
                            <td key={i} className="px-2 py-3 text-right text-xs">
                                {formatCurrency(totalMonth)}
                            </td>
                        );
                    })}
                    <td className="px-6 py-3 text-right border-l border-slate-300">
                        {formatCurrency(topClients.reduce((acc, c) => acc + c.totalCurrent.value, 0))}
                    </td>
                    <td className="px-6 py-3 text-right">
                         {formatCurrency(topClients.reduce((acc, c) => acc + c.totalPrev.value, 0))}
                    </td>
                </tr>
           </tfoot>
         </table>
       </div>
      )}

      {/* --- B4 VIEW (PROVISIONS) --- */}
      {activeTab === 'B4' && (
        <div className="space-y-4">
            <div className="bg-white rounded shadow overflow-hidden">
                <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                    <div className="text-sm text-yellow-800">
                        ⚠️ Receitas <b>sem NF</b> ou com <b>Faturamento Futuro</b> (Posterior a {filters.endDate})
                    </div>
                    <div className="flex bg-white rounded-md border border-gray-300 overflow-hidden">
                        <button 
                            onClick={() => setFilterB4Repasse(true)}
                            className={`px-3 py-1 text-xs font-medium transition-colors ${filterB4Repasse ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100 text-gray-600'}`}
                        >
                            Com Repasse
                        </button>
                        <div className="w-px bg-gray-300"></div>
                        <button 
                            onClick={() => setFilterB4Repasse(false)}
                            className={`px-3 py-1 text-xs font-medium transition-colors ${!filterB4Repasse ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100 text-gray-600'}`}
                        >
                            Sem Repasse
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-slate-100">
                            <tr>
                                <th 
                                    onClick={() => handleSortB4('client')}
                                    className="px-6 py-3 text-left font-bold text-slate-700 cursor-pointer hover:bg-slate-200 select-none"
                                >
                                    Cliente {renderSortArrow('client', sortConfigB4)}
                                </th>
                                <th 
                                    onClick={() => handleSortB4('base')}
                                    className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200 select-none"
                                >
                                    Mês Base (0-30d) {renderSortArrow('base', sortConfigB4)}
                                </th>
                                <th 
                                    onClick={() => handleSortB4('minus1')}
                                    className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200 select-none"
                                >
                                    Mês -1 (31-60d) {renderSortArrow('minus1', sortConfigB4)}
                                </th>
                                <th 
                                    onClick={() => handleSortB4('minus2')}
                                    className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200 select-none"
                                >
                                    Mês -2 (61-90d) {renderSortArrow('minus2', sortConfigB4)}
                                </th>
                                <th 
                                    onClick={() => handleSortB4('minus3')}
                                    className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200 select-none"
                                >
                                    Mês -3 (91-120d) {renderSortArrow('minus3', sortConfigB4)}
                                </th>
                                <th 
                                    onClick={() => handleSortB4('older')}
                                    className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200 select-none"
                                >
                                    Antigos (+120d) {renderSortArrow('older', sortConfigB4)}
                                </th>
                                <th 
                                    onClick={() => handleSortB4('total')}
                                    className="px-4 py-3 text-right font-bold border-l cursor-pointer hover:bg-slate-200 select-none"
                                >
                                    Total {renderSortArrow('total', sortConfigB4)}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {sortedProvisions.map((row) => {
                                const olderVal = row.buckets.minus4.value + row.buckets.minus5.value + row.buckets.older.value;
                                const olderTxs = [...row.buckets.minus4.transactions, ...row.buckets.minus5.transactions, ...row.buckets.older.transactions];
                                
                                return (
                                <tr key={row.client} className="hover:bg-blue-50">
                                    <td className="px-6 py-3 font-medium text-slate-800">{row.client}</td>
                                    
                                    {[row.buckets.base, row.buckets.minus1, row.buckets.minus2, row.buckets.minus3].map((b, i) => (
                                        <td key={i} 
                                            onClick={() => handleDrill(`Provisão: ${row.client}`, b.transactions)}
                                            className="px-4 py-3 text-right cursor-pointer hover:bg-blue-100 hover:text-blue-600"
                                        >
                                            {b.value ? formatCurrency(b.value) : '-'}
                                        </td>
                                    ))}
                                    
                                    <td 
                                        onClick={() => handleDrill(`Provisão Antiga: ${row.client}`, olderTxs)}
                                        className="px-4 py-3 text-right text-red-500 cursor-pointer hover:bg-blue-100"
                                    >
                                        {olderVal > 0 ? formatCurrency(olderVal) : '-'}
                                    </td>
                                    <td 
                                        onClick={() => handleDrill(`Total Provisão: ${row.client}`, row.total.transactions)}
                                        className="px-4 py-3 text-right font-bold border-l bg-slate-50 cursor-pointer hover:bg-blue-100"
                                    >
                                        {formatCurrency(row.total.value)}
                                    </td>
                                </tr>
                            )})}
                            {provisions.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">Nenhuma provisão encontrada.</td></tr>}
                        </tbody>
                        <tfoot className="bg-slate-200 font-bold text-slate-800">
                            <tr>
                                <td className="px-6 py-3">TOTAL</td>
                                <td className="px-4 py-3 text-right">{formatCurrency(provisions.reduce((a,r) => a + r.buckets.base.value, 0))}</td>
                                <td className="px-4 py-3 text-right">{formatCurrency(provisions.reduce((a,r) => a + r.buckets.minus1.value, 0))}</td>
                                <td className="px-4 py-3 text-right">{formatCurrency(provisions.reduce((a,r) => a + r.buckets.minus2.value, 0))}</td>
                                <td className="px-4 py-3 text-right">{formatCurrency(provisions.reduce((a,r) => a + r.buckets.minus3.value, 0))}</td>
                                <td className="px-4 py-3 text-right text-red-600">{formatCurrency(provisions.reduce((a,r) => a + r.buckets.minus4.value + r.buckets.minus5.value + r.buckets.older.value, 0))}</td>
                                <td className="px-4 py-3 text-right border-l border-slate-300">{formatCurrency(provisions.reduce((a,r) => a + r.total.value, 0))}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* DEBUG TABLE FOR UNIDENTIFIED CLIENTS */}
            {unidentifiedProvisions.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-4">
                    <h4 className="text-red-800 font-bold text-sm mb-2">🔍 Detalhamento de "CLIENTE NÃO IDENTIFICADO" (Debug)</h4>
                    <div className="overflow-x-auto max-h-60">
                        <table className="min-w-full text-xs text-left">
                            <thead className="bg-red-100 text-red-900 sticky top-0">
                                <tr>
                                    <th className="px-2 py-1">ID</th>
                                    <th className="px-2 py-1">Data</th>
                                    <th className="px-2 py-1">Título / Descrição</th>
                                    <th className="px-2 py-1">Doc / NF</th>
                                    <th className="px-2 py-1">Entidade Original</th>
                                    <th className="px-2 py-1 text-right">Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {unidentifiedProvisions.map(t => (
                                    <tr key={t.id} className="border-b border-red-100 hover:bg-red-100">
                                        <td className="px-2 py-1">{t.id}</td>
                                        <td className="px-2 py-1">{t.competenceDate}</td>
                                        <td className="px-2 py-1 truncate max-w-[200px]">{t.description || t.category}</td>
                                        <td className="px-2 py-1">{t.docNumber} {t.nf}</td>
                                        <td className="px-2 py-1">{t.client || t.supplier}</td>
                                        <td className="px-2 py-1 text-right font-bold">{formatCurrency(t.value)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
      )}

      {/* --- B5 VIEW (RECEIVABLES) --- */}
      {activeTab === 'B5' && (
         <div className="bg-white rounded shadow overflow-hidden">
             <div className="p-3 bg-green-50 border-b border-green-200 flex justify-between items-center">
                <div className="text-sm text-green-800">
                    💰 Receitas Faturadas (Com NF) mas Em Aberto.
                </div>
                <div className="flex bg-white rounded-md border border-gray-300 overflow-hidden">
                    <button 
                        onClick={() => setFilterB5Repasse(true)}
                        className={`px-3 py-1 text-xs font-medium transition-colors ${filterB5Repasse ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100 text-gray-600'}`}
                    >
                        Com Repasse
                    </button>
                    <div className="w-px bg-gray-300"></div>
                    <button 
                        onClick={() => setFilterB5Repasse(false)}
                        className={`px-3 py-1 text-xs font-medium transition-colors ${!filterB5Repasse ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100 text-gray-600'}`}
                    >
                        Sem Repasse
                    </button>
                </div>
            </div>
             <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-slate-100">
                        <tr>
                            <th 
                                onClick={() => handleSortB5('client')}
                                className="px-6 py-3 text-left font-bold text-slate-700 cursor-pointer hover:bg-slate-200 select-none"
                            >
                                Cliente {renderSortArrow('client', sortConfigB5)}
                            </th>
                            <th 
                                onClick={() => handleSortB5('overduePrev')}
                                className="px-4 py-3 text-right text-red-600 cursor-pointer hover:bg-slate-200 select-none"
                            >
                                Atrasado (Anterior) {renderSortArrow('overduePrev', sortConfigB5)}
                            </th>
                            <th 
                                onClick={() => handleSortB5('currentMonth')}
                                className="px-4 py-3 text-right text-orange-600 font-semibold border-l border-orange-200 bg-orange-50 cursor-pointer hover:bg-orange-100 select-none"
                            >
                                Mês Atual {renderSortArrow('currentMonth', sortConfigB5)}
                            </th>
                            <th 
                                onClick={() => handleSortB5('month1')}
                                className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200 select-none"
                            >
                                Mês +1 {renderSortArrow('month1', sortConfigB5)}
                            </th>
                            <th 
                                onClick={() => handleSortB5('month2')}
                                className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200 select-none"
                            >
                                Mês +2 {renderSortArrow('month2', sortConfigB5)}
                            </th>
                            <th 
                                onClick={() => handleSortB5('month3')}
                                className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200 select-none"
                            >
                                Mês +3 {renderSortArrow('month3', sortConfigB5)}
                            </th>
                            <th 
                                onClick={() => handleSortB5('future')}
                                className="px-4 py-3 text-right cursor-pointer hover:bg-slate-200 select-none"
                            >
                                Futuro {renderSortArrow('future', sortConfigB5)}
                            </th>
                            <th 
                                onClick={() => handleSortB5('total')}
                                className="px-4 py-3 text-right font-bold border-l cursor-pointer hover:bg-slate-200 select-none"
                            >
                                Total {renderSortArrow('total', sortConfigB5)}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {receivables.map((row) => (
                            <tr key={row.client} className="hover:bg-blue-50">
                                <td className="px-6 py-3 font-medium text-slate-800">{row.client}</td>
                                
                                <td 
                                    onClick={() => handleDrill(`Atrasado (Ant): ${row.client}`, row.buckets.overduePrev.transactions)}
                                    className="px-4 py-3 text-right cursor-pointer hover:bg-red-100 hover:text-red-700 text-red-600 font-bold"
                                >
                                    {row.buckets.overduePrev.value ? formatCurrency(row.buckets.overduePrev.value) : '-'}
                                </td>

                                <td 
                                    onClick={() => handleDrill(`Mês Atual: ${row.client}`, row.buckets.currentMonth.transactions)}
                                    className="px-4 py-3 text-right cursor-pointer hover:bg-orange-100 hover:text-orange-700 text-orange-600 font-semibold bg-orange-50 border-l border-orange-200"
                                >
                                    {row.buckets.currentMonth.value ? formatCurrency(row.buckets.currentMonth.value) : '-'}
                                </td>
                                
                                {[row.buckets.month1, row.buckets.month2, row.buckets.month3, row.buckets.future].map((b, i) => (
                                    <td key={i}
                                        onClick={() => handleDrill(`Recebível: ${row.client}`, b.transactions)}
                                        className={`px-4 py-3 text-right cursor-pointer hover:bg-blue-100 hover:text-blue-600 ${i === 3 ? 'text-gray-500' : ''}`}
                                    >
                                        {b.value ? formatCurrency(b.value) : '-'}
                                    </td>
                                ))}
                                
                                <td 
                                    onClick={() => handleDrill(`Total Recebível: ${row.client}`, row.total.transactions)}
                                    className="px-4 py-3 text-right font-bold border-l bg-slate-50 cursor-pointer hover:bg-blue-100"
                                >
                                    {formatCurrency(row.total.value)}
                                </td>
                            </tr>
                        ))}
                        {receivables.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-gray-400">Nenhum valor a receber encontrado.</td></tr>}
                    </tbody>
                    <tfoot className="bg-slate-200 font-bold text-slate-800">
                        <tr>
                            <td className="px-6 py-3">TOTAL</td>
                            <td className="px-4 py-3 text-right text-red-700">{formatCurrency(receivables.reduce((a,r) => a + r.buckets.overduePrev.value, 0))}</td>
                            <td className="px-4 py-3 text-right text-orange-700">{formatCurrency(receivables.reduce((a,r) => a + r.buckets.currentMonth.value, 0))}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(receivables.reduce((a,r) => a + r.buckets.month1.value, 0))}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(receivables.reduce((a,r) => a + r.buckets.month2.value, 0))}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(receivables.reduce((a,r) => a + r.buckets.month3.value, 0))}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(receivables.reduce((a,r) => a + r.buckets.future.value, 0))}</td>
                            <td className="px-4 py-3 text-right border-l border-slate-300">{formatCurrency(receivables.reduce((a,r) => a + r.total.value, 0))}</td>
                        </tr>
                    </tfoot>
                </table>
             </div>
         </div>
      )}

      {/* --- B6 VIEW (BD Puro) --- */}
      {activeTab === 'B6' && (
        <div className="bg-white rounded shadow border border-gray-200 h-[600px]">
            <DataGridB6 transactions={rawTransactions} />
        </div>
      )}
       
      <DrillDownModal 
        isOpen={!!drillDownData}
        onClose={() => setDrillDownData(null)}
        title={drillDownData?.title || ''}
        transactions={drillDownData?.data || []}
      />
    </div>
  );
};

export default ModuleB;
