import React, { useState, useMemo, useEffect } from "react";
import {
  CompanyType,
  FilterState,
  TransactionStatus,
  InvoiceType,
  Cat2Mapping,
  Transaction,
  CashFlow,
  Person,
  PeopleConfig,
} from "./types";
import {
  MOCK_TRANSACTIONS,
  DEFAULT_CAT2_MAPPING,
  ALL_CATEGORIES,
  MOCK_CASH,
  DEFAULT_PEOPLE_CONFIG,
} from "./constants";
import {
  applyGlobalFilters,
  autoClassifyCategory,
  processModuleB1,
  processModuleB4,
  processModuleB5,
  formatCurrency,
} from "./services/dataService";
import {
  fetchGoogleSheetData,
  fetchCat2MappingFromSheet,
  fetchCashFlowData,
  fetchPeopleData,
} from "./services/sheetsService";
import {
  processPeopleData,
  aggregatePeopleMetrics,
} from "./services/peopleService";
import Filters from "./components/Filters";
import ModuleA from "./components/ModuleA";
import ModuleB from "./components/ModuleB";
import ModuleC from "./components/ModuleC";
import ConfigCat2 from "./components/ConfigCat2";
import ConfigPeople from "./components/ConfigPeople";
import DataConfigModal from "./components/DataConfigModal";
import LoginScreen from "./components/LoginScreen";

// --- PASSWORD CONFIGURATION ---
const ACCESS_PASSWORD = "finance2025";
// ------------------------------

const currentYear = new Date().getFullYear();

// REFERENCE SHEET (Provided by User)
const REFERENCE_SHEET_ID = "1VvbxZjv7zf-YAvqhRLZqZdXlhrBJj7o1esQWnsPPTWY";
const REFERENCE_GID = "134690077";

// Key for LocalStorage
const STORAGE_KEY_SHEETS = "finance_bi_sheet_config";

