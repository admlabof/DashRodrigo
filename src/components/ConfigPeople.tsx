
import React, { useState } from 'react';
import { PeopleConfig } from '../types';

interface ConfigPeopleProps {
  configs: PeopleConfig[];
  setConfigs: (c: PeopleConfig[]) => void;
  onClose: () => void;
}

const ConfigPeople: React.FC<ConfigPeopleProps> = ({ configs, setConfigs, onClose }) => {
  const [localConfigs, setLocalConfigs] = useState(configs);

  const handleChange = (index: number, field: keyof PeopleConfig, value: string) => {
    const numVal = parseFloat(value) || 0;
    const newC = [...localConfigs];
    // @ts-ignore
    newC[index][field] = numVal;
    setLocalConfigs(newC);
  };

  const handleSave = () => {
    setConfigs(localConfigs);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="p-4 border-b border-gray-200 bg-slate-50 rounded-t-lg flex justify-between">
          <h2 className="text-lg font-bold text-slate-800">Configuração de Custos (Pessoas)</h2>
          <button onClick={onClose} className="text-gray-500">&times;</button>
        </div>
        
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 mb-4">
            Defina os fatores para o cálculo de Custo Total.<br/>
            <i>Custo = (Salário x Multiplicador) + Soma</i>
          </p>
          
          <div className="grid grid-cols-3 gap-4 font-bold text-xs text-gray-500 uppercase border-b pb-2">
            <div>Contrato</div>
            <div>Fator Multiplicador</div>
            <div>Fator Soma (R$)</div>
          </div>

          {localConfigs.map((conf, idx) => (
            <div key={conf.contractType} className="grid grid-cols-3 gap-4 items-center">
              <span className="text-sm font-medium text-gray-700">{conf.contractType}</span>
              <input 
                type="number" step="0.1"
                className="border rounded px-2 py-1 text-sm"
                value={conf.multiplier}
                onChange={e => handleChange(idx, 'multiplier', e.target.value)}
              />
              <input 
                type="number" step="100"
                className="border rounded px-2 py-1 text-sm"
                value={conf.sumFactor}
                onChange={e => handleChange(idx, 'sumFactor', e.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded text-sm">Cancelar</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Salvar</button>
        </div>
      </div>
    </div>
  );
};

export default ConfigPeople;
