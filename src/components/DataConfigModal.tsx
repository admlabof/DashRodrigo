
import React, { useState, useEffect } from 'react';

interface DataConfigModalProps {
  onClose: () => void;
  onConnect: (spreadsheetId: string, gid: string, cashSpreadsheetId?: string, cashGid?: string, peopleSheetId?: string, peopleGid?: string) => Promise<void>;
}

const STORAGE_KEY_SHEETS = 'finance_bi_sheet_config';

const DataConfigModal: React.FC<DataConfigModalProps> = ({ onClose, onConnect }) => {
  const [url, setUrl] = useState('');
  const [cashUrl, setCashUrl] = useState('');
  const [peopleUrl, setPeopleUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Initialize with saved data if available
  useEffect(() => {
      const saved = localStorage.getItem(STORAGE_KEY_SHEETS);
      if (saved) {
          try {
              const parsed = JSON.parse(saved);
              // Reconstruct full URLs for display (approximate)
              if (parsed.sheetId) setUrl(`https://docs.google.com/spreadsheets/d/${parsed.sheetId}/edit#gid=${parsed.gid}`);
              if (parsed.cashSheetId) setCashUrl(`https://docs.google.com/spreadsheets/d/${parsed.cashSheetId}/edit#gid=${parsed.cashGid}`);
              if (parsed.peopleSheetId) setPeopleUrl(`https://docs.google.com/spreadsheets/d/${parsed.peopleSheetId}/edit#gid=${parsed.peopleGid}`);
          } catch(e) {
              // ignore error parsing
          }
      }
  }, []);

  const extractInfo = (inputUrl: string) => {
    try {
      if (!inputUrl) return null;
      // Regex to find /d/ID/
      const idMatch = inputUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      const gidMatch = inputUrl.match(/[#&?]gid=([0-9]+)/);

      if (idMatch && idMatch[1]) {
        const id = idMatch[1];
        const gid = gidMatch && gidMatch[1] ? gidMatch[1] : '0'; // Default to first sheet
        return { id, gid };
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const handleSubmit = async () => {
    setError('');
    const info = extractInfo(url);
    const cashInfo = cashUrl ? extractInfo(cashUrl) : undefined;
    const peopleInfo = peopleUrl ? extractInfo(peopleUrl) : undefined;
    
    if (!info) {
      setError('URL de Lançamentos inválida. Verifique o link.');
      return;
    }

    if (cashUrl && !cashInfo) {
        setError('URL de Caixa inválida. Verifique o link.');
        return;
    }

    if (peopleUrl && !peopleInfo) {
        setError('URL de Pessoas inválida. Verifique o link.');
        return;
    }

    setIsLoading(true);
    try {
      await onConnect(info.id, info.gid, cashInfo?.id, cashInfo?.gid, peopleInfo?.id, peopleInfo?.gid);
      onClose();
    } catch (err: any) {
      setError('Erro ao conectar: ' + (err.message || 'Verifique se as planilhas estão públicas.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearConfig = () => {
      if (window.confirm("Isso apagará as conexões salvas do seu navegador. Continuar?")) {
          localStorage.removeItem(STORAGE_KEY_SHEETS);
          setUrl('');
          setCashUrl('');
          setPeopleUrl('');
          alert("Conexões salvas removidas.");
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-800">Conectar Bases de Dados</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded p-3 mb-4 text-sm text-blue-800">
          <strong>Importante:</strong> As planilhas devem estar com acesso <em>"Qualquer pessoa com o link"</em>.
        </div>

        <div className="space-y-4">
          {/* Inputs */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">1. Base Lançamentos (Obrigatório)</label>
            <input 
              type="text" 
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">2. Base Caixa (Opcional)</label>
            <input 
              type="text" 
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={cashUrl}
              onChange={(e) => setCashUrl(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">Busca a linha "Saldo geral".</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">3. Base Pessoas (Opcional - Módulo C)</label>
            <input 
              type="text" 
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={peopleUrl}
              onChange={(e) => setPeopleUrl(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-2 rounded border border-red-100">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-between gap-2">
          <button onClick={handleClearConfig} className="px-4 py-2 text-red-500 hover:bg-red-50 rounded text-sm">Limpar Salvos</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded text-sm">Cancelar</button>
            <button 
                onClick={handleSubmit} 
                disabled={isLoading || !url}
                className={`px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center gap-2 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
                {isLoading && <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                {isLoading ? 'Carregando...' : 'Carregar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataConfigModal;
