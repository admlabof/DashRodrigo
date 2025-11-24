
import React from 'react';
import { Transaction } from '../types';
import { formatCurrency } from '../services/dataService';

interface DrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  transactions: Transaction[];
}

const DrillDownModal: React.FC<DrillDownModalProps> = ({ isOpen, onClose, title, transactions }) => {
  if (!isOpen) return null;

  // Helper to convert data to CSV format
  const generateCSV = () => {
    const headers = ['Competence', 'Due Date', 'Company', 'Doc/NF', 'Entity', 'Category', 'Related To', 'Status', 'Value', 'Cost Center'];
    const rows = transactions.map(t => [
      t.competenceDate,
      t.dueDate,
      t.company,
      `${t.docNumber || ''} ${t.nf ? '/ ' + t.nf : ''}`,
      t.client || t.supplier || '',
      t.category,
      t.relatedTo || '',
      t.status,
      t.value.toString().replace('.', ','), // PT-BR Format for Excel
      t.costCenter || ''
    ]);

    const csvContent = [
      headers.join(';'), // Semicolon is better for PT-BR Excel
      ...rows.map(r => r.map(c => `"${c}"`).join(';'))
    ].join('\n');

    return csvContent;
  };

  const handleDownloadCSV = () => {
    const csv = generateCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${title.replace(/[^a-z0-9]/gi, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyToClipboard = () => {
    const headers = ['Competence', 'Due Date', 'Company', 'Doc/NF', 'Entity', 'Category', 'Related To', 'Status', 'Value', 'Cost Center'];
    const rows = transactions.map(t => [
      t.competenceDate,
      t.dueDate,
      t.company,
      `${t.docNumber || ''} ${t.nf ? '/ ' + t.nf : ''}`,
      t.client || t.supplier || '',
      t.category,
      t.relatedTo || '',
      t.status,
      t.value.toFixed(2).replace('.', ','),
      t.costCenter || ''
    ]);

    const text = [
      headers.join('\t'),
      ...rows.map(r => r.join('\t'))
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      alert('Dados copiados! Cole no Google Sheets ou Excel (Ctrl+V).');
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-11/12 max-w-6xl h-5/6 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-slate-50 rounded-t-lg">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-slate-800">{title}</h2>
            <div className="flex gap-2">
                <button 
                    onClick={handleCopyToClipboard}
                    className="px-3 py-1 bg-white border border-gray-300 rounded text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1"
                >
                    📋 Copiar
                </button>
                <button 
                    onClick={handleDownloadCSV}
                    className="px-3 py-1 bg-white border border-gray-300 rounded text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1"
                >
                    📥 Excel/CSV
                </button>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl font-bold">&times;</button>
        </div>
        
        <div className="flex-1 overflow-auto p-4">
          <table className="min-w-full text-sm text-left text-gray-600">
            <thead className="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
              <tr>
                <th className="px-4 py-3">Competência</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Doc / NF</th>
                <th className="px-4 py-3">Entidade</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Agrupamento</th>
                <th className="px-4 py-3">C. Custo</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="bg-white border-b hover:bg-gray-50">
                  <td className="px-4 py-2">{t.competenceDate}</td>
                  <td className="px-4 py-2">{t.dueDate}</td>
                  <td className="px-4 py-2">{t.company}</td>
                  <td className="px-4 py-2">{t.docNumber} {t.nf ? `/ ${t.nf}` : ''}</td>
                  <td className="px-4 py-2">{t.client || t.supplier || '-'}</td>
                  <td className="px-4 py-2">{t.category}</td>
                  <td className="px-4 py-2">{t.relatedTo || '-'}</td>
                  <td className="px-4 py-2">{t.costCenter || '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      t.status === 'Quitado' ? 'bg-green-100 text-green-800' : 
                      t.status === 'Em Aberto' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className={`px-4 py-2 text-right font-bold ${t.value < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(t.value)}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">Nenhuma transação encontrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-200 flex justify-end bg-gray-50 rounded-b-lg">
          <span className="font-bold text-slate-800">
            Total: {formatCurrency(transactions.reduce((acc, t) => acc + t.value, 0))}
          </span>
        </div>
      </div>
    </div>
  );
};

export default DrillDownModal;
