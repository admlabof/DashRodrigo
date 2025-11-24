
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { formatCurrency } from '../services/dataService';
import { Transaction, TransactionStatus } from '../types';

interface DataGridB6Props {
  transactions: Transaction[];
}

type FilterOperator = 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'equals' | 'greater' | 'less';

interface ColumnConfig {
  key: keyof Transaction | 'vencPgtoReal';
  label: string;
  type: 'string' | 'number' | 'date' | 'status';
  defaultWidth: number;
}

const COLUMNS: ColumnConfig[] = [
  { key: 'competenceDate', label: 'Competência', type: 'date', defaultWidth: 110 },
  { key: 'dueDate', label: 'Vencimento', type: 'date', defaultWidth: 110 },
  { key: 'paymentDate', label: 'Pagamento', type: 'date', defaultWidth: 110 },
  { key: 'vencPgtoReal', label: 'Venc / Pagto', type: 'string', defaultWidth: 110 }, // Raw Column
  { key: 'company', label: 'Empresa', type: 'string', defaultWidth: 80 },
  { key: 'type', label: 'Tipo', type: 'string', defaultWidth: 80 }, // NEW
  { key: 'docNumber', label: 'Doc Nº', type: 'string', defaultWidth: 100 },
  { key: 'nf', label: 'NF', type: 'string', defaultWidth: 100 },
  { key: 'client', label: 'Entidade', type: 'string', defaultWidth: 200 },
  { key: 'description', label: 'Título', type: 'string', defaultWidth: 250 },
  { key: 'category', label: 'Categoria', type: 'string', defaultWidth: 200 },
  { key: 'relatedTo', label: 'Agrupamento', type: 'string', defaultWidth: 150 },
  { key: 'costCenter', label: 'C. Custo', type: 'string', defaultWidth: 150 },
  { key: 'status', label: 'Status', type: 'status', defaultWidth: 110 },
  { key: 'reconciled', label: 'Conciliado', type: 'string', defaultWidth: 100 }, // NEW
  { key: 'value', label: 'Valor Líquido', type: 'number', defaultWidth: 130 },
  { key: 'id', label: 'ID', type: 'string', defaultWidth: 80 },
];

