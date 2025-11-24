
import React, { useState, useEffect, useRef } from 'react';
import { FilterState, CompanyType, TransactionStatus } from '../types';

interface FiltersProps {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  showRelatedTo?: boolean;
  viewMode: 'DASHBOARD' | 'MODULE_A' | 'MODULE_B';
  activeModuleBTab?: 'B1' | 'B2' | 'B3' | 'B4' | 'B5';
  availableCat2s: string[];
  availableCostCenters: string[];
}

const MultiSelect: React.FC<{
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}> = ({ label, options, selected, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(s => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const selectAll = () => onChange([...options]);
  const clearAll = () => onChange([]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full border rounded px-2 py-1 text-xs bg-white hover:bg-gray-50 min-w-[150px]"
      >
        <span className="truncate max-w-[120px]">
          {selected.length === 0 
            ? label 
            : selected.length === options.length 
              ? `Todos (${options.length})` 
              : `${selected.length} selecionados`}
        </span>
        <span className="ml-2 text-gray-400">▼</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded shadow-lg z-50 max-h-60 overflow-y-auto p-2">
          <div className="flex justify-between mb-2 text-xs border-b pb-2">
            <button onClick={selectAll} className="text-blue-600 hover:underline">Todos</button>
            <button onClick={clearAll} className="text-gray-500 hover:underline">Limpar</button>
          </div>
          <div className="space-y-1">
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-2 hover:bg-gray-50 p-1 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggleOption(opt)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-700 truncate">{opt || '(Vazio)'}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const Filters: React.FC<FiltersProps> = ({ 
  filters, 
  setFilters, 
  showRelatedTo = false, 
  viewMode,
  activeModuleBTab,
  availableCat2s,
  availableCostCenters
}) => {
  
  const handleYearChange = (isPrev: boolean) => {
    const currentRef = new Date(filters.endDate + '-01'); // Use endDate as reference
    const newYear = currentRef.getFullYear() + (isPrev ? -1 : 1);
    const monthPart = filters.endDate.split('-')[1]; // Keep same month
    
    const newDateStr = `${newYear}-${monthPart}`;
    
    setFilters(prev => ({
      ...prev,
      startDate: `${newYear}-01`,
      endDate: newDateStr
    }));
  };

  // Specific handler for Module B2 (Single Month Picker)
  const handleReferenceMonthChange = (val: string) => {
    const year = val.split('-')[0];
    setFilters(prev => ({
      ...prev,
      startDate: `${year}-01`, // Always start from Jan 1st for YTD calculations in B2
      endDate: val
    }));
  };

  const toggleArrayFilter = <T,>(key: keyof FilterState, value: T) => {
    setFilters(prev => {
      const current = prev[key] as unknown as T[];
      const exists = current.includes(value);
      const newArr = exists ? current.filter(i => i !== value) : [...current, value];
      return { ...prev, [key]: newArr };
    });
  };

  // B2 requires Single Month Picker. Everything else (Dashboard, A, B1, B3..) uses Range.
  const isSingleMonthMode = viewMode === 'MODULE_B' && activeModuleBTab === 'B2';

  return (
    <div className="bg-white p-4 shadow-sm border-b border-gray-200 space-y-4 sticky top-0 z-30">
      {/* Top Row: Date & Company */}
      <div className="flex flex-wrap items-center gap-4">
        
        {/* Date Picker Section */}
        <div className="flex items-center gap-2 bg-slate-50 p-1 rounded border">
          <button onClick={() => handleYearChange(true)} className="px-3 py-1 text-sm hover:bg-gray-200 rounded text-gray-600">
             &lt; Ano Ant.
          </button>
          
          {isSingleMonthMode ? (
             // Single Month Picker for B2 Only
             <div className="flex items-center gap-2 px-2 border-x border-gray-200 bg-white mx-1">
                <span className="text-xs font-bold text-gray-500 uppercase">Mês Ref:</span>
                <input 
                  type="month" 
                  value={filters.endDate} // Controls the "Cutoff" / Reference Month
                  onChange={(e) => handleReferenceMonthChange(e.target.value)}
                  className="border-none outline-none py-1 text-sm font-bold text-slate-700"
                />
             </div>
          ) : (
             // Range Picker for others
             <div className="flex gap-2 items-center px-2 bg-white border-x mx-1">
                <input 
                    type="month" 
                    value={filters.startDate}
                    onChange={(e) => setFilters(p => ({...p, startDate: e.target.value}))}
                    className="border-none outline-none py-1 text-sm"
                />
                <span className="text-gray-400">-</span>
                <input 
                    type="month" 
                    value={filters.endDate}
                    onChange={(e) => setFilters(p => ({...p, endDate: e.target.value}))}
                    className="border-none outline-none py-1 text-sm"
                />
             </div>
          )}

          <button onClick={() => handleYearChange(false)} className="px-3 py-1 text-sm hover:bg-gray-200 rounded text-gray-600">
             Prox. Ano &gt;
          </button>
        </div>

        {/* Company Toggles */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded">
          {Object.values(CompanyType).map(c => (
            <button
              key={c}
              onClick={() => toggleArrayFilter('companies', c)}
              className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                filters.companies.includes(c) ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {showRelatedTo && (
           <div className="flex items-center gap-2 border-l pl-4">
             <span className="text-xs font-bold text-gray-500 uppercase">Agrupamento:</span>
             <select 
               className="border rounded px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
               value={filters.relatedToFilter}
               onChange={(e) => setFilters(p => ({...p, relatedToFilter: e.target.value as any}))}
             >
               <option value="ALL">Todos</option>
               <option value="PRO">Produção (PRO)</option>
               <option value="MIN">Mídia (MIN)</option>
             </select>
           </div>
        )}
      </div>

      {/* Bottom Row: Multi-select Filters */}
      <div className="flex flex-wrap gap-4 text-sm items-center bg-gray-50 p-2 rounded border border-gray-100">
        
        {/* Status */}
        <div className="flex items-center gap-2 border-r pr-4 border-gray-200">
          <span className="text-gray-500 text-xs font-bold uppercase">Status:</span>
          {[TransactionStatus.QUITADO, TransactionStatus.EM_ABERTO].map(s => (
             <button
              key={s}
              onClick={() => toggleArrayFilter('statuses', s)}
              className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                filters.statuses.includes(s) 
                  ? s === TransactionStatus.QUITADO ? 'bg-green-100 text-green-800 border-green-200' : 'bg-yellow-100 text-yellow-800 border-yellow-200'
                  : 'bg-white text-gray-400 border-gray-200'
              }`}
             >
               {s}
             </button>
          ))}
        </div>

        {/* Cost Centers */}
        <div className="flex items-center gap-2">
           <span className="text-gray-500 text-xs font-bold uppercase">Centro de Custo:</span>
           <MultiSelect 
             label="Filtrar C.Custo" 
             options={availableCostCenters} 
             selected={filters.costCenters} 
             onChange={(sel) => setFilters(p => ({...p, costCenters: sel}))} 
           />
        </div>

        {/* Categories (Cat2) */}
        <div className="flex items-center gap-2">
           <span className="text-gray-500 text-xs font-bold uppercase">Categorias:</span>
           <MultiSelect 
             label="Filtrar Cat2" 
             options={availableCat2s} 
             selected={filters.categories} 
             onChange={(sel) => setFilters(p => ({...p, categories: sel}))} 
           />
        </div>

      </div>
    </div>
  );
};

export default Filters;
