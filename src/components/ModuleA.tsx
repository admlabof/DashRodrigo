
import React, { useState, useMemo } from 'react';
import { Transaction, RepasseGroup, TransactionStatus, InvoiceType } from '../types';
import { processModuleA, formatCurrency } from '../services/dataService';
import DrillDownModal from './DrillDownModal';

interface ModuleAProps {
  transactions: Transaction[];
  relatedToFilter: 'ALL' | 'PRO' | 'MIN';
}

const ModuleA: React.FC<ModuleAProps> = ({ transactions, relatedToFilter }) => {
  const [drillDownData, setDrillDownData] = useState<{title: string, data: Transaction[]} | null>(null);
  const [activeTab, setActiveTab] = useState<'A1' | 'A2' | 'A3'>('A1');

  const groups = useMemo(() => processModuleA(transactions, relatedToFilter), [transactions, relatedToFilter]);

  // --- Sub-View Filtering Logic ---
  
  // A1: Recebido (Quitado) mas Saída em Aberto
  const dataA1 = groups.filter(g => 
    g.statusIn === TransactionStatus.QUITADO && 
    g.statusOut === TransactionStatus.EM_ABERTO
  );

  // A2: Pago Antes de Receber (Supplier Paid, Client Not Paid)
  const dataA2 = groups.filter(g => 
    g.statusOut === TransactionStatus.QUITADO && 
    g.statusIn !== TransactionStatus.QUITADO 
  );

  // A3: Pendência de NF (Either Client or Supplier missing Doc/NF)
  const dataA3 = groups.map(g => {
      const missingClientTxs = g.transactions.filter(t => t.type === InvoiceType.RECEITA && !t.docNumber && !t.nf);
      const missingSupplierTxs = g.transactions.filter(t => t.type === InvoiceType.DESPESA && !t.docNumber && !t.nf);
      
      return {
          ...g,
          missingClientTxs,
          missingSupplierTxs,
          hasIssues: missingClientTxs.length > 0 || missingSupplierTxs.length > 0
      };
  }).filter(g => g.hasIssues);

  const getCurrentData = () => {
    switch(activeTab) {
      case 'A1': return dataA1;
      case 'A2': return dataA2;
      case 'A3': return dataA3;
      default: return [];
    }
  };

  const currentData = getCurrentData();

  // --- EXPORT LOGIC ---
  const handleExport = (type: 'csv' | 'copy') => {
      const headers = [
          'Agrupamento', 
          ...(activeTab === 'A3' ? ['Pendências'] : []), 
          'Cliente', 'Fornecedor', 'Total Entrada', 'Total Saída', 'Saldo', 'Situação'
      ];

      const rows = currentData.map(g => {
          const pendencias = activeTab === 'A3' 
            ? `Forn: ${g.missingSupplierTxs?.length || 0} / Cli: ${g.missingClientTxs?.length || 0}` 
            : '';

          return [
            g.relatedTo,
            ...(activeTab === 'A3' ? [pendencias] : []),
            g.clientName || '',
            g.supplierName || '',
            g.totalIn.toFixed(2).replace('.', ','),
            g.totalOut.toFixed(2).replace('.', ','),
            g.balance.toFixed(2).replace('.', ','),
            activeTab === 'A1' ? 'Liberar Pgto' : activeTab === 'A2' ? 'Adiantado' : 'Sem NF'
          ];
      });

      if (type === 'copy') {
          const text = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
          navigator.clipboard.writeText(text).then(() => alert('Copiado para área de transferência! Cole no Excel/Sheets.'));
      } else {
          const csvContent = [headers.join(';'), ...rows.map(r => r.map(c => `"${c}"`).join(';'))].join('\n');
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `Relatorio_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex justify-between items-center border-b border-gray-200 pb-2">
        <div className="flex gap-2">
            {[
            { id: 'A1', label: 'A1 - Recebido (A Pagar)' },
            { id: 'A2', label: 'A2 - Pago Antes de Receber' },
            { id: 'A3', label: 'A3 - Pendência NF' },
            ].map(tab => (
            <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
                activeTab === tab.id 
                ? 'bg-white text-blue-600 border border-b-0 border-gray-200 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
                {tab.label}
            </button>
            ))}
        </div>
        <div className="flex gap-2">
             <button onClick={() => handleExport('copy')} className="text-xs flex items-center gap-1 text-gray-600 hover:text-blue-600 bg-white border px-2 py-1 rounded">
                 📋 Copiar
             </button>
             <button onClick={() => handleExport('csv')} className="text-xs flex items-center gap-1 text-gray-600 hover:text-green-600 bg-white border px-2 py-1 rounded">
                 📥 Excel
             </button>
        </div>
      </div>

      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agrupamento</th>
              {activeTab === 'A3' && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pendências (Sem DOC/NF)</th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fornecedor</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Entrada</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Saída</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Situação</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currentData.map((g: any) => (
              <tr 
                key={g.relatedTo} 
                className="hover:bg-blue-50 cursor-pointer transition-colors"
                onClick={() => setDrillDownData({ title: `Detalhes: ${g.relatedTo}`, data: g.transactions })}
              >
                <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{g.relatedTo}</td>
                
                {activeTab === 'A3' && (
                    <td className="px-6 py-4 text-xs">
                        <div className="flex flex-col gap-1">
                            {g.missingSupplierTxs && g.missingSupplierTxs.length > 0 && (
                                g.missingSupplierTxs.map((t: Transaction) => (
                                    <span key={t.id} className="bg-red-100 text-red-800 px-2 py-0.5 rounded border border-red-200 truncate max-w-[200px]">
                                        🔴 Forn: {t.supplier || 'Não Identificado'} ({formatCurrency(Math.abs(t.value))})
                                    </span>
                                ))
                            )}
                            {g.missingClientTxs && g.missingClientTxs.length > 0 && (
                                g.missingClientTxs.map((t: Transaction) => (
                                    <span key={t.id} className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-200 truncate max-w-[200px]">
                                        🔵 Cli: {t.client || 'Não Identificado'} ({formatCurrency(t.value)})
                                    </span>
                                ))
                            )}
                        </div>
                    </td>
                )}

                <td className="px-6 py-4 whitespace-nowrap text-gray-500">{g.clientName || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-500">{g.supplierName || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-green-600">{formatCurrency(g.totalIn)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-red-600">{formatCurrency(g.totalOut)}</td>
                <td className={`px-6 py-4 whitespace-nowrap text-right font-bold ${g.balance !== 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
                  {formatCurrency(g.balance)}
                  {g.balance !== 0 && <span className="ml-2 text-xs text-red-500">⚠️</span>}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                   <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                     activeTab === 'A1' 
                        ? 'bg-green-100 text-green-800' 
                        : activeTab === 'A2' 
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-red-100 text-red-800'
                   }`}>
                     {activeTab === 'A1' ? 'Liberar Pgto' : activeTab === 'A2' ? 'Adiantado' : 'Sem NF'}
                   </span>
                </td>
              </tr>
            ))}
            {currentData.length === 0 && (
              <tr>
                <td colSpan={activeTab === 'A3' ? 8 : 7} className="px-6 py-12 text-center text-gray-400">Nenhum registro encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <DrillDownModal 
        isOpen={!!drillDownData}
        onClose={() => setDrillDownData(null)}
        title={drillDownData?.title || ''}
        transactions={drillDownData?.data || []}
      />
    </div>
  );
};

export default ModuleA;