const DataGridB6: React.FC<DataGridB6Props> = ({ transactions }) => {
  // --- STATE ---
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    COLUMNS.forEach(c => initial[c.key as string] = true);
    initial['description'] = false; // Hide by default
    initial['id'] = false;
    return initial;
  });

  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
      const initial: Record<string, number> = {};
      COLUMNS.forEach(c => initial[c.key as string] = c.defaultWidth);
      return initial;
  });

  // Filters
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  
  // UI State
  const [activeFilterCol, setActiveFilterCol] = useState<string | null>(null);
  const [showColMenu, setShowColMenu] = useState(false);
  
  // Temporary Filter State
  const [tempFilterSearch, setTempFilterSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'advanced'>('list');

  // Resizing State
  const resizingCol = useRef<string | null>(null);
  const startX = useRef<number>(0);
  const startWidth = useRef<number>(0);

  const filterMenuRef = useRef<HTMLDivElement>(null);
  const colMenuRef = useRef<HTMLDivElement>(null);

  // Click Outside Logic
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setActiveFilterCol(null);
      }
      if (colMenuRef.current && !colMenuRef.current.contains(event.target as Node)) {
        setShowColMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- RESIZING LOGIC ---
  useEffect(() => {
      const onMouseMove = (e: MouseEvent) => {
          if (!resizingCol.current) return;
          const delta = e.clientX - startX.current;
          const newWidth = Math.max(50, startWidth.current + delta);
          setColWidths(prev => ({ ...prev, [resizingCol.current!]: newWidth }));
      };

      const onMouseUp = () => {
          if (resizingCol.current) {
              resizingCol.current = null;
              document.body.style.cursor = 'default';
          }
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      return () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
      };
  }, []);

  const startResize = (e: React.MouseEvent, colKey: string) => {
      e.stopPropagation();
      resizingCol.current = colKey;
      startX.current = e.clientX;
      startWidth.current = colWidths[colKey];
      document.body.style.cursor = 'col-resize';
  };

  // Reset temp state when opening filter
  useEffect(() => {
      if (activeFilterCol) {
          setTempFilterSearch('');
          setActiveTab('list');
      }
  }, [activeFilterCol]);

  // --- DATA HELPER ---
  const getValue = (t: Transaction, key: string) => {
     if (key === 'client') return t.client || t.supplier || '';
     // @ts-ignore
     return t[key] !== undefined ? t[key] : '';
  };

  // --- PROCESSING ---
  const processedData = useMemo(() => {
    let data = [...transactions];

    // Apply Filters
    Object.keys(filters).forEach(key => {
      const f = filters[key];
      if (!f) return;
      
      if (f.type === 'date') {
          const start = f.start;
          const end = f.end;
          if (!start && !end) return;
          
          data = data.filter(t => {
              const val = getValue(t, key); // YYYY-MM-DD
              if (!val) return false;
              if (start && val < start) return false;
              if (end && val > end) return false;
              return true;
          });
          return;
      }

      if (f.mode === 'advanced') {
          const { operator, value } = f;
          if (!value) return;
          const searchVal = String(value).toLowerCase();

          data = data.filter(t => {
            const rawVal = getValue(t, key);
            const cellVal = String(rawVal).toLowerCase();

            switch (operator) {
            case 'contains': return cellVal.includes(searchVal);
            case 'not_contains': return !cellVal.includes(searchVal);
            case 'starts_with': return cellVal.startsWith(searchVal);
            case 'ends_with': return cellVal.endsWith(searchVal);
            case 'equals': return cellVal === searchVal;
            case 'greater': return parseFloat(cellVal) > parseFloat(searchVal);
            case 'less': return parseFloat(cellVal) < parseFloat(searchVal);
            default: return true;
            }
         });
         return;
      }

      if (f.mode === 'list' && f.selected && f.selected.length > 0) {
          const selectedSet = new Set(f.selected);
          data = data.filter(t => {
              const val = String(getValue(t, key));
              return selectedSet.has(val);
          });
      }
    });

    if (sortConfig) {
      data.sort((a, b) => {
        const valA = getValue(a, sortConfig.key);
        const valB = getValue(b, sortConfig.key);

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return data;
  }, [transactions, filters, sortConfig]);

  const totalValue = processedData.reduce((acc, t) => acc + t.value, 0);

  const getUniqueValues = (key: string) => {
      const values = new Set<string>();
      transactions.forEach(t => {
          const val = String(getValue(t, key));
          values.add(val);
      });
      return Array.from(values).sort();
  };

  // --- HANDLERS ---

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const applyDateFilter = (key: string, start: string, end: string) => {
      if (!start && !end) {
          const next = {...filters};
          delete next[key];
          setFilters(next);
      } else {
          setFilters(prev => ({ ...prev, [key]: { type: 'date', start, end } }));
      }
  };

  const applyListFilter = (key: string, selected: string[]) => {
      if (selected.length === 0) {
          const next = {...filters};
          delete next[key];
          setFilters(next);
      } else {
          setFilters(prev => ({ ...prev, [key]: { mode: 'list', selected } }));
      }
  };

  const applyAdvancedFilter = (key: string, operator: FilterOperator, value: string) => {
      if (!value) {
          const next = {...filters};
          delete next[key];
          setFilters(next);
      } else {
          setFilters(prev => ({ ...prev, [key]: { mode: 'advanced', operator, value } }));
      }
  };

  const clearFilter = (key: string) => {
    const next = { ...filters };
    delete next[key];
    setFilters(next);
    setActiveFilterCol(null);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded shadow border border-gray-200 relative">
      {/* --- TOOLBAR --- */}
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center select-none">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-lg text-slate-800">B6 - Base de Dados (BD Puro)</h2>
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
            {processedData.length} registros filtrados
          </span>
        </div>

        <div className="relative" ref={colMenuRef}>
          <button 
            onClick={() => setShowColMenu(!showColMenu)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            ⚙️ Colunas
          </button>
          {showColMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded shadow-xl z-50 p-2 max-h-[400px] overflow-y-auto">
              <div className="text-xs font-bold text-gray-500 mb-2 uppercase">Exibir / Ocultar</div>
              {COLUMNS.map(col => (
                <label key={col.key as string} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={visibleCols[col.key as string]}
                    onChange={() => setVisibleCols(p => ({ ...p, [col.key as string]: !p[col.key as string] }))}
                    className="text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{col.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* --- TABLE --- */}
      <div className="flex-1 overflow-auto pb-12">
        <table className="min-w-full divide-y divide-gray-200 text-sm table-fixed">
          <thead className="bg-slate-100 sticky top-0 z-20 shadow-sm">
            <tr>
              {COLUMNS.map((col, index) => {
                if (!visibleCols[col.key as string]) return null;
                const isFiltered = !!filters[col.key as string];
                const isSorted = sortConfig?.key === col.key;
                const width = colWidths[col.key as string];

                // Smart positioning: If column is in the last 3 visible columns, align popup to right
                const totalVisible = COLUMNS.filter(c => visibleCols[c.key as string]).length;
                const currentVisibleIdx = COLUMNS.slice(0, index).filter(c => visibleCols[c.key as string]).length;
                const isRightSide = currentVisibleIdx > totalVisible - 4;

                return (
                  <th 
                    key={col.key as string} 
                    className="px-2 py-3 text-left font-semibold text-slate-700 border-b border-gray-200 relative group bg-slate-100"
                    style={{ width: `${width}px` }}
                  >
                    <div className="flex items-center justify-between gap-1 overflow-hidden">
                      <span onClick={() => handleSort(col.key as string)} className="cursor-pointer hover:text-blue-600 select-none flex items-center gap-1 truncate">
                        {col.label}
                        {isSorted && <span className="text-blue-600 text-[10px]">{sortConfig?.direction === 'asc' ? '▲' : '▼'}</span>}
                      </span>
                      
                      <button 
                        onClick={() => setActiveFilterCol(activeFilterCol === col.key ? null : col.key as string)}
                        className={`p-1 rounded hover:bg-gray-200 flex-shrink-0 ${isFiltered ? 'text-blue-600 bg-blue-50' : 'text-gray-400 opacity-0 group-hover:opacity-100'}`}
                      >
                         <span className="text-[10px]">▼</span>
                      </button>
                    </div>

                    {/* Resizer Handle */}
                    <div 
                        onMouseDown={(e) => startResize(e, col.key as string)}
                        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-300 active:bg-blue-500 z-30"
                    />

                    {/* --- FILTER POPOVER --- */}
                    {activeFilterCol === col.key && (
                      <div 
                        ref={filterMenuRef} 
                        className={`absolute top-full mt-1 w-72 bg-white border border-gray-200 rounded shadow-xl z-50 flex flex-col ${isRightSide ? 'right-0' : 'left-0'}`}
                      >
                        
                        {col.type === 'date' ? (
                            <div className="p-3">
                                <div className="text-xs font-bold text-gray-500 mb-2">Filtrar por Período</div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs text-gray-600">De:</label>
                                    <input 
                                        type="date" 
                                        className="border rounded px-2 py-1 text-sm"
                                        value={filters[col.key as string]?.start || ''}
                                        onChange={(e) => applyDateFilter(col.key as string, e.target.value, filters[col.key as string]?.end || '')}
                                    />
                                    <label className="text-xs text-gray-600">Até:</label>
                                    <input 
                                        type="date" 
                                        className="border rounded px-2 py-1 text-sm"
                                        value={filters[col.key as string]?.end || ''}
                                        onChange={(e) => applyDateFilter(col.key as string, filters[col.key as string]?.start || '', e.target.value)}
                                    />
                                </div>
                                <div className="flex justify-end gap-2 mt-3">
                                    <button onClick={() => clearFilter(col.key as string)} className="text-xs text-red-500 hover:underline">Limpar</button>
                                    <button onClick={() => setActiveFilterCol(null)} className="px-2 py-1 bg-blue-600 text-white text-xs rounded">OK</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex border-b bg-gray-50 rounded-t">
                                    <button onClick={() => setActiveTab('list')} className={`flex-1 py-2 text-xs font-medium ${activeTab === 'list' ? 'bg-white border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}>Valores</button>
                                    <button onClick={() => setActiveTab('advanced')} className={`flex-1 py-2 text-xs font-medium ${activeTab === 'advanced' ? 'bg-white border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}>Avançado</button>
                                </div>

                                {activeTab === 'list' && (
                                    <div className="p-2 flex flex-col h-64">
                                        <input 
                                            type="text" 
                                            placeholder="Buscar na lista..." 
                                            className="w-full border rounded px-2 py-1 text-xs mb-2"
                                            value={tempFilterSearch}
                                            onChange={(e) => setTempFilterSearch(e.target.value)}
                                        />
                                        <div className="flex-1 overflow-y-auto border rounded p-1">
                                            {getUniqueValues(col.key as string)
                                                .filter(v => v.toLowerCase().includes(tempFilterSearch.toLowerCase()))
                                                .map(val => {
                                                    const isChecked = (filters[col.key as string]?.selected || []).includes(val);
                                                    return (
                                                        <label key={val} className="flex items-center gap-2 p-1 hover:bg-gray-50 cursor-pointer">
                                                            <input 
                                                                type="checkbox" 
                                                                checked={isChecked}
                                                                onChange={() => {
                                                                    const currentSelected = filters[col.key as string]?.selected || [];
                                                                    const newSelected = isChecked 
                                                                        ? currentSelected.filter((s: string) => s !== val)
                                                                        : [...currentSelected, val];
                                                                    applyListFilter(col.key as string, newSelected);
                                                                }}
                                                                className="rounded text-blue-600"
                                                            />
                                                            <span className="text-xs text-gray-700 truncate" title={val}>{val || '(Vazio)'}</span>
                                                        </label>
                                                    )
                                                })}
                                        </div>
                                        <div className="flex justify-between mt-2 border-t pt-2">
                                            <button onClick={() => clearFilter(col.key as string)} className="text-xs text-red-500">Limpar</button>
                                            <button onClick={() => setActiveFilterCol(null)} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Fechar</button>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'advanced' && (
                                    <div className="p-3">
                                        <div className="text-xs text-gray-500 mb-2">Filtrar por condição:</div>
                                        <select 
                                            className="w-full border rounded px-2 py-1 text-xs mb-2"
                                            value={filters[col.key as string]?.operator || 'contains'}
                                            onChange={(e) => applyAdvancedFilter(col.key as string, e.target.value as FilterOperator, filters[col.key as string]?.value || '')}
                                        >
                                            <option value="contains">Contém</option>
                                            <option value="not_contains">Não Contém</option>
                                            <option value="starts_with">Começa com</option>
                                            <option value="equals">Igual a</option>
                                            {col.type === 'number' && <option value="greater">Maior que</option>}
                                            {col.type === 'number' && <option value="less">Menor que</option>}
                                        </select>
                                        <input 
                                            type={col.type === 'number' ? 'number' : 'text'}
                                            placeholder="Valor..."
                                            className="w-full border rounded px-2 py-1 text-sm mb-3"
                                            value={filters[col.key as string]?.value || ''}
                                            onChange={(e) => applyAdvancedFilter(col.key as string, filters[col.key as string]?.operator || 'contains', e.target.value)}
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => clearFilter(col.key as string)} className="text-xs text-red-500 hover:underline">Limpar</button>
                                            <button onClick={() => setActiveFilterCol(null)} className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">OK</button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {processedData.map((t) => (
              <tr key={t.id} className="hover:bg-blue-50">
                {COLUMNS.map(col => {
                    if (!visibleCols[col.key as string]) return null;
                    const val = getValue(t, col.key as string);
                    let displayVal = val;
                    let cellClass = "text-gray-600";

                    if (col.type === 'number') {
                        displayVal = formatCurrency(val as number);
                        cellClass = (val as number) < 0 ? 'text-red-600 font-medium text-right' : 'text-green-600 font-medium text-right';
                    } else if (col.key === 'status') {
                         cellClass = val === TransactionStatus.QUITADO ? 'text-green-700 font-medium' : val === TransactionStatus.CANCELADA ? 'text-red-400 line-through' : 'text-yellow-700 font-medium';
                    }

                    return (
                        <td key={col.key as string} className={`px-2 py-2 whitespace-nowrap truncate ${cellClass}`} style={{ width: `${colWidths[col.key as string]}px`, maxWidth: `${colWidths[col.key as string]}px` }} title={String(displayVal)}>
                           {displayVal}
                        </td>
                    );
                })}
              </tr>
            ))}
            {processedData.length === 0 && (
                <tr><td colSpan={COLUMNS.length} className="p-8 text-center text-gray-400">Nenhum registro encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --- FOOTER --- */}
      <div className="bg-slate-800 text-white p-4 flex justify-between items-center rounded-b shadow-lg mt-auto sticky bottom-0 z-30">
         <div className="text-sm">
            <span className="text-slate-400">Registros:</span> <span className="font-bold ml-1">{processedData.length}</span>
         </div>
         <div className="text-lg">
            <span className="text-slate-400 mr-2">Total Líquido:</span> 
            <span className={`font-bold ${totalValue < 0 ? 'text-red-300' : 'text-green-300'}`}>
                {formatCurrency(totalValue)}
            </span>
         </div>
      </div>
    </div>
  );
};

export default DataGridB6;
