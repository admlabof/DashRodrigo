
import React, { useState } from 'react';
import { Cat2Mapping } from '../types';

interface ConfigCat2Props {
  mappings: Cat2Mapping[];
  setMappings: (m: Cat2Mapping[]) => void;
  uniqueCategories: string[]; // Pass unique categories from real data
  onClose: () => void;
}

const ConfigCat2: React.FC<ConfigCat2Props> = ({ mappings, setMappings, uniqueCategories, onClose }) => {
  const [tempMappings, setTempMappings] = useState<Cat2Mapping[]>(mappings);
  const [filter, setFilter] = useState('');

  // Initialize missing categories
  React.useEffect(() => {
    const missing = uniqueCategories.filter(c => !tempMappings.find(m => m.category === c));
    if (missing.length > 0) {
      const newEntries = missing.map(c => ({ category: c, cat2: c }));
      setTempMappings(prev => [...prev, ...newEntries]);
    }
  }, [uniqueCategories, tempMappings]);

  const handleChange = (category: string, newCat2: string) => {
    setTempMappings(prev => {
      const exists = prev.find(m => m.category === category);
      if (exists) {
        return prev.map(m => m.category === category ? { ...m, cat2: newCat2 } : m);
      } else {
        return [...prev, { category, cat2: newCat2 }];
      }
    });
  };

  const handleSave = () => {
    setMappings(tempMappings);
    onClose();
  };

  const sortedCategories = [...uniqueCategories].sort();
  const filteredCategories = sortedCategories.filter(c => c.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-11/12 max-w-3xl max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-slate-50 rounded-t-lg">
          <h2 className="text-xl font-bold text-slate-800">Configuração Cat2 (Agrupamento)</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">&times;</button>
        </div>
        
        <div className="p-4 bg-gray-50 border-b">
             <input 
               type="text"
               placeholder="Filtrar categorias..."
               className="w-full border rounded px-3 py-2 text-sm"
               value={filter}
               onChange={e => setFilter(e.target.value)}
             />
        </div>
        
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 gap-4 font-bold text-xs text-gray-500 uppercase mb-2 sticky top-0 bg-white pb-2 border-b">
            <div>Categoria Original (Base)</div>
            <div>Cat2 (Agrupamento DRE)</div>
          </div>
          <div className="space-y-2">
            {filteredCategories.map((catName) => {
               const mapping = tempMappings.find(m => m.category === catName);
               const cat2Value = mapping ? mapping.cat2 : catName;

               return (
                <div key={catName} className="grid grid-cols-2 gap-4 items-center border-b border-gray-100 pb-1 last:border-0">
                    <div className="text-sm text-gray-700 break-words">{catName}</div>
                    <input 
                    type="text" 
                    value={cat2Value}
                    onChange={(e) => handleChange(catName, e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>
               );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 flex justify-end gap-2 bg-gray-50 rounded-b-lg">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save Config</button>
        </div>
      </div>
    </div>
  );
};

export default ConfigCat2;
