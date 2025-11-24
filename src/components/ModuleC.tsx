import React, { useMemo, useState, useEffect } from "react";
import { Person, PeopleConfig, MonthlyPeopleMetrics } from "../types";
import {
  processPeopleData,
  aggregatePeopleMetrics,
  calculatePromotions,
} from "../services/peopleService";
import { formatCurrency } from "../services/dataService";
import PeopleDrillDownModal from "./PeopleDrillDownModal";

interface ModuleCProps {
  peopleData: Person[];
  peopleConfig: PeopleConfig[];
  monthlyRevenue: Record<string, number>;
}

const CONTRACT_TYPES = ["CLT", "PJ", "Estagiário", "Sócio", "Outros"];

const ModuleC: React.FC<ModuleCProps> = ({
  peopleData,
  peopleConfig,
  monthlyRevenue,
}) => {
  const [activeTab, setActiveTab] = useState<"C1" | "C2" | "C3" | "C4">("C1");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([
    "CLT",
    "PJ",
    "Estagiário",
    "Sócio",
  ]);

  // Date Filter State
  const currentYear = new Date().getFullYear();
  const [dateFilter, setDateFilter] = useState({
    start: `${currentYear}-01`,
    end: `${currentYear}-12`,
  });

  // Filter for Detail Table (Non-zero check)
  const [showActiveOnly, setShowActiveOnly] = useState(false);

  // C4 Specific State
  const [c4Mode, setC4Mode] = useState<"WITH_INCREASE" | "WITHOUT_INCREASE">(
    "WITH_INCREASE"
  );
  const [hideTerminatedC4, setHideTerminatedC4] = useState(false);

  // DrillDown State
  const [drillDownPeople, setDrillDownPeople] = useState<{
    title: string;
    data: Person[];
  } | null>(null);

  // 1. Process Raw Data (Business Logic: Proportionality, Costs, etc)
  const processedPeople = useMemo(
    () => processPeopleData(peopleData, peopleConfig),
    [peopleData, peopleConfig]
  );

  // 2. Filter Processed Data based on Selection (Affects C1 and C3)
  const filteredPeople = useMemo(() => {
    return processedPeople.filter((p) =>
      selectedTypes.includes(p.contractType)
    );
  }, [processedPeople, selectedTypes]);

  // 3. Aggregate Metrics from Filtered Data
  const rawMetrics = useMemo(
    () => aggregatePeopleMetrics(filteredPeople, monthlyRevenue),
    [filteredPeople, monthlyRevenue]
  );

  // 4. Apply Date Filter to Metrics
  const metrics = useMemo(() => {
    return rawMetrics.filter(
      (m) => m.month >= dateFilter.start && m.month <= dateFilter.end
    );
  }, [rawMetrics, dateFilter]);

  // 5. Exceptions (C2) - Always look at FULL dataset to ensure errors aren't hidden
  const exceptions = useMemo(() => {
    return peopleData.filter(
      (p) => !p.isValid || (p.isValid && p.isBillableMissing)
    );
  }, [peopleData]);

  // 6. Promotions (C4)
  const promotionsData = useMemo(() => {
    // Use processedPeople (all types) then filter, or filteredPeople?
    // Requirement says: "poder filtrar por tipo de contrato"
    // So we pass 'processedPeople' to calculate (to get full history) then filter result by selectedTypes
    const rawPromotions = calculatePromotions(
      processedPeople,
      dateFilter.start,
      dateFilter.end
    );
    return rawPromotions.filter((p) => selectedTypes.includes(p.contractType));
  }, [processedPeople, dateFilter, selectedTypes]);

  const filteredPromotions = useMemo(() => {
    return promotionsData.filter((p) => {
      // Check C4 Mode (Increase vs No Increase)
      if (c4Mode === "WITH_INCREASE" && !p.hasIncreaseInPeriod) return false;
      if (c4Mode === "WITHOUT_INCREASE" && p.hasIncreaseInPeriod) return false;

      // Check Active Status (Hide Terminated)
      if (hideTerminatedC4) {
        const periodEnd = dateFilter.end + "-31"; // Compare YYYY-MM-DD
        if (p.terminationDate && p.terminationDate <= periodEnd) return false;
      }

      return true;
    });
  }, [promotionsData, c4Mode, hideTerminatedC4, dateFilter.end]);

  const toggleType = (type: string) => {
    if (selectedTypes.includes(type)) {
      setSelectedTypes((prev) => prev.filter((t) => t !== type));
    } else {
      setSelectedTypes((prev) => [...prev, type]);
    }
  };

  // Sort filtered people for the Detail View in C1
  const detailList = useMemo(() => {
    return [...filteredPeople]
      .filter((p) => {
        const m = p.extractionDate.substring(0, 7);
        const inRange = m >= dateFilter.start && m <= dateFilter.end;
        if (!inRange) return false;

        if (showActiveOnly) {
          // Check if person has any cost or active days in this specific record
          return p.estimatedCost > 0 || p.proportionality > 0;
        }
        return true;
      })
      .sort((a, b) => {
        // Sort by Month Descending, then Name Ascending
        const dateDiff = b.extractionDate.localeCompare(a.extractionDate);
        if (dateDiff !== 0) return dateDiff;
        return a.name.localeCompare(b.name);
      });
  }, [filteredPeople, dateFilter, showActiveOnly]);

  // --- DRILL DOWN LOGIC ---
  const handleDrill = (metricKey: string, month: string) => {
    // Determine which people contributed to this metric for this month
    const title = `${metricKey} - ${month}`;

    const peopleInMonth = filteredPeople.filter((p) =>
      p.extractionDate.startsWith(month)
    );
    let result: Person[] = [];

    switch (metricKey) {
      case "totalHeadcount":
        result = peopleInMonth;
        break;
      case "billableHeadcount":
      case "totalCostBillable":
      case "revenuePerBillable":
      case "marginPerBillable":
        result = peopleInMonth.filter((p) => p.billableStatus === "Billable");
        break;
      case "nbHeadcount":
      case "totalCostNB":
        result = peopleInMonth.filter((p) => p.billableStatus === "NB");
        break;
      case "avgSalaryPJ":
        result = peopleInMonth.filter((p) => p.contractType === "PJ");
        break;
      case "avgCostCLT":
        result = peopleInMonth.filter((p) => p.contractType === "CLT");
        break;
      case "avgCostEstag":
        result = peopleInMonth.filter((p) => p.contractType === "Estagiário");
        break;
      default:
        return; // No drilldown for simple ratios if not clear, or add specific logic
    }

    if (result.length > 0) {
      setDrillDownPeople({ title, data: result });
    }
  };

  const handleYearChange = (isPrev: boolean) => {
    const currentRef = new Date(dateFilter.end + "-01");
    const newYear = currentRef.getFullYear() + (isPrev ? -1 : 1);

    setDateFilter({
      start: `${newYear}-01`,
      end: `${newYear}-12`,
    });
  };

  // --- CALCULATIONS FOR C3 FOOTER ---
  const c3Totals = useMemo(() => {
    if (metrics.length === 0) return null;

    const sumAdm = metrics.reduce((acc, m) => acc + m.admissions, 0);
    const sumTerm = metrics.reduce((acc, m) => acc + m.terminations, 0);
    const avgHeadcount =
      metrics.reduce((acc, m) => acc + m.totalHeadcount, 0) / metrics.length;
    const avgTenure =
      metrics.reduce((acc, m) => acc + m.avgTenureMonths, 0) / metrics.length;

    // Period Churn = Total Terminations / Average Headcount
    const churn = avgHeadcount > 0 ? (sumTerm / avgHeadcount) * 100 : 0;

    return {
      avgHeadcount,
      sumAdm,
      sumTerm,
      churn,
      avgTenure,
    };
  }, [metrics]);

  return (
    <div className="space-y-4 p-4">
      {/* Tabs & Controls Header */}
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          {/* Tabs */}
          <div className="flex gap-2">
            {[
              { id: "C1", label: "C1 - Tendências Mensais" },
              { id: "C2", label: "C2 - Exceções & Erros" },
              { id: "C3", label: "C3 - Movimentações" },
              { id: "C4", label: "C4 - Aumentos / Promoções" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-t-lg font-medium text-sm ${
                  activeTab === tab.id
                    ? "bg-white text-blue-600 border border-b-0 shadow-sm"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Date Filter (Applies to C1, C3, C4) */}
            {activeTab !== "C2" && (
              <div className="flex items-center gap-2 bg-slate-50 p-1 rounded border">
                <button
                  onClick={() => handleYearChange(true)}
                  className="px-2 py-1 text-xs hover:bg-gray-200 rounded text-gray-600"
                >
                  &lt;
                </button>
                <input
                  type="month"
                  value={dateFilter.start}
                  onChange={(e) =>
                    setDateFilter((p) => ({ ...p, start: e.target.value }))
                  }
                  className="border-none outline-none py-1 text-xs bg-transparent w-28"
                />
                <span className="text-gray-400 text-xs">-</span>
                <input
                  type="month"
                  value={dateFilter.end}
                  onChange={(e) =>
                    setDateFilter((p) => ({ ...p, end: e.target.value }))
                  }
                  className="border-none outline-none py-1 text-xs bg-transparent w-28"
                />
                <button
                  onClick={() => handleYearChange(false)}
                  className="px-2 py-1 text-xs hover:bg-gray-200 rounded text-gray-600"
                >
                  &gt;
                </button>
              </div>
            )}

            {/* Contract Type Filters (Only relevant for C1, C3, C4) */}
            {activeTab !== "C2" && (
              <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded border border-gray-200">
                <span className="text-xs font-bold text-gray-500 uppercase mr-1">
                  Contrato:
                </span>
                {CONTRACT_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className={`px-2 py-1 rounded text-xs font-bold transition-colors border ${
                      selectedTypes.includes(type)
                        ? "bg-white text-blue-600 border-blue-200 shadow-sm"
                        : "text-gray-400 border-transparent hover:bg-gray-200"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* C1 Report */}
      {activeTab === "C1" && (
        <div className="space-y-8">
          {/* Top Table: Trends */}
          <div className="bg-white rounded shadow overflow-x-auto">
            <div className="p-3 bg-blue-50 text-blue-800 text-xs border-b border-blue-100 flex justify-between items-center">
              <span>
                Exibindo tendências para contratos:{" "}
                <b>{selectedTypes.join(", ")}</b>
              </span>
              <span>{filteredPeople.length} registros considerados</span>
            </div>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-slate-700 sticky left-0 bg-slate-100 border-r min-w-[200px]">
                    Métrica
                  </th>
                  {metrics.map((m) => (
                    <th
                      key={m.month}
                      className="px-2 py-3 text-right text-gray-600 w-24"
                    >
                      {m.month}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  {
                    label: "Total de Pessoas (FTE)",
                    key: "totalHeadcount",
                    fmt: (v: number) => v.toFixed(1),
                  },
                  {
                    label: "Pessoas Billable",
                    key: "billableHeadcount",
                    fmt: (v: number) => v.toFixed(1),
                  },
                  {
                    label: "Pessoas Non Billable",
                    key: "nbHeadcount",
                    fmt: (v: number) => v.toFixed(1),
                  },
                  {
                    label: "Custo Total Billable",
                    key: "totalCostBillable",
                    fmt: formatCurrency,
                  },
                  {
                    label: "Custo Total Non Billable",
                    key: "totalCostNB",
                    fmt: formatCurrency,
                  },
                  // Show specific averages only if relevant type is selected, otherwise value might be 0/NaN or irrelevant
                  {
                    label: "Salário Médio PJ",
                    key: "avgSalaryPJ",
                    fmt: formatCurrency,
                    hidden: !selectedTypes.includes("PJ"),
                  },
                  {
                    label: "Custo Médio CLT",
                    key: "avgCostCLT",
                    fmt: formatCurrency,
                    hidden: !selectedTypes.includes("CLT"),
                  },
                  {
                    label: "Custo Médio Estagiário",
                    key: "avgCostEstag",
                    fmt: formatCurrency,
                    hidden: !selectedTypes.includes("Estagiário"),
                  },
                  {
                    label: "Receita / Billable",
                    key: "revenuePerBillable",
                    fmt: formatCurrency,
                    highlight: true,
                  },
                  {
                    label: "Margem / Billable",
                    key: "marginPerBillable",
                    fmt: formatCurrency,
                    highlight: true,
                  },
                ].map((row, idx) => {
                  if (row.hidden) return null;
                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-blue-50 transition-colors ${
                        row.highlight ? "bg-slate-50 font-bold" : ""
                      }`}
                    >
                      <td className="px-4 py-2 text-gray-700 font-medium sticky left-0 bg-inherit border-r">
                        {row.label}
                      </td>
                      {metrics.map((m) => (
                        // @ts-ignore
                        <td
                          key={m.month}
                          onClick={() => handleDrill(row.key, m.month)}
                          className="px-2 py-2 text-right text-gray-600 cursor-pointer hover:text-blue-600 hover:bg-blue-100 underline decoration-dotted decoration-gray-300"
                        >
                          {row.fmt((m as any)[row.key])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="p-2 bg-gray-50 border-t border-gray-200">
              <p className="text-[10px] text-gray-500 italic text-right">
                * Nota: Margem / Billable é a receita menos o custo direto dos
                billable.
              </p>
            </div>
          </div>

          {/* Bottom Table: Detail List */}
          <div className="bg-white rounded shadow overflow-hidden border border-gray-200">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-700 uppercase">
                Detalhamento de Pessoas (Base de Cálculo)
              </h3>

              <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={showActiveOnly}
                  onChange={(e) => setShowActiveOnly(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs font-medium text-gray-700 select-none">
                  Ocultar inativos (Zerados)
                </span>
              </label>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">
                      Mês Ref.
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">
                      Nome
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">
                      Cargo
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">
                      Contrato
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">
                      Billable
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">
                      Salário Base
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">
                      Dias Ativos
                    </th>
                    <th className="px-4 py-3 text-right font-bold text-gray-700">
                      Custo Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detailList.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-600">
                        {p.extractionDate.substring(0, 7)}
                      </td>
                      <td className="px-4 py-2 font-medium text-slate-800">
                        {p.name}
                      </td>
                      <td className="px-4 py-2 text-gray-600 text-xs">
                        {p.role}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded border ${
                            p.contractType === "PJ"
                              ? "bg-purple-50 text-purple-700 border-purple-100"
                              : p.contractType === "CLT"
                              ? "bg-blue-50 text-blue-700 border-blue-100"
                              : "bg-gray-50 text-gray-600 border-gray-200"
                          }`}
                        >
                          {p.contractType}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        <span
                          className={
                            p.billableStatus === "Billable"
                              ? "text-green-600 font-bold"
                              : "text-gray-500"
                          }
                        >
                          {p.billableStatus}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-500">
                        {formatCurrency(p.salary)}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-gray-500">
                        {p.activeDays}d{" "}
                        <span className="text-gray-400">
                          ({(p.proportionality * 100).toFixed(0)}%)
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-bold text-slate-700">
                        {formatCurrency(p.estimatedCost)}
                      </td>
                    </tr>
                  ))}
                  {detailList.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="text-center py-8 text-gray-400"
                      >
                        Nenhum registro encontrado no período selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* C2 Exceptions */}
      {activeTab === "C2" && (
        <div className="bg-white rounded shadow">
          <div className="p-4 bg-red-50 border-b border-red-100 text-red-800 text-sm">
            Registros com CNPJ/CPF vazio ou Status Billable não identificado.
            (Exibindo base completa).
          </div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left">Nome</th>
                <th className="px-4 py-3 text-left">Extração</th>
                <th className="px-4 py-3 text-left">Doc (CPF/CNPJ)</th>
                <th className="px-4 py-3 text-left">Billable</th>
                <th className="px-4 py-3 text-left">Erro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {exceptions.map((p) => (
                <tr key={p.id} className="hover:bg-red-50">
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">{p.extractionDate}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {p.doc || "[VAZIO]"}
                  </td>
                  <td className="px-4 py-2">
                    {p.isBillableMissing ? (
                      <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">
                        Faltante
                      </span>
                    ) : (
                      p.billableStatus
                    )}
                  </td>
                  <td className="px-4 py-2 text-red-600 font-bold">
                    {!p.isValid ? "Doc Inválido" : "Billable Vazio"}
                  </td>
                </tr>
              ))}
              {exceptions.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-green-600">
                    Nenhuma exceção encontrada. Base OK!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* C3 Movements */}
      {activeTab === "C3" && (
        <div className="bg-white rounded shadow overflow-x-auto">
          <div className="p-3 bg-blue-50 text-blue-800 text-xs border-b border-blue-100 flex justify-between items-center">
            <span>
              Exibindo movimentações para: <b>{selectedTypes.join(", ")}</b>
            </span>
          </div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left font-bold text-slate-700">
                  Mês
                </th>
                <th className="px-4 py-3 text-right text-gray-700">
                  Total Colaboradores
                </th>
                <th className="px-4 py-3 text-right text-green-600">
                  Admissões
                </th>
                <th className="px-4 py-3 text-right text-red-600">
                  Desligamentos
                </th>
                <th className="px-4 py-3 text-right text-purple-700 font-bold">
                  Churn %
                </th>
                <th className="px-4 py-3 text-right text-slate-700">
                  Tempo Médio (Meses)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {metrics.map((m) => {
                // Monthly Churn Calculation
                const churnRate =
                  m.totalHeadcount > 0
                    ? (m.terminations / m.totalHeadcount) * 100
                    : 0;
                return (
                  <tr key={m.month} className="hover:bg-blue-50">
                    <td className="px-4 py-2 font-bold text-slate-700">
                      {m.month}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-700 font-medium">
                      {m.totalHeadcount.toFixed(1)}
                    </td>
                    <td className="px-4 py-2 text-right text-green-600 font-bold">
                      {m.admissions}
                    </td>
                    <td className="px-4 py-2 text-right text-red-600 font-bold">
                      {m.terminations}
                    </td>
                    <td className="px-4 py-2 text-right text-purple-700 font-bold">
                      {churnRate.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {m.avgTenureMonths.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {c3Totals && (
              <tfoot className="bg-slate-200 font-bold text-slate-800">
                <tr>
                  <td className="px-4 py-3">TOTAL / MÉDIA</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {c3Totals.avgHeadcount.toFixed(1)} (Méd)
                  </td>
                  <td className="px-4 py-3 text-right text-green-800">
                    {c3Totals.sumAdm}
                  </td>
                  <td className="px-4 py-3 text-right text-red-800">
                    {c3Totals.sumTerm}
                  </td>
                  <td className="px-4 py-3 text-right text-purple-900">
                    {c3Totals.churn.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {c3Totals.avgTenure.toFixed(1)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* C4 Promotions */}
      {activeTab === "C4" && (
        <div className="bg-white rounded shadow">
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex bg-white rounded-md border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setC4Mode("WITH_INCREASE")}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    c4Mode === "WITH_INCREASE"
                      ? "bg-green-100 text-green-800"
                      : "hover:bg-gray-100 text-gray-600"
                  }`}
                >
                  Com Aumento
                </button>
                <div className="w-px bg-gray-300"></div>
                <button
                  onClick={() => setC4Mode("WITHOUT_INCREASE")}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    c4Mode === "WITHOUT_INCREASE"
                      ? "bg-gray-200 text-gray-800"
                      : "hover:bg-gray-100 text-gray-600"
                  }`}
                >
                  Sem Aumento
                </button>
              </div>

              <div className="flex items-center gap-4">
                {/* Toggle Active Only */}
                <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={hideTerminatedC4}
                    onChange={(e) => setHideTerminatedC4(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-bold text-gray-700 select-none uppercase">
                    Ocultar Desligados
                  </span>
                </label>
                <div className="text-xs text-gray-500">
                  Período: <b>{dateFilter.start}</b> a <b>{dateFilter.end}</b>
                </div>
              </div>
            </div>
          </div>

          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left">Nome</th>
                <th className="px-4 py-3 text-left">Admissão</th>
                <th className="px-4 py-3 text-left">Contrato</th>
                <th className="px-4 py-3 text-right">
                  Salário Atual ({dateFilter.end})
                </th>
                <th className="px-4 py-3 text-right text-gray-500">
                  Salário Anterior
                </th>
                <th className="px-4 py-3 text-right text-gray-500">
                  Salário 12 Meses Atrás
                </th>
                <th className="px-4 py-3 text-center">Data Último Aumento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredPromotions.map((p, idx) => (
                <tr key={`${p.doc}-${idx}`} className="hover:bg-blue-50">
                  <td className="px-4 py-2 font-medium text-slate-800">
                    {p.name}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{p.admissionDate}</td>
                  <td className="px-4 py-2 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded border ${
                        p.contractType === "PJ"
                          ? "bg-purple-50 text-purple-700 border-purple-100"
                          : p.contractType === "CLT"
                          ? "bg-blue-50 text-blue-700 border-blue-100"
                          : "bg-gray-50 text-gray-600 border-gray-200"
                      }`}
                    >
                      {p.contractType}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-green-700">
                    {formatCurrency(p.currentSalary)}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500">
                    {p.previousSalary ? formatCurrency(p.previousSalary) : "-"}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-400">
                    {p.salary12MonthsAgo
                      ? formatCurrency(p.salary12MonthsAgo)
                      : "-"}
                  </td>
                  <td className="px-4 py-2 text-center text-xs font-bold text-blue-600">
                    {p.lastIncreaseDate || "-"}
                  </td>
                </tr>
              ))}
              {filteredPromotions.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <PeopleDrillDownModal
        isOpen={!!drillDownPeople}
        onClose={() => setDrillDownPeople(null)}
        title={drillDownPeople?.title || ""}
        people={drillDownPeople?.data || []}
      />
    </div>
  );
};

export default ModuleC;
