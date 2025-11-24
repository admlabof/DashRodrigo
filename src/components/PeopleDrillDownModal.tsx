
import React from 'react';
import { Person } from '../types';
import { formatCurrency } from '../services/dataService';

interface PeopleDrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  people: Person[];
}

const PeopleDrillDownModal: React.FC<PeopleDrillDownModalProps> = ({ isOpen, onClose, title, people }) => {
  if (!isOpen) return null;

  const handleCopyToClipboard = () => {
    const headers = ['Mês Ref', 'Nome', 'Cargo', 'Contrato', 'Billable', 'Salário Base', 'Dias Ativos', 'Custo Estimado'];
    const rows = people.map(p => [
      p.extractionDate.substring(0, 7),
      p.name,
      p.role,
      p.contractType,
      p.billableStatus,
      p.salary.toFixed(2).replace('.', ','),
      p.activeDays.toString(),
      p.estimatedCost.toFixed(2).replace('.', ',')
    ]);

    const text = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      alert('Copiado para área de transferência!');
    });
  };

  const handleDownloadCSV = () => {
    const headers = ['Mês Ref', 'Nome', 'Cargo', 'Contrato', 'Billable', 'Salário Base', 'Dias Ativos', 'Custo Estimado'];
    const rows = people.map(p => [
      p.extractionDate.substring(0, 7),
      `"${p.name}"`,
      `"${p.role}"`,
      p.contractType,
      p.billableStatus,
      p.salary.toString().replace('.', ','),
      p.activeDays,
      p.estimatedCost.toString().replace('.', ',')
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${title.replace(/[^a-z0-9]/gi, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalCost = people.reduce((acc, p) => acc + p.estimatedCost, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-11/12 max-w-5xl h-5/6 flex flex-col">
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
                    📥 Excel
                </button>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl font-bold">&times;</button>
        </div>
        
        <div className="flex-1 overflow-auto p-4">
          <table className="min-w-full text-sm text-left text-gray-600">
            <thead className="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0">
              <tr>
                <th className="px-4 py-3">Mês Ref.</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Cargo</th>
                <th className="px-4 py-3">Contrato</th>
                <th className="px-4 py-3">Billable</th>
                <th className="px-4 py-3 text-right">Salário Base</th>
                <th className="px-4 py-3 text-right">Atividade</th>
                <th className="px-4 py-3 text-right">Custo Estimado</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="bg-white border-b hover:bg-gray-50">
                  <td className="px-4 py-2">{p.extractionDate.substring(0, 7)}</td>
                  <td className="px-4 py-2 font-medium text-slate-800">{p.name}</td>
                  <td className="px-4 py-2 text-xs">{p.role}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs border ${
                        p.contractType === 'PJ' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                        p.contractType === 'CLT' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                        'bg-gray-50 text-gray-600 border-gray-200'
                    }`}>
                        {p.contractType}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">{p.billableStatus}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(p.salary)}</td>
                  <td className="px-4 py-2 text-right text-xs">
                    {p.activeDays}d ({(p.proportionality * 100).toFixed(0)}%)
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-slate-700">
                    {formatCurrency(p.estimatedCost)}
                  </td>
                </tr>
              ))}
              {people.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">Nenhum registro encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-200 flex justify-between bg-gray-50 rounded-b-lg">
            <span className="text-gray-500 text-xs">Total de registros: {people.length}</span>
            <span className="font-bold text-slate-800">
                Total Custo: {formatCurrency(totalCost)}
            </span>
        </div>
      </div>
    </div>
  );
};

export default PeopleDrillDownModal;