const App: React.FC = () => {
  // --- AUTH STATE ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState(false);

  // Check session storage on load to keep user logged in on refresh
  useEffect(() => {
    const session = sessionStorage.getItem("finance_bi_auth");
    if (session === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (password: string) => {
    if (password === ACCESS_PASSWORD) {
      setIsAuthenticated(true);
      setAuthError(false);
      sessionStorage.setItem("finance_bi_auth", "true");
    } else {
      alert("Código incorreto!"); // Simple alert for failure
      setAuthError(true);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem("finance_bi_auth");
  };

  // --- APP STATE ---
  const [currentView, setCurrentView] = useState<
    "DASHBOARD" | "MODULE_A" | "MODULE_B" | "MODULE_C"
  >("DASHBOARD");
  const [activeModuleBTab, setActiveModuleBTab] = useState<
    "B1" | "B2" | "B3" | "B4" | "B5" | "B6"
  >("B1");

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isPeopleConfigOpen, setIsPeopleConfigOpen] = useState(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);

  // State for Data
  const [transactions, setTransactions] =
    useState<Transaction[]>(MOCK_TRANSACTIONS);
  const [cashFlowData, setCashFlowData] = useState<CashFlow[]>(MOCK_CASH);
  const [peopleData, setPeopleData] = useState<Person[]>([]);
  const [isUsingRealData, setIsUsingRealData] = useState(false);
  const [isLoadingAuto, setIsLoadingAuto] = useState(false);

  // Initialize Cat2 Mappings from LocalStorage or Default
  const [cat2Mappings, setCat2Mappings] = useState<Cat2Mapping[]>(() => {
    const saved = localStorage.getItem("finance_bi_cat2_mappings");
    return saved ? JSON.parse(saved) : DEFAULT_CAT2_MAPPING;
  });

  // Initialize People Config from LocalStorage
  const [peopleConfig, setPeopleConfig] = useState<PeopleConfig[]>(() => {
    const saved = localStorage.getItem("finance_bi_people_config");
    return saved ? JSON.parse(saved) : DEFAULT_PEOPLE_CONFIG;
  });

  // Persist mappings whenever they change
  useEffect(() => {
    localStorage.setItem(
      "finance_bi_cat2_mappings",
      JSON.stringify(cat2Mappings)
    );
  }, [cat2Mappings]);

  useEffect(() => {
    localStorage.setItem(
      "finance_bi_people_config",
      JSON.stringify(peopleConfig)
    );
  }, [peopleConfig]);

  // Global Filter State
  const [filters, setFilters] = useState<FilterState>({
    startDate: `${currentYear}-01`,
    endDate: `${currentYear}-12`,
    companies: [CompanyType.TL, CompanyType.PL, CompanyType.NT],
    statuses: [TransactionStatus.QUITADO, TransactionStatus.EM_ABERTO],
    types: [InvoiceType.RECEITA, InvoiceType.DESPESA],
    categories: [],
    costCenters: [],
    relatedToFilter: "ALL",
  });

  const handleConnectData = async (
    sheetId: string,
    gid: string,
    cashSheetId?: string,
    cashGid?: string,
    peopleSheetId?: string,
    peopleGid?: string
  ) => {
    // 1. Fetch Transaction Data
    const data = await fetchGoogleSheetData(sheetId, gid);
    setTransactions(data);

    // 2. Fetch Cash Flow Data (Optional)
    if (cashSheetId && cashGid) {
      const cashData = await fetchCashFlowData(cashSheetId, cashGid);
      if (cashData.length > 0) {
        setCashFlowData(cashData);
      }
    }

    // 3. Fetch People Data (Optional)
    if (peopleSheetId && peopleGid) {
      const pData = await fetchPeopleData(peopleSheetId, peopleGid);
      setPeopleData(pData);
    }

    setIsUsingRealData(true);

    // 4. Fetch Reference Mapping
    const referenceMapping = await fetchCat2MappingFromSheet(
      REFERENCE_SHEET_ID,
      REFERENCE_GID
    );

    // 5. Merge and Auto-Classify
    setCat2Mappings((prev) => {
      const newMappings = [...prev];

      // Update with reference mapping first (Authoritative)
      referenceMapping.forEach((ref) => {
        const existingIdx = newMappings.findIndex(
          (m) => m.category === ref.category
        );
        if (existingIdx >= 0) {
          newMappings[existingIdx].cat2 = ref.cat2;
        } else {
          newMappings.push(ref);
        }
      });

      // Then handle any transactions that are still unmapped
      const uniqueCats = Array.from(new Set(data.map((t) => t.category)));

      uniqueCats.forEach((cat: string) => {
        // If this category is NOT yet mapped
        if (!newMappings.find((m) => m.category === cat)) {
          // Run the Auto-Classifier to guess the best group based on Account Codes
          const guessedCat2 = autoClassifyCategory(cat);
          newMappings.push({ category: cat, cat2: guessedCat2 });
        }
      });

      return newMappings;
    });

    // 6. Save Config to LocalStorage for Auto-Load next time
    const configToSave = {
      sheetId,
      gid,
      cashSheetId,
      cashGid,
      peopleSheetId,
      peopleGid,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY_SHEETS, JSON.stringify(configToSave));
  };

  // --- AUTO LOAD DATA ON STARTUP ---
  useEffect(() => {
    const autoLoad = async () => {
      const savedConfig = localStorage.getItem(STORAGE_KEY_SHEETS);
      if (savedConfig) {
        try {
          setIsLoadingAuto(true);
          const parsed = JSON.parse(savedConfig);
          await handleConnectData(
            parsed.sheetId,
            parsed.gid,
            parsed.cashSheetId,
            parsed.cashGid,
            parsed.peopleSheetId,
            parsed.peopleGid
          );
        } catch (e) {
          console.error("Auto-load failed:", e);
          // If fails, user can manually connect
        } finally {
          setIsLoadingAuto(false);
        }
      }
    };

    // Only run if we are authenticated
    if (isAuthenticated) {
      autoLoad();
    }
  }, [isAuthenticated]);

  // Filter Data (Range Restricted) - For Dashboard, Module A, and B1 Visuals
  const filteredTransactions = useMemo(() => {
    return applyGlobalFilters(transactions, filters, cat2Mappings, false);
  }, [transactions, filters, cat2Mappings]);

  // Filter Data (Year Context) - For B2 (Year Totals) and Future Projections
  // This excludes the Date Range filter but keeps Company/Status/Category/CC
  const yearTransactions = useMemo(() => {
    return applyGlobalFilters(transactions, filters, cat2Mappings, true);
  }, [transactions, filters, cat2Mappings]);

  // Extract Unique Categories dynamically from current transactions
  const uniqueCategories = useMemo(() => {
    const cats = new Set(transactions.map((t) => t.category));
    return Array.from(cats).sort();
  }, [transactions]);

  // Extract Unique Cost Centers
  const uniqueCostCenters = useMemo(() => {
    const ccs = new Set(
      transactions.map((t) => t.costCenter).filter((c): c is string => !!c)
    );
    return Array.from(ccs).sort();
  }, [transactions]);

  // Extract Unique Cat2s (Groups)
  const uniqueCat2s = useMemo(() => {
    const cats = new Set(cat2Mappings.map((m) => m.cat2).filter((c) => !!c));
    return Array.from(cats).sort();
  }, [cat2Mappings]);

  // Calculate Monthly Revenue (Used in Module C)
  const monthlyRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    // We need revenue for all years present in people data, so using full transactions
    const years = new Set(
      transactions.map((t) => t.competenceDate.substring(0, 4))
    );

    years.forEach((yStr: string) => {
      const y = parseInt(yStr);
      // Use Module B1 Logic to get Revenue Line
      const dre = processModuleB1(transactions, y, 11, cat2Mappings, [], 11);
      const revenueLine = dre.find((l) => l.label === "RECEITAS");

      if (revenueLine) {
        revenueLine.values.forEach((b, idx) => {
          const m = (idx + 1).toString().padStart(2, "0");
          map[`${y}-${m}`] = b.value;
        });
      }
    });
    return map;
  }, [transactions, cat2Mappings]);

  // --- DASHBOARD CALCULATIONS ---
  const dashboardMetrics = useMemo(() => {
    const now = new Date();
    const currentMonthStr = now.toISOString().substring(0, 7); // YYYY-MM
    const currentYear = now.getFullYear();
    const currentMonthIdx = now.getMonth(); // 0-11
    const todayStr = now.toISOString().substring(0, 10);

    // 1. CASH FLOW
    // Find latest entry <= today
    const sortedCash = [...cashFlowData].sort((a, b) =>
      b.competenceDate.localeCompare(a.competenceDate)
    );
    const currentCash = sortedCash.find((c) => c.competenceDate <= todayStr);
    // Project Dec 31 (Assuming latest entry of year is projection)
    const projectedCash = sortedCash.find((c) =>
      c.competenceDate.startsWith(currentYear.toString())
    );

    // 2. FINANCIAL (Revenue / OPAC)
    const dre = processModuleB1(
      yearTransactions,
      currentYear,
      11,
      cat2Mappings,
      [],
      11
    );

    const revLine = dre.find((l) => l.label === "RECEITAS");
    const opacLine = dre.find((l) => l.label === "OPAC");

    // Calculate YTD manually (0 to currentMonthIdx)
    const revYTD = revLine
      ? revLine.values
          .slice(0, currentMonthIdx + 1)
          .reduce((acc, b) => acc + b.value, 0)
      : 0;
    const revProj = revLine
      ? revLine.values.reduce((acc, b) => acc + b.value, 0)
      : 0; // Full year

    const opacYTD = opacLine
      ? opacLine.values
          .slice(0, currentMonthIdx + 1)
          .reduce((acc, b) => acc + b.value, 0)
      : 0;
    const opacProj = opacLine
      ? opacLine.values.reduce((acc, b) => acc + b.value, 0)
      : 0;

    // 3. PROVISIONS & RECEIVABLES

    // Special logic for Dashboard Provisions: Last 18 months to Current Month
    const eighteenMonthsAgo = new Date(now);
    eighteenMonthsAgo.setMonth(now.getMonth() - 18);
    const limitDate = eighteenMonthsAgo.toISOString().substring(0, 10);

    const recentTransactions = yearTransactions.filter(
      (t) => t.competenceDate >= limitDate
    );
    // Pass YYYY-MM format to avoid parsing errors in service
    // Dashboard uses default (Com Repasse) logic for Provisions
    const provisions = processModuleB4(
      recentTransactions,
      currentMonthStr,
      cat2Mappings,
      false
    );
    const totalProvisions = provisions.reduce(
      (acc, p) => acc + p.total.value,
      0
    );

    // Dashboard uses default (Com Repasse) logic for Receivables
    const receivables = processModuleB5(
      yearTransactions,
      todayStr,
      cat2Mappings,
      false
    );
    const totalReceivables = receivables.reduce(
      (acc, r) => acc + r.total.value,
      0
    );
    const currentAndOverdueReceivables = receivables.reduce(
      (acc, r) =>
        acc + r.buckets.overduePrev.value + r.buckets.currentMonth.value,
      0
    );

    // A Receber (Sem Repasse) - B5 with onlyRec=true
    const receivablesNoRepasse = processModuleB5(
      yearTransactions,
      todayStr,
      cat2Mappings,
      true
    );
    const totalReceivablesNoRepasse = receivablesNoRepasse.reduce(
      (acc, r) => acc + r.total.value,
      0
    );

    // 4. HR METRICS (Latest available extraction)
    const processedPeople = processPeopleData(peopleData, peopleConfig);
    const allMetrics = aggregatePeopleMetrics(processedPeople, monthlyRevenue);
    // Sort by month ascending (just in case) then take last
    allMetrics.sort((a, b) => a.month.localeCompare(b.month));
    const latestHR =
      allMetrics.length > 0 ? allMetrics[allMetrics.length - 1] : null;

    return {
      cashCurrent: currentCash ? currentCash.balance : 0,
      cashProjected: projectedCash ? projectedCash.balance : 0,
      revenueYTD: revYTD,
      revenueProj: revProj,
      opacYTD: opacYTD,
      opacProj: opacProj,
      provisions: totalProvisions,
      receivablesTotal: totalReceivables,
      receivablesDue: currentAndOverdueReceivables,
      receivablesNoRepasse: totalReceivablesNoRepasse,
      hr: latestHR,
    };
  }, [
    transactions,
    cashFlowData,
    peopleData,
    peopleConfig,
    yearTransactions,
    cat2Mappings,
    monthlyRevenue,
  ]);

  // HIDE Filters for B6 or Module C or Dashboard
  const showGlobalFilters =
    !(currentView === "MODULE_B" && activeModuleBTab === "B6") &&
    currentView !== "MODULE_C" &&
    currentView !== "DASHBOARD";

  const Card = ({ title, value, subLabel, subValue, color = "blue" }: any) => (
    <div
      className={`bg-white p-6 rounded-lg shadow-sm border border-gray-200 relative overflow-hidden`}
    >
      <div className={`absolute top-0 left-0 w-1 h-full bg-${color}-500`}></div>
      <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wide mb-1">
        {title}
      </h3>
      <p className="text-2xl font-bold text-slate-800">
        {formatCurrency(value)}
      </p>
      {subLabel && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center text-xs">
          <span className="text-gray-500">{subLabel}</span>
          <span className={`font-semibold text-${color}-600`}>{subValue}</span>
        </div>
      )}
    </div>
  );

  // --- AUTH GUARD ---
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-850 text-white flex-shrink-0 flex flex-col">
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-2xl font-bold tracking-tight text-blue-400">
            FINANCE<span className="text-white">BI</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Management Dashboard</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setCurrentView("DASHBOARD")}
            className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
              currentView === "DASHBOARD"
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-700"
            }`}
          >
            Dashboard Overview
          </button>
          <div className="pt-4 pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Modules
          </div>
          <button
            onClick={() => setCurrentView("MODULE_A")}
            className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
              currentView === "MODULE_A"
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-700"
            }`}
          >
            A. Controle Repasses
          </button>
          <button
            onClick={() => setCurrentView("MODULE_B")}
            className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
              currentView === "MODULE_B"
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-700"
            }`}
          >
            B. Relatórios Gerenciais
          </button>
          <button
            onClick={() => setCurrentView("MODULE_C")}
            className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
              currentView === "MODULE_C"
                ? "bg-blue-600 text-white"
                : "text-slate-300 hover:bg-slate-700"
            }`}
          >
            C. Pessoas / HR
          </button>

          <div className="pt-4 pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Config
          </div>
          <button
            onClick={() => setIsConfigOpen(true)}
            className="w-full text-left px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors flex items-center justify-between"
          >
            <span>Configurar Cat2</span>
            <span className="text-xs bg-slate-600 px-2 py-0.5 rounded">
              Edit
            </span>
          </button>

          <button
            onClick={() => setIsPeopleConfigOpen(true)}
            className="w-full text-left px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors flex items-center justify-between"
          >
            <span>Config Pessoas</span>
            <span className="text-xs bg-slate-600 px-2 py-0.5 rounded">
              Edit
            </span>
          </button>

          <button
            onClick={() => setIsDataModalOpen(true)}
            className={`w-full text-left px-4 py-3 rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-between ${
              isUsingRealData ? "text-green-400" : "text-slate-300"
            }`}
          >
            <span>
              {isUsingRealData ? "Dados Conectados" : "Conectar Dados"}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                isUsingRealData ? "bg-green-900 text-green-300" : "bg-slate-600"
              }`}
            >
              {isUsingRealData ? "ON" : "OFF"}
            </span>
          </button>
        </nav>
        <div className="p-4 text-xs text-slate-500 border-t border-slate-700 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span>v1.8.0 • {isUsingRealData ? "Real" : "Mock"}</span>
            {isUsingRealData && (
              <span className="text-green-500 text-[10px]">● Live</span>
            )}
          </div>
          {isLoadingAuto && (
            <div className="text-[10px] text-yellow-400 animate-pulse">
              Atualizando dados...
            </div>
          )}
          <button
            onClick={handleLogout}
            className="text-left text-red-400 hover:text-red-300 transition-colors"
          >
            Sair (Logout)
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Bar - Conditional Render */}
        {showGlobalFilters && (
          <Filters
            filters={filters}
            setFilters={setFilters}
            showRelatedTo={currentView === "MODULE_A"}
            viewMode={currentView as any}
            activeModuleBTab={activeModuleBTab}
            availableCat2s={uniqueCat2s}
            availableCostCenters={uniqueCostCenters}
          />
        )}

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-auto p-6 bg-gray-50">
          {currentView === "DASHBOARD" && (
            <div className="max-w-7xl mx-auto space-y-8">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">
                    Visão Geral
                  </h2>
                  <p className="text-sm text-gray-500">
                    Resumo financeiro e operacional ({new Date().getFullYear()})
                  </p>
                </div>
              </div>

              {/* --- FINANCIAL ROW --- */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 border-b pb-2">
                  Indicadores Financeiros
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <Card
                    title="Caixa (Hoje)"
                    value={dashboardMetrics.cashCurrent}
                    subLabel="Projeção Dez/31"
                    subValue={formatCurrency(dashboardMetrics.cashProjected)}
                    color="green"
                  />

                  <Card
                    title="Receita Acumulada (YTD)"
                    value={dashboardMetrics.revenueYTD}
                    subLabel="Projeção Dez/31"
                    subValue={formatCurrency(dashboardMetrics.revenueProj)}
                    color="blue"
                  />

                  <Card
                    title="OPAC Acumulado (YTD)"
                    value={dashboardMetrics.opacYTD}
                    subLabel="Projeção Dez/31"
                    subValue={formatCurrency(dashboardMetrics.opacProj)}
                    color="purple"
                  />

                  <Card
                    title="Provisões (A Faturar)"
                    value={dashboardMetrics.provisions}
                    subLabel="Total a Receber"
                    subValue={formatCurrency(dashboardMetrics.receivablesTotal)}
                    color="yellow"
                  />
                </div>

                {/* Receivables Details */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="bg-orange-50 p-4 rounded border border-orange-100 col-span-1 md:col-start-3">
                    <h4 className="text-xs font-bold text-orange-800 uppercase">
                      A Receber (Liq/Sem Repasse)
                    </h4>
                    <p className="text-xl font-bold text-orange-600 mt-1">
                      {formatCurrency(dashboardMetrics.receivablesNoRepasse)}
                    </p>
                    <p className="text-xs text-orange-700 mt-2">
                      Valor filtrado apenas de receitas da casa.
                    </p>
                  </div>
                  <div className="bg-red-50 p-4 rounded border border-red-100 col-span-1 md:col-start-4">
                    <h4 className="text-xs font-bold text-red-800 uppercase">
                      A Receber (Vencidos + Mês Atual)
                    </h4>
                    <p className="text-xl font-bold text-red-600 mt-1">
                      {formatCurrency(dashboardMetrics.receivablesDue)}
                    </p>
                    <p className="text-xs text-red-700 mt-2">
                      Valor crítico para gestão de caixa de curto prazo.
                    </p>
                  </div>
                </div>
              </div>

              {/* --- HR ROW --- */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 border-b pb-2 flex items-center gap-2">
                  Pessoas & Performance
                  {dashboardMetrics.hr && (
                    <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                      Data Base: {dashboardMetrics.hr.month}
                    </span>
                  )}
                </h3>
                {dashboardMetrics.hr ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
                      <h4 className="text-xs text-gray-500 font-bold uppercase">
                        Headcount
                      </h4>
                      <div className="mt-2 flex justify-between items-baseline">
                        <div>
                          <span className="text-2xl font-bold text-slate-700">
                            {dashboardMetrics.hr.billableHeadcount.toFixed(1)}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">
                            Billable
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-bold text-gray-400">
                            {dashboardMetrics.hr.nbHeadcount.toFixed(1)}
                          </span>
                          <span className="text-xs text-gray-400 ml-1 block">
                            NB
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
                      <h4 className="text-xs text-gray-500 font-bold uppercase">
                        Médias Salariais
                      </h4>
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">PJ:</span>
                          <span className="font-bold">
                            {formatCurrency(dashboardMetrics.hr.avgSalaryPJ)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">CLT (Custo):</span>
                          <span className="font-bold">
                            {formatCurrency(dashboardMetrics.hr.avgCostCLT)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded shadow-sm border border-gray-200 flex flex-col justify-between">
                      <h4 className="text-xs text-gray-500 font-bold uppercase">
                        Desligamentos
                      </h4>
                      <p className="text-3xl font-bold text-red-600 mt-1">
                        {dashboardMetrics.hr.terminations}
                      </p>
                    </div>

                    <div className="bg-white p-4 rounded shadow-sm border border-gray-200 col-span-2">
                      <h4 className="text-xs text-gray-500 font-bold uppercase">
                        Margem / Billable
                      </h4>
                      <div className="flex justify-between items-end mt-2">
                        <p className="text-3xl font-bold text-green-600">
                          {formatCurrency(
                            dashboardMetrics.hr.marginPerBillable
                          )}
                        </p>
                        <div className="text-right text-xs text-gray-400">
                          <p>
                            Receita/Billable:{" "}
                            {formatCurrency(
                              dashboardMetrics.hr.revenuePerBillable
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center bg-gray-100 rounded border border-gray-200 text-gray-500">
                    Sem dados de pessoas recentes. Verifique o módulo C.
                  </div>
                )}
              </div>
            </div>
          )}

          {currentView === "MODULE_A" && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 min-h-[500px]">
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h2 className="font-bold text-lg text-slate-800">
                  Controle de Repasses
                </h2>
              </div>
              <ModuleA
                transactions={filteredTransactions}
                relatedToFilter={filters.relatedToFilter}
              />
            </div>
          )}

          {currentView === "MODULE_B" && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 min-h-[500px]">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h2 className="font-bold text-lg text-slate-800">
                  Relatórios Gerenciais (DRE)
                </h2>
              </div>
              <ModuleB
                transactions={filteredTransactions}
                yearTransactions={yearTransactions}
                rawTransactions={transactions}
                cashFlow={cashFlowData}
                filters={filters}
                cat2Mapping={cat2Mappings}
                activeTab={activeModuleBTab}
                setActiveTab={setActiveModuleBTab}
              />
            </div>
          )}

          {currentView === "MODULE_C" && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 min-h-[500px]">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h2 className="font-bold text-lg text-slate-800">
                  Pessoas / HR
                </h2>
              </div>
              <ModuleC
                peopleData={peopleData}
                peopleConfig={peopleConfig}
                monthlyRevenue={monthlyRevenue}
              />
            </div>
          )}
        </div>
      </main>

      {isConfigOpen && (
        <ConfigCat2
          mappings={cat2Mappings}
          setMappings={setCat2Mappings}
          uniqueCategories={uniqueCategories}
          onClose={() => setIsConfigOpen(false)}
        />
      )}

      {isPeopleConfigOpen && (
        <ConfigPeople
          configs={peopleConfig}
          setConfigs={setPeopleConfig}
          onClose={() => setIsPeopleConfigOpen(false)}
        />
      )}

      {isDataModalOpen && (
        <DataConfigModal
          onClose={() => setIsDataModalOpen(false)}
          onConnect={handleConnectData}
        />
      )}
    </div>
  );
};

export default App;
