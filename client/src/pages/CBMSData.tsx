import { useState, useMemo, useEffect } from "react";
import CBMSAlertPanel from "@/components/CBMSAlertPanel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CBMSThresholdConfig from "@/components/CBMSThresholdConfig";
import CrimeHotspotMap from "@/components/CrimeHotspotMap";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RefreshCw,
  Activity,
  Minus,
  TrendingDown,
  TrendingUp,
  Users,
  Heart,
  Home,
  Droplets,
  BookOpen,
  DollarSign,
  Shield,
  Star,
  AlertTriangle,
  CheckCircle,
  Info,
  BarChart3,
  MapPin,
} from "lucide-react";

const VALID_TABS = new Set([
  "live",
  "overview",
  "demography",
  "health",
  "housing",
  "water",
  "education",
  "income",
  "peace",
  "other",
  "citywide",
  "alerts",
  "thresholds",
]);

// ── Static city-wide context (reference data, not survey-computed) ─────────────
const BARANGAY_POPULATION = [
  { name: "San Vicente", population: 79920, pct: 25.3 },
  { name: "San Antonio", population: 74786, pct: 23.7 },
  { name: "Langgam", population: 32157, pct: 10.2 },
  { name: "Landayan", population: 24489, pct: 7.8 },
  { name: "Cuyab", population: 22100, pct: 7.0 },
  { name: "Magsaysay", population: 14135, pct: 4.5, highlight: true },
  { name: "Estrella", population: 8897, pct: 2.8 },
  { name: "United Bayanihan", population: 6620, pct: 2.1 },
  { name: "Poblacion", population: 6237, pct: 2.0 },
  { name: "Bagong Silang", population: 6044, pct: 1.9 },
];

function StatCard({ label, value, sub, color = "blue", icon: Icon }: {
  label: string; value: string | number; sub?: string; color?: string; icon: React.ElementType;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    teal: "bg-teal-50 text-teal-700 border-teal-200",
  };
  return (
    <div className={`rounded-lg border p-4 ${colorMap[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wide opacity-75">{label}</span>
      </div>
      <div className="text-2xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</div>
      {sub && <div className="text-xs mt-1 opacity-70">{sub}</div>}
    </div>
  );
}

function ProgressBar({ value, max, color = "bg-blue-500" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function pct(count: number, total: number, decimals = 1) {
  if (!total) return "0%";
  return `${(count / total * 100).toFixed(decimals)}%`;
}

function LoadingRow() {
  return <Skeleton className="h-5 w-full my-1" />;
}

export default function CBMSData() {
  const [activeTab, setActiveTab] = useState("live");
  const [selectedBarangay, setSelectedBarangay] = useState<string>("all");

  const { data: liveData, isLoading: liveLoading, isError: liveError, error: liveErrorData, refetch: refetchLive } =
    trpc.cbms.indicators.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: bisBarangayList } = trpc.households.barangayList.useQuery();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tabFromUrl = new URLSearchParams(window.location.search).get("tab");
    if (tabFromUrl && VALID_TABS.has(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, []);

  const handleTabChange = (nextTab: string) => {
    setActiveTab(nextTab);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.replaceState({}, "", url.toString());
  };

  const total = liveData?.totalApprovedHouseholds ?? 0;
  const totalMembers = liveData?.totalMembers ?? 0;

  // Derived: barangay list for the shared filter dropdown.
  // Primary source: BIS-linked barangay master list from households.
  // Fallback source: live CBMS breakdowns.
  const barangayOptions = useMemo(() => {
    const fromBis = (bisBarangayList ?? []).filter(Boolean);
    const fromLive = (liveData?.barangayBreakdowns ?? []).map(d => d.barangay).filter(Boolean);
    return Array.from(new Set([...fromBis, ...fromLive])).sort((a, b) => a.localeCompare(b));
  }, [bisBarangayList, liveData]);

  useEffect(() => {
    if (selectedBarangay === "all") return;
    if (!barangayOptions.includes(selectedBarangay)) {
      setSelectedBarangay("all");
    }
  }, [barangayOptions, selectedBarangay]);

  // Derived: the selected barangay's breakdown entry (or null if "all")
  const selectedBrgyData = useMemo(() => {
    if (selectedBarangay === "all") return null;
    return liveData?.barangayBreakdowns?.find(d => d.barangay === selectedBarangay) ?? null;
  }, [liveData, selectedBarangay]);

  // Derived: effective totals for the selected barangay (or all)
  const effTotal = selectedBrgyData ? selectedBrgyData.totalHouseholds : total;
  const effMembers = selectedBrgyData ? selectedBrgyData.totalMembers : (liveData?.totalMembers ?? 0);
  const effMale = selectedBrgyData ? selectedBrgyData.totalMale : (liveData?.totalMale ?? 0);
  const effFemale = selectedBrgyData ? selectedBrgyData.totalFemale : (liveData?.totalFemale ?? 0);

  // Derived: filtered crime data based on selected barangay
  const filteredCrimeData = useMemo(() => {
    const all = liveData?.peaceAndOrder.barangayCrimeData ?? [];
    if (selectedBarangay === "all") return all;
    return all.filter(d => d.barangay === selectedBarangay);
  }, [liveData, selectedBarangay]);

  // Derived: aggregated stats for the selected barangay (or all)
  const filteredStats = useMemo(() => {
    if (selectedBarangay === "all") {
      return {
        victimHouseholds: liveData?.peaceAndOrder.victimHouseholds ?? 0,
        totalVictims: liveData?.peaceAndOrder.totalVictims ?? 0,
        maleVictims: liveData?.peaceAndOrder.maleVictims ?? 0,
        femaleVictims: liveData?.peaceAndOrder.femaleVictims ?? 0,
        crimeReportedCount: liveData?.peaceAndOrder.crimeReportedCount ?? 0,
        crimeReportingRate: liveData?.peaceAndOrder.crimeReportingRate ?? 0,
        crimeTypeBreakdown: liveData?.peaceAndOrder.crimeTypeBreakdown ?? {},
        totalHouseholds: total,
      };
    }
    const entry = filteredCrimeData[0];
    if (!entry) return { victimHouseholds: 0, totalVictims: 0, maleVictims: 0, femaleVictims: 0, crimeReportedCount: 0, crimeReportingRate: 0, crimeTypeBreakdown: {}, totalHouseholds: 0 };
    const crimeTypeBreakdown: Record<string, number> = {};
    entry.crimeTypes.forEach(t => { crimeTypeBreakdown[t] = (crimeTypeBreakdown[t] || 0) + 1; });
    return {
      victimHouseholds: entry.victimHouseholds,
      totalVictims: entry.totalVictims,
      maleVictims: entry.maleVictims,
      femaleVictims: entry.femaleVictims,
      crimeReportedCount: 0,
      crimeReportingRate: entry.totalHouseholds > 0
        ? Math.round((entry.victimHouseholds / entry.totalHouseholds) * 100)
        : 0,
      crimeTypeBreakdown,
      totalHouseholds: entry.totalHouseholds,
    };
  }, [selectedBarangay, filteredCrimeData, liveData, total]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-5 h-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">CBMS 13+1 Core Indicators</h1>
          </div>
          <p className="text-gray-500 text-sm">Barangay filter is synchronized with BIS-linked barangay records and combined with approved CBMS survey data.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Shared Barangay Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-600">Filter:</span>
            <Select value={selectedBarangay} onValueChange={setSelectedBarangay}>
              <SelectTrigger className="w-52 h-8 text-xs">
                <SelectValue placeholder="All Barangays" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Barangays</SelectItem>
                {barangayOptions.map(b => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBarangay !== "all" && (
              <button
                onClick={() => setSelectedBarangay("all")}
                className="text-xs text-blue-600 underline"
              >
                Clear
              </button>
            )}
          </div>
          <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
            <Activity className="w-3 h-3 mr-1" /> Live Survey Data
          </Badge>
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => refetchLive()}>
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
      </div>

      {liveError && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-red-700">Unable To Load Live CBMS Data</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-xs text-red-700/90">{liveErrorData?.message || "Please retry."}</p>
            <Button variant="outline" size="sm" className="h-8" onClick={() => refetchLive()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Top Summary Cards — filtered by selected barangay */}
      {selectedBarangay !== "all" && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
          <MapPin className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-800">Showing data for Barangay <strong>{selectedBarangay}</strong></span>
          <button onClick={() => setSelectedBarangay("all")} className="ml-auto text-xs text-blue-600 underline">Show all barangays</button>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Approved Surveys"
          value={liveLoading ? "…" : effTotal}
          sub={selectedBarangay !== "all" ? `Brgy. ${selectedBarangay}` : "Households surveyed"}
          color="blue"
          icon={Home}
        />
        <StatCard
          label="Total Population"
          value={liveLoading ? "…" : effMembers}
          sub="From household rosters"
          color="purple"
          icon={Users}
        />
        <StatCard
          label="Male Members"
          value={liveLoading ? "…" : effMale}
          sub={liveLoading ? "" : `${pct(effMale, effMembers)} of total`}
          color="teal"
          icon={Users}
        />
        <StatCard
          label="Female Members"
          value={liveLoading ? "…" : effFemale}
          sub={liveLoading ? "" : `${pct(effFemale, effMembers)} of total`}
          color="green"
          icon={Users}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-gray-100 p-1">
          <TabsTrigger value="live" className="text-xs font-semibold text-green-700">📊 Live vs. Baseline</TabsTrigger>
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="demography" className="text-xs">Demography</TabsTrigger>
          <TabsTrigger value="health" className="text-xs">Health</TabsTrigger>
          <TabsTrigger value="housing" className="text-xs">Housing</TabsTrigger>
          <TabsTrigger value="water" className="text-xs">Water & Sanitation</TabsTrigger>
          <TabsTrigger value="education" className="text-xs">Education</TabsTrigger>
          <TabsTrigger value="income" className="text-xs">Income</TabsTrigger>
          <TabsTrigger value="peace" className="text-xs">Peace & Order</TabsTrigger>
          <TabsTrigger value="other" className="text-xs">Other Indicators</TabsTrigger>
          <TabsTrigger value="citywide" className="text-xs">City-wide Context</TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs font-semibold text-amber-700">🔔 Alerts</TabsTrigger>
          <TabsTrigger value="thresholds" className="text-xs font-semibold text-blue-700">⚙️ Thresholds</TabsTrigger>
        </TabsList>

        {/* ── LIVE VS. BASELINE ─────────────────────────────── */}
        <TabsContent value="live" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="text-xs text-green-600 mb-1 font-medium">Approved Surveys</div>
              <div className="text-2xl font-bold text-green-800">{liveLoading ? "…" : total}</div>
              <div className="text-xs text-green-500">households</div>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-xs text-blue-600 mb-1 font-medium">Total Members</div>
              <div className="text-2xl font-bold text-blue-800">{liveLoading ? "…" : totalMembers}</div>
              <div className="text-xs text-blue-500">from approved surveys</div>
            </div>
            <div className="text-center p-3 bg-amber-50 rounded-lg border border-amber-200">
              <div className="text-xs text-amber-600 mb-1 font-medium">Indicators Improved</div>
              <div className="text-2xl font-bold text-amber-800">
                {liveLoading ? "…" : (liveData?.indicators.filter(i => i.trend === "improved").length ?? 0)}
              </div>
              <div className="text-xs text-amber-500">vs. baseline</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
              <div className="text-xs text-red-600 mb-1 font-medium">Indicators Worsened</div>
              <div className="text-2xl font-bold text-red-800">
                {liveLoading ? "…" : (liveData?.indicators.filter(i => i.trend === "worsened").length ?? 0)}
              </div>
              <div className="text-xs text-red-500">need attention</div>
            </div>
          </div>

          {liveLoading ? (
            <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : (
            <div className="space-y-3">
              {(liveData?.indicators ?? []).map((ind) => {
                const trendIcon = ind.trend === "improved"
                  ? <TrendingDown className="w-4 h-4 text-green-600" />
                  : ind.trend === "worsened"
                  ? <TrendingUp className="w-4 h-4 text-red-600" />
                  : <Minus className="w-4 h-4 text-gray-400" />;
                const trendColor = ind.trend === "improved" ? "text-green-600" : ind.trend === "worsened" ? "text-red-600" : "text-gray-500";
                return (
                  <div key={ind.indicator} className="flex items-center gap-3 p-3 bg-white border rounded-lg">
                    <div className="w-5 h-5 shrink-0">{trendIcon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-gray-800 truncate">{ind.indicator}</span>
                        <span className="text-xs text-gray-400 ml-2 shrink-0">{ind.category}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-green-700 font-semibold">Survey: {ind.surveyCount.toLocaleString()} ({ind.surveyPct}%)</span>
                        {ind.baselineCount > 0 && (
                          <span className="text-blue-600">Baseline: {ind.baselineCount.toLocaleString()} ({ind.baselinePct}%)</span>
                        )}
                        {ind.trend !== "no_baseline" && (
                          <span className={`font-semibold ${trendColor}`}>
                            {ind.trendDiff > 0 ? "+" : ""}{ind.trendDiff}pp
                          </span>
                        )}
                      </div>
                      <ProgressBar value={ind.surveyCount} max={total} color={ind.trend === "worsened" ? "bg-red-400" : ind.trend === "improved" ? "bg-green-400" : "bg-blue-400"} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── OVERVIEW ─────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4 text-blue-500" />Population</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {liveLoading ? <LoadingRow /> : <>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Total members</span><span className="font-semibold">{totalMembers.toLocaleString()}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Male</span><span className="font-semibold text-teal-600">{(liveData?.totalMale ?? 0).toLocaleString()} ({pct(liveData?.totalMale ?? 0, totalMembers)})</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Female</span><span className="font-semibold text-pink-600">{(liveData?.totalFemale ?? 0).toLocaleString()} ({pct(liveData?.totalFemale ?? 0, totalMembers)})</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Children 0–5</span><span className="font-semibold">{(liveData?.demography.age0to5 ?? 0).toLocaleString()}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Labor force (15–64)</span><span className="font-semibold">{(liveData?.demography.laborForce ?? 0).toLocaleString()}</span></div>
                </>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Heart className="w-4 h-4 text-red-500" />Health</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {liveLoading ? <LoadingRow /> : <>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Child mortality (HH)</span><span className={`font-semibold ${(liveData?.health.childMortality ?? 0) > 0 ? "text-red-600" : "text-green-600"}`}>{liveData?.health.childMortality ?? 0}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Maternal mortality (HH)</span><span className={`font-semibold ${(liveData?.health.maternalMortality ?? 0) > 0 ? "text-red-600" : "text-green-600"}`}>{liveData?.health.maternalMortality ?? 0}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Malnourished children 0–5</span><span className="font-semibold text-amber-600">{liveData?.health.malnourishedChildren ?? 0}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">With PhilHealth</span><span className="font-semibold text-green-600">{(liveData?.health.withPhilHealth ?? 0).toLocaleString()} ({pct(liveData?.health.withPhilHealth ?? 0, total)})</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Without health insurance</span><span className="font-semibold text-red-600">{(liveData?.health.withoutHealthInsurance ?? 0).toLocaleString()} ({pct(liveData?.health.withoutHealthInsurance ?? 0, total)})</span></div>
                </>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Home className="w-4 h-4 text-orange-500" />Housing</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {liveLoading ? <LoadingRow /> : <>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Makeshift housing</span><span className="font-semibold text-amber-600">{(liveData?.housing.makeshiftHousing ?? 0).toLocaleString()} ({pct(liveData?.housing.makeshiftHousing ?? 0, total)})</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Informal settlers</span><span className="font-semibold text-red-600">{(liveData?.housing.informalSettlers ?? 0).toLocaleString()} ({pct(liveData?.housing.informalSettlers ?? 0, total)})</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Both makeshift & informal</span><span className="font-semibold text-red-600">{(liveData?.housing.bothMakeshiftAndInformal ?? 0).toLocaleString()} ({pct(liveData?.housing.bothMakeshiftAndInformal ?? 0, total)})</span></div>
                </>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Droplets className="w-4 h-4 text-blue-500" />Water & Sanitation</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {liveLoading ? <LoadingRow /> : <>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Without safe water access</span><span className="font-semibold text-red-600">{(liveData?.water.withoutSafeWater ?? 0).toLocaleString()} ({pct(liveData?.water.withoutSafeWater ?? 0, total)})</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Without sanitary toilet</span><span className="font-semibold text-amber-600">{(liveData?.water.withoutSanitaryToilet ?? 0).toLocaleString()} ({pct(liveData?.water.withoutSanitaryToilet ?? 0, total)})</span></div>
                  <ProgressBar value={liveData?.water.withoutSafeWater ?? 0} max={total} color="bg-red-400" />
                  <p className="text-xs text-gray-400">{pct(liveData?.water.withoutSafeWater ?? 0, total)} of households lack safe water</p>
                </>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><DollarSign className="w-4 h-4 text-yellow-500" />Income & Livelihood</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {liveLoading ? <LoadingRow /> : <>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Below poverty threshold</span><span className="font-semibold text-red-600">{(liveData?.income.belowPoverty ?? 0).toLocaleString()} ({pct(liveData?.income.belowPoverty ?? 0, total)})</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Below food threshold</span><span className="font-semibold text-red-600">{(liveData?.income.belowFoodThreshold ?? 0).toLocaleString()} ({pct(liveData?.income.belowFoodThreshold ?? 0, total)})</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Experience food shortage</span><span className="font-semibold text-amber-600">{(liveData?.income.experiencedFoodShortage ?? 0).toLocaleString()} ({pct(liveData?.income.experiencedFoodShortage ?? 0, total)})</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Unemployed members</span><span className="font-semibold text-amber-600">{(liveData?.income.unemployed ?? 0).toLocaleString()}</span></div>
                </>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="w-4 h-4 text-indigo-500" />Basic Education</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {liveLoading ? <LoadingRow /> : <>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">6–11 not in elementary</span><span className="font-semibold text-amber-600">{(liveData?.education.outOfSchool6to11 ?? 0).toLocaleString()}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">12–15 not in high school</span><span className="font-semibold text-red-600">{(liveData?.education.outOfSchool12to15 ?? 0).toLocaleString()}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Illiterate (10+)</span><span className="font-semibold text-amber-600">{(liveData?.education.illiterate10plus ?? 0).toLocaleString()}</span></div>
                </>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Star className="w-4 h-4 text-purple-500" />Other Key Indicators</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {liveLoading ? <LoadingRow /> : <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Registered voters (live)</span>
                    <span className="font-semibold text-green-600">
                      {(liveData?.registeredVoterCount ?? 0).toLocaleString()} ({liveData && liveData.eligibleVoterCount > 0 ? pct(liveData.registeredVoterCount, liveData.eligibleVoterCount) : "0%"})
                    </span>
                  </div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">HH with electricity</span><span className="font-semibold text-green-600">{(liveData?.other.withElectricity ?? 0).toLocaleString()} ({pct(liveData?.other.withElectricity ?? 0, total)})</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Senior citizens</span><span className="font-semibold">{(liveData?.other.seniorCitizens ?? 0).toLocaleString()}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Solo parents</span><span className="font-semibold">{(liveData?.income.soloParents ?? 0).toLocaleString()}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">PWD members</span><span className="font-semibold">{(liveData?.other.pwdCount ?? 0).toLocaleString()}</span></div>
                </>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── DEMOGRAPHY ───────────────────────────────────── */}
        <TabsContent value="demography">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-blue-600" />Demographic Breakdown{selectedBarangay !== "all" && <span className="ml-2 text-sm font-normal text-blue-500">— Brgy. {selectedBarangay}</span>}</CardTitle>
              <p className="text-sm text-gray-500">
                {liveLoading ? "Loading…" : `Total Households: ${effTotal.toLocaleString()} · Total Members: ${effMembers.toLocaleString()} (Male: ${effMale.toLocaleString()} · Female: ${effFemale.toLocaleString()})`}
              </p>
            </CardHeader>
            <CardContent>
              {liveLoading ? (
                <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-2 px-3 font-semibold text-gray-700">Age Group</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-700">Members</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-700">% of Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "Children under 5 years old", count: selectedBrgyData ? selectedBrgyData.under5 : (liveData?.demography.under5 ?? 0) },
                        { label: "Children 6–11 years old", count: selectedBrgyData ? selectedBrgyData.age6to11 : (liveData?.demography.age6to11 ?? 0) },
                        { label: "Members 12–15 years old", count: selectedBrgyData ? selectedBrgyData.age12to15 : (liveData?.demography.age12to15 ?? 0) },
                        { label: "Labor force (15–64 years old)", count: selectedBrgyData ? selectedBrgyData.laborForce : (liveData?.demography.laborForce ?? 0) },
                        { label: "Senior Citizens (60+)", count: selectedBrgyData ? selectedBrgyData.seniorCitizens : (liveData?.other.seniorCitizens ?? 0) },
                      ].map((row, i) => (
                        <tr key={i} className={`border-b ${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50 transition-colors`}>
                          <td className="py-2 px-3 text-gray-800">{row.label}</td>
                          <td className="py-2 px-3 text-right font-medium text-blue-700">{row.count.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right text-gray-500">{pct(row.count, effMembers)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                All figures are computed from approved household survey rosters.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── HEALTH ───────────────────────────────────────── */}
        <TabsContent value="health" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              label={`Child Mortality (under 5)${selectedBarangay !== "all" ? " — " + selectedBarangay : ""}`}
              value={liveLoading ? "…" : `${selectedBrgyData ? selectedBrgyData.childMortality : (liveData?.health.childMortality ?? 0)} HH`}
              sub={liveLoading ? "" : `${pct(selectedBrgyData ? selectedBrgyData.childMortality : (liveData?.health.childMortality ?? 0), effTotal)} of households`}
              color={(selectedBrgyData ? selectedBrgyData.childMortality : (liveData?.health.childMortality ?? 0)) > 0 ? "amber" : "green"}
              icon={(selectedBrgyData ? selectedBrgyData.childMortality : (liveData?.health.childMortality ?? 0)) > 0 ? AlertTriangle : CheckCircle}
            />
            <StatCard
              label="Maternal Mortality"
              value={liveLoading ? "…" : `${selectedBrgyData ? selectedBrgyData.maternalMortality : (liveData?.health.maternalMortality ?? 0)} cases`}
              sub={(selectedBrgyData ? selectedBrgyData.maternalMortality : (liveData?.health.maternalMortality ?? 0)) === 0 ? "No pregnancy-related deaths" : "Requires immediate attention"}
              color={(selectedBrgyData ? selectedBrgyData.maternalMortality : (liveData?.health.maternalMortality ?? 0)) > 0 ? "red" : "green"}
              icon={(selectedBrgyData ? selectedBrgyData.maternalMortality : (liveData?.health.maternalMortality ?? 0)) > 0 ? AlertTriangle : CheckCircle}
            />
            <StatCard
              label="Malnourished Children 0–5"
              value={liveLoading ? "…" : (selectedBrgyData ? selectedBrgyData.malnourishedChildren : (liveData?.health.malnourishedChildren ?? 0))}
              sub={liveLoading ? "" : `${pct(selectedBrgyData ? selectedBrgyData.malnourishedChildren : (liveData?.health.malnourishedChildren ?? 0), selectedBrgyData ? selectedBrgyData.under5 : (liveData?.demography.age0to5 ?? 1))} of children 0–5`}
              color={(selectedBrgyData ? selectedBrgyData.malnourishedChildren : (liveData?.health.malnourishedChildren ?? 0)) > 0 ? "red" : "green"}
              icon={Heart}
            />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Health & Nutrition Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {liveLoading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
              ) : (
                <>
                  <div className={`p-4 ${(liveData?.health.maternalMortality ?? 0) === 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"} border rounded-lg`}>
                    <div className="flex items-center gap-2 mb-1">
                      {(liveData?.health.maternalMortality ?? 0) === 0
                        ? <CheckCircle className="w-4 h-4 text-green-600" />
                        : <AlertTriangle className="w-4 h-4 text-red-600" />}
                      <span className={`font-semibold ${(liveData?.health.maternalMortality ?? 0) === 0 ? "text-green-800" : "text-red-800"}`}>
                        Maternal Mortality: {liveData?.health.maternalMortality ?? 0} case{(liveData?.health.maternalMortality ?? 0) !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <p className={`text-sm ${(liveData?.health.maternalMortality ?? 0) === 0 ? "text-green-700" : "text-red-700"}`}>
                      {(liveData?.health.maternalMortality ?? 0) === 0
                        ? "No women died due to pregnancy-related causes in the survey period. This is a positive indicator of maternal health services."
                        : `${liveData?.health.maternalMortality} household(s) reported maternal deaths. Immediate health intervention is required.`}
                    </p>
                  </div>
                  <div className={`p-4 ${(liveData?.health.malnourishedChildren ?? 0) > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"} border rounded-lg`}>
                    <div className="flex items-center gap-2 mb-1">
                      {(liveData?.health.malnourishedChildren ?? 0) > 0
                        ? <AlertTriangle className="w-4 h-4 text-amber-600" />
                        : <CheckCircle className="w-4 h-4 text-green-600" />}
                      <span className={`font-semibold ${(liveData?.health.malnourishedChildren ?? 0) > 0 ? "text-amber-800" : "text-green-800"}`}>
                        Malnourished Children: {liveData?.health.malnourishedChildren ?? 0}
                      </span>
                    </div>
                    <p className={`text-sm ${(liveData?.health.malnourishedChildren ?? 0) > 0 ? "text-amber-700" : "text-green-700"}`}>
                      {(liveData?.health.malnourishedChildren ?? 0) > 0
                        ? `${liveData?.health.malnourishedChildren} children aged 0–5 are malnourished. Targeted nutrition programs are recommended.`
                        : "No malnourished children reported in the survey period."}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">With PhilHealth Coverage</div>
                      <div className="text-2xl font-bold text-green-600">{(liveData?.health.withPhilHealth ?? 0).toLocaleString()}</div>
                      <div className="text-xs text-gray-500">{pct(liveData?.health.withPhilHealth ?? 0, total)} of households</div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Without Health Insurance</div>
                      <div className="text-2xl font-bold text-red-600">{(liveData?.health.withoutHealthInsurance ?? 0).toLocaleString()}</div>
                      <div className="text-xs text-gray-500">{pct(liveData?.health.withoutHealthInsurance ?? 0, total)} of households</div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── HOUSING ──────────────────────────────────────── */}
        <TabsContent value="housing" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              label="Makeshift Housing"
              value={liveLoading ? "…" : `${(selectedBrgyData ? selectedBrgyData.makeshiftHousing : (liveData?.housing.makeshiftHousing ?? 0)).toLocaleString()} HH`}
              sub={liveLoading ? "" : `${pct(selectedBrgyData ? selectedBrgyData.makeshiftHousing : (liveData?.housing.makeshiftHousing ?? 0), effTotal)} of households`}
              color="amber"
              icon={Home}
            />
            <StatCard
              label="Informal Settlers"
              value={liveLoading ? "…" : `${(selectedBrgyData ? selectedBrgyData.informalSettlers : (liveData?.housing.informalSettlers ?? 0)).toLocaleString()} HH`}
              sub={liveLoading ? "" : `${pct(selectedBrgyData ? selectedBrgyData.informalSettlers : (liveData?.housing.informalSettlers ?? 0), effTotal)} of households`}
              color="red"
              icon={AlertTriangle}
            />
            <StatCard
              label="Both Makeshift & Informal"
              value={liveLoading ? "…" : `${(liveData?.housing.bothMakeshiftAndInformal ?? 0).toLocaleString()} HH`}
              sub={liveLoading ? "" : `${pct(liveData?.housing.bothMakeshiftAndInformal ?? 0, effTotal)} of households`}
              color="red"
              icon={AlertTriangle}
            />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Housing Situation Analysis</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {liveLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Informal Settlers</span>
                      <span className="font-semibold text-red-600">{(liveData?.housing.informalSettlers ?? 0).toLocaleString()} / {total.toLocaleString()} households ({pct(liveData?.housing.informalSettlers ?? 0, total)})</span>
                    </div>
                    <ProgressBar value={liveData?.housing.informalSettlers ?? 0} max={total} color="bg-red-400" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Makeshift Housing</span>
                      <span className="font-semibold text-amber-600">{(liveData?.housing.makeshiftHousing ?? 0).toLocaleString()} / {total.toLocaleString()} households ({pct(liveData?.housing.makeshiftHousing ?? 0, total)})</span>
                    </div>
                    <ProgressBar value={liveData?.housing.makeshiftHousing ?? 0} max={total} color="bg-amber-400" />
                  </div>
                  {(liveData?.housing.informalSettlers ?? 0) > 0 && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700"><strong>Key Concern:</strong> {pct(liveData?.housing.informalSettlers ?? 0, total)} of surveyed households are informal settlers. This represents a significant housing security challenge requiring targeted resettlement or tenure regularization programs.</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── WATER & SANITATION ───────────────────────────── */}
        <TabsContent value="water" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard
              label={`Without Safe Water Access${selectedBarangay !== "all" ? " — " + selectedBarangay : ""}`}
              value={liveLoading ? "…" : `${(selectedBrgyData ? selectedBrgyData.withoutSafeWater : (liveData?.water.withoutSafeWater ?? 0)).toLocaleString()} HH`}
              sub={liveLoading ? "" : `${pct(selectedBrgyData ? selectedBrgyData.withoutSafeWater : (liveData?.water.withoutSafeWater ?? 0), effTotal)} of households`}
              color="red"
              icon={Droplets}
            />
            <StatCard
              label={`Without Sanitary Toilet${selectedBarangay !== "all" ? " — " + selectedBarangay : ""}`}
              value={liveLoading ? "…" : `${(selectedBrgyData ? selectedBrgyData.withoutSanitaryToilet : (liveData?.water.withoutSanitaryToilet ?? 0)).toLocaleString()} HH`}
              sub={liveLoading ? "" : `${pct(selectedBrgyData ? selectedBrgyData.withoutSanitaryToilet : (liveData?.water.withoutSanitaryToilet ?? 0), effTotal)} of households`}
              color="amber"
              icon={AlertTriangle}
            />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Water & Sanitation Access{selectedBarangay !== "all" && <span className="ml-2 text-sm font-normal text-blue-500">— Brgy. {selectedBarangay}</span>}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {liveLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Households without safe water</span>
                      <span className="font-semibold text-red-600">{(selectedBrgyData ? selectedBrgyData.withoutSafeWater : (liveData?.water.withoutSafeWater ?? 0)).toLocaleString()} / {effTotal.toLocaleString()} ({pct(selectedBrgyData ? selectedBrgyData.withoutSafeWater : (liveData?.water.withoutSafeWater ?? 0), effTotal)})</span>
                    </div>
                    <ProgressBar value={selectedBrgyData ? selectedBrgyData.withoutSafeWater : (liveData?.water.withoutSafeWater ?? 0)} max={effTotal} color="bg-red-400" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Households without sanitary toilet</span>
                      <span className="font-semibold text-amber-600">{(selectedBrgyData ? selectedBrgyData.withoutSanitaryToilet : (liveData?.water.withoutSanitaryToilet ?? 0)).toLocaleString()} / {effTotal.toLocaleString()} ({pct(selectedBrgyData ? selectedBrgyData.withoutSanitaryToilet : (liveData?.water.withoutSanitaryToilet ?? 0), effTotal)})</span>
                    </div>
                    <ProgressBar value={selectedBrgyData ? selectedBrgyData.withoutSanitaryToilet : (liveData?.water.withoutSanitaryToilet ?? 0)} max={effTotal} color="bg-amber-400" />
                  </div>
                  {(selectedBrgyData ? selectedBrgyData.withoutSafeWater : (liveData?.water.withoutSafeWater ?? 0)) > 0 && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700"><strong>Priority:</strong> {pct(selectedBrgyData ? selectedBrgyData.withoutSafeWater : (liveData?.water.withoutSafeWater ?? 0), effTotal)} of {selectedBarangay !== "all" ? `Brgy. ${selectedBarangay}` : "surveyed"} households lack access to safe water. Water supply infrastructure improvements and community water programs are recommended.</p>
                    </div>
                  )}
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                    {selectedBarangay !== "all" ? `Showing data for Barangay ${selectedBarangay} only.` : "All figures are computed from approved household survey rosters across all barangays."}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── EDUCATION ────────────────────────────────────── */}
        <TabsContent value="education" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BookOpen className="w-5 h-5 text-indigo-600" />Education & Literacy{selectedBarangay !== "all" && <span className="ml-2 text-sm font-normal text-blue-500">— Brgy. {selectedBarangay}</span>}</CardTitle>
              <p className="text-sm text-gray-500">{selectedBarangay !== "all" ? `Out-of-school children and youth in Barangay ${selectedBarangay}` : "Out-of-school children and youth from approved surveys"}</p>
            </CardHeader>
            <CardContent>
              {liveLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left py-2 px-3 font-semibold text-gray-700">Category</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-700">Count</th>
                          <th className="text-right py-2 px-3 font-semibold text-gray-700">% of Age Group</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: "6–11 yrs not attending elementary", count: selectedBrgyData ? selectedBrgyData.outOfSchool6to11 : (liveData?.education.outOfSchool6to11 ?? 0), ageGroupCount: selectedBrgyData ? selectedBrgyData.age6to11 : (liveData?.demography.age6to11 ?? 1) },
                          { label: "12–15 yrs not attending high school", count: selectedBrgyData ? selectedBrgyData.outOfSchool12to15 : (liveData?.education.outOfSchool12to15 ?? 0), ageGroupCount: selectedBrgyData ? selectedBrgyData.age12to15 : (liveData?.demography.age12to15 ?? 1) },
                          { label: "6–15 yrs not attending school (combined)", count: (selectedBrgyData ? selectedBrgyData.outOfSchool6to11 + selectedBrgyData.outOfSchool12to15 : (liveData?.education.outOfSchool6to15 ?? 0)), ageGroupCount: (selectedBrgyData ? selectedBrgyData.age6to11 + selectedBrgyData.age12to15 : (liveData?.demography.age6to15 ?? 1)) },
                          { label: "Illiterate (10 years old and above)", count: liveData?.education.illiterate10plus ?? 0, ageGroupCount: liveData?.demography.age10plus ?? 1 },
                        ].map((row, i) => (
                          <tr key={i} className={`border-b ${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-indigo-50 transition-colors`}>
                            <td className="py-2 px-3 text-gray-800">{row.label}</td>
                            <td className="py-2 px-3 text-right font-medium text-indigo-700">{row.count.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right">
                              <span className={`font-semibold ${parseFloat(pct(row.count, row.ageGroupCount)) > 10 ? "text-red-600" : "text-amber-600"}`}>
                                {pct(row.count, row.ageGroupCount)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(selectedBrgyData ? selectedBrgyData.outOfSchool12to15 : (liveData?.education.outOfSchool12to15 ?? 0)) > 0 && (
                    <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                      <p className="text-sm text-indigo-700"><strong>Key Finding:</strong> High school non-attendance is {pct(selectedBrgyData ? selectedBrgyData.outOfSchool12to15 : (liveData?.education.outOfSchool12to15 ?? 0), selectedBrgyData ? selectedBrgyData.age12to15 : (liveData?.demography.age12to15 ?? 1))} of children aged 12–15{selectedBarangay !== "all" ? ` in Brgy. ${selectedBarangay}` : ""}. Gender-specific interventions and conditional cash transfer programs may be needed.</p>
                    </div>
                  )}
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                    {selectedBarangay !== "all" ? `Showing data for Barangay ${selectedBarangay} only.` : "All figures are computed from approved household survey rosters across all barangays."}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── INCOME ───────────────────────────────────────── */}
        <TabsContent value="income" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label={`Below Poverty Threshold${selectedBarangay !== "all" ? " — " + selectedBarangay : ""}`}
              value={liveLoading ? "…" : `${(selectedBrgyData ? selectedBrgyData.belowPoverty : (liveData?.income.belowPoverty ?? 0)).toLocaleString()} HH`}
              sub={liveLoading ? "" : `${pct(selectedBrgyData ? selectedBrgyData.belowPoverty : (liveData?.income.belowPoverty ?? 0), effTotal)} of households`}
              color="red"
              icon={AlertTriangle}
            />
            <StatCard
              label={`Below Food Threshold${selectedBarangay !== "all" ? " — " + selectedBarangay : ""}`}
              value={liveLoading ? "…" : `${(selectedBrgyData ? selectedBrgyData.belowFoodThreshold : (liveData?.income.belowFoodThreshold ?? 0)).toLocaleString()} HH`}
              sub={liveLoading ? "" : `${pct(selectedBrgyData ? selectedBrgyData.belowFoodThreshold : (liveData?.income.belowFoodThreshold ?? 0), effTotal)} of households`}
              color="red"
              icon={AlertTriangle}
            />
            <StatCard
              label={`Experienced Food Shortage${selectedBarangay !== "all" ? " — " + selectedBarangay : ""}`}
              value={liveLoading ? "…" : `${(selectedBrgyData ? selectedBrgyData.foodShortage : (liveData?.income.experiencedFoodShortage ?? 0)).toLocaleString()} HH`}
              sub={liveLoading ? "" : `${pct(selectedBrgyData ? selectedBrgyData.foodShortage : (liveData?.income.experiencedFoodShortage ?? 0), effTotal)} of households`}
              color="amber"
              icon={AlertTriangle}
            />
            <StatCard
              label={`Solo Parents${selectedBarangay !== "all" ? " — " + selectedBarangay : ""}`}
              value={liveLoading ? "…" : `${(selectedBrgyData ? selectedBrgyData.soloParents : (liveData?.income.soloParents ?? 0)).toLocaleString()}`}
              sub={liveLoading ? "" : `${pct(selectedBrgyData ? selectedBrgyData.soloParents : (liveData?.income.soloParents ?? 0), effTotal)} of households`}
              color="amber"
              icon={Users}
            />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Income & Livelihood Analysis{selectedBarangay !== "all" && <span className="ml-2 text-sm font-normal text-blue-500">— Brgy. {selectedBarangay}</span>}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-gray-50 border rounded-lg text-sm">
                <p className="font-semibold text-gray-700 mb-1">2015 Poverty Thresholds (Family of 5)</p>
                <div className="flex gap-8">
                  <div><span className="text-gray-500">Food Threshold:</span> <span className="font-medium">PhP 6,329/month</span></div>
                  <div><span className="text-gray-500">Poverty Threshold:</span> <span className="font-medium">PhP 9,064/month</span></div>
                </div>
              </div>
              {liveLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Below poverty threshold</span>
                      <span className="font-semibold text-red-600">{(selectedBrgyData ? selectedBrgyData.belowPoverty : (liveData?.income.belowPoverty ?? 0)).toLocaleString()} / {effTotal.toLocaleString()} ({pct(selectedBrgyData ? selectedBrgyData.belowPoverty : (liveData?.income.belowPoverty ?? 0), effTotal)})</span>
                    </div>
                    <ProgressBar value={selectedBrgyData ? selectedBrgyData.belowPoverty : (liveData?.income.belowPoverty ?? 0)} max={effTotal} color="bg-red-400" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Below food threshold</span>
                      <span className="font-semibold text-red-600">{(selectedBrgyData ? selectedBrgyData.belowFoodThreshold : (liveData?.income.belowFoodThreshold ?? 0)).toLocaleString()} / {effTotal.toLocaleString()} ({pct(selectedBrgyData ? selectedBrgyData.belowFoodThreshold : (liveData?.income.belowFoodThreshold ?? 0), effTotal)})</span>
                    </div>
                    <ProgressBar value={selectedBrgyData ? selectedBrgyData.belowFoodThreshold : (liveData?.income.belowFoodThreshold ?? 0)} max={effTotal} color="bg-orange-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                    <div className="text-sm">
                      <span className="text-gray-500">Unemployed members:</span>
                      <span className="ml-2 font-semibold text-gray-800">{(selectedBrgyData ? selectedBrgyData.unemployed : (liveData?.income.unemployed ?? 0)).toLocaleString()}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-500">4Ps beneficiaries:</span>
                      <span className="ml-2 font-semibold text-green-700">{(selectedBrgyData ? selectedBrgyData.fourPsBeneficiaries : (liveData?.income.fourPsBeneficiaries ?? 0)).toLocaleString()} HH</span>
                    </div>
                  </div>
                  {(selectedBrgyData ? selectedBrgyData.belowPoverty : (liveData?.income.belowPoverty ?? 0)) > 0 && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700"><strong>Priority:</strong> {(selectedBrgyData ? selectedBrgyData.belowPoverty : (liveData?.income.belowPoverty ?? 0)).toLocaleString()} households ({pct(selectedBrgyData ? selectedBrgyData.belowPoverty : (liveData?.income.belowPoverty ?? 0), effTotal)}) live below the poverty threshold{selectedBarangay !== "all" ? ` in Brgy. ${selectedBarangay}` : ""}. These households should be prioritized for 4Ps enrollment, livelihood programs, and social protection interventions.</p>
                    </div>
                  )}
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                    {selectedBarangay !== "all" ? `Showing data for Barangay ${selectedBarangay} only.` : "All figures are computed from approved household survey rosters across all barangays."}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PEACE & ORDER ────────────────────────────────── */}
        <TabsContent value="peace" className="space-y-4">
          {/* Barangay Filter */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Filter by Barangay:</span>
            <Select value={selectedBarangay} onValueChange={setSelectedBarangay}>
              <SelectTrigger className="w-56 h-8 text-xs">
                <SelectValue placeholder="All Barangays" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Barangays</SelectItem>
                {barangayOptions.map(b => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBarangay !== "all" && (
              <button
                onClick={() => setSelectedBarangay("all")}
                className="text-xs text-blue-600 underline hover:text-blue-800"
              >
                Clear filter
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              label="Victim Households"
              value={liveLoading ? "…" : `${filteredStats.victimHouseholds.toLocaleString()} HH`}
              sub={liveLoading ? "" : `${pct(filteredStats.victimHouseholds, filteredStats.totalHouseholds || total)} of households`}
              color={filteredStats.victimHouseholds > 0 ? "amber" : "green"}
              icon={Shield}
            />
            <StatCard
              label="Total Victims"
              value={liveLoading ? "…" : filteredStats.totalVictims}
              sub={liveLoading ? "" : `${filteredStats.maleVictims} male, ${filteredStats.femaleVictims} female`}
              color={filteredStats.totalVictims > 0 ? "amber" : "green"}
              icon={Users}
            />
            <StatCard
              label="With Evacuation Plan"
              value={liveLoading ? "…" : `${(liveData?.other.withEvacuationPlan ?? 0).toLocaleString()} HH`}
              sub={liveLoading ? "" : `${pct(liveData?.other.withEvacuationPlan ?? 0, total)} of households`}
              color="blue"
              icon={Info}
            />
          </div>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Peace & Order — Crime Victimization Data</CardTitle>
                {selectedBarangay !== "all" && (
                  <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50 text-xs">
                    Brgy. {selectedBarangay}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700"><strong>Data Source:</strong> Crime data is collected directly from household survey responses (Section H). Includes all crime types reported by household members in the past 12 months.
                {selectedBarangay !== "all" && <span className="font-semibold"> Showing data for Barangay {selectedBarangay} only.</span>}
                </p>
              </div>
              {liveLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
              ) : (
                <>
                  {/* Summary stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Victim Households</div>
                      <div className="text-2xl font-bold text-amber-600">{filteredStats.victimHouseholds}</div>
                      <div className="text-xs text-gray-500">{pct(filteredStats.victimHouseholds, filteredStats.totalHouseholds || total)} of households</div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Total Victims</div>
                      <div className="text-2xl font-bold text-red-600">{filteredStats.totalVictims}</div>
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs text-teal-600 font-medium">{filteredStats.maleVictims}M</span>
                        <span className="text-xs text-pink-600 font-medium">{filteredStats.femaleVictims}F</span>
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Crimes Reported</div>
                      <div className="text-2xl font-bold text-blue-600">{filteredStats.crimeReportedCount}</div>
                      <div className="text-xs text-gray-500">of {filteredStats.victimHouseholds} victim HH</div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-xs text-gray-500 mb-1">Victimization Rate</div>
                      <div className={`text-2xl font-bold ${filteredStats.crimeReportingRate >= 50 ? "text-red-600" : "text-green-600"}`}>
                        {selectedBarangay === "all" ? (liveData?.peaceAndOrder.crimeReportingRate ?? 0) : filteredStats.crimeReportingRate}%
                      </div>
                      <div className="text-xs text-gray-500">{selectedBarangay === "all" ? "reported to authorities" : "of households affected"}</div>
                    </div>
                  </div>

                  {/* Crime type breakdown */}
                  {filteredStats.victimHouseholds > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-gray-700">Crime Type Breakdown</div>
                      {Object.keys(filteredStats.crimeTypeBreakdown).length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No crime types recorded yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {Object.entries(filteredStats.crimeTypeBreakdown)
                            .sort(([, a], [, b]) => (b as number) - (a as number))
                            .map(([type, count]) => {
                              const maxCount = Math.max(...Object.values(filteredStats.crimeTypeBreakdown) as number[]);
                              const barPct = maxCount > 0 ? Math.round(((count as number) / maxCount) * 100) : 0;
                              return (
                                <div key={type} className="flex items-center gap-3">
                                  <div className="text-xs text-gray-600 w-44 shrink-0">{type}</div>
                                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                                    <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${barPct}%` }} />
                                  </div>
                                  <div className="text-xs font-medium text-gray-700 w-8 text-right">{count as number}</div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status message */}
                  <div className={`p-4 ${filteredStats.victimHouseholds === 0 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"} border rounded-lg`}>
                    <p className={`text-sm ${filteredStats.victimHouseholds === 0 ? "text-green-700" : "text-amber-700"}`}>
                      {filteredStats.victimHouseholds === 0
                        ? <><strong>Positive Indicator:</strong> No households{selectedBarangay !== "all" ? ` in Barangay ${selectedBarangay}` : ""} reported being victims of crime in the survey period.</>
                        : <><strong>Concern:</strong> {filteredStats.victimHouseholds} household(s) ({pct(filteredStats.victimHouseholds, filteredStats.totalHouseholds || total)}) reported crime victimization{selectedBarangay !== "all" ? ` in Barangay ${selectedBarangay}` : ""}. Continued community policing and barangay peace &amp; order programs are recommended.</>
                      }
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* ── CRIME HOTSPOT MAP ─────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Crime Hotspot Map — By Barangay</CardTitle>
                {selectedBarangay !== "all" && (
                  <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50 text-xs">
                    Showing: Brgy. {selectedBarangay}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {liveLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-[420px] w-full rounded-lg" />
                </div>
              ) : (
                <CrimeHotspotMap
                  data={filteredCrimeData}
                  className="w-full"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

            {/* ── OTHER INDICATORS ─────────────────── */}
        <TabsContent value="other" className="space-y-4">
          {selectedBarangay !== "all" && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              Showing data for <strong>Barangay {selectedBarangay}</strong> only. <button onClick={() => setSelectedBarangay("all")} className="underline hover:text-blue-900">Clear filter</button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Live Registered Voters */}
            <Card className="border-green-200 bg-green-50/30">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-green-700 uppercase tracking-wide font-semibold">Registered Voters</div>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">Live Survey</span>
                </div>
                {liveLoading ? (
                  <div className="text-3xl font-bold text-gray-400">…</div>
                ) : (                  <>
                    <div className="text-3xl font-bold text-green-800 mb-1">
                      {(selectedBrgyData ? selectedBrgyData.registeredVoters : (liveData?.registeredVoterCount ?? 0)).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500 mb-2">
                      {selectedBrgyData
                        ? selectedBrgyData.eligibleVoters > 0
                          ? `${pct(selectedBrgyData.registeredVoters, selectedBrgyData.eligibleVoters)} of ${selectedBrgyData.eligibleVoters.toLocaleString()} eligible (18+)`
                          : "No eligible voters in this barangay"
                        : liveData && liveData.eligibleVoterCount > 0
                          ? `${pct(liveData.registeredVoterCount, liveData.eligibleVoterCount)} of ${liveData.eligibleVoterCount.toLocaleString()} eligible (18+)`
                          : "No survey data yet"}
                    </div>
                    {(selectedBrgyData ? selectedBrgyData.eligibleVoters : (liveData?.eligibleVoterCount ?? 0)) > 0 && (
                      <ProgressBar
                        value={selectedBrgyData ? selectedBrgyData.registeredVoters : (liveData?.registeredVoterCount ?? 0)}
                        max={selectedBrgyData ? selectedBrgyData.eligibleVoters : (liveData?.eligibleVoterCount ?? 0)}
                        color="bg-green-400"
                      />
                    )}
                  </>      )}
              </CardContent>
            </Card>

            {/* With Electricity */}
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">HH with Electricity</div>
                {liveLoading ? <Skeleton className="h-10 w-full" /> : (
                  <>
                    <div className="text-3xl font-bold text-gray-800 mb-1">{(selectedBrgyData ? selectedBrgyData.withElectricity : (liveData?.other.withElectricity ?? 0)).toLocaleString()}</div>
                    <div className="text-sm text-gray-500 mb-2">{pct(selectedBrgyData ? selectedBrgyData.withElectricity : (liveData?.other.withElectricity ?? 0), effTotal)} of households</div>
                    <ProgressBar value={selectedBrgyData ? selectedBrgyData.withElectricity : (liveData?.other.withElectricity ?? 0)} max={effTotal} color="bg-yellow-400" />
                  </>
                )}
              </CardContent>
            </Card>

            {/* PWD */}
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Persons with Disability (PWD)</div>
                {liveLoading ? <Skeleton className="h-10 w-full" /> : (
                  <>
                    <div className="text-3xl font-bold text-gray-800 mb-1">{(selectedBrgyData ? selectedBrgyData.pwdCount : (liveData?.other.pwdCount ?? 0)).toLocaleString()}</div>
                    <div className="text-sm text-gray-500">{pct(selectedBrgyData ? selectedBrgyData.pwdCount : (liveData?.other.pwdCount ?? 0), effTotal)} of households</div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Senior Citizens */}
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Senior Citizens</div>
                {liveLoading ? <Skeleton className="h-10 w-full" /> : (
                  <>
                    <div className="text-3xl font-bold text-gray-800 mb-1">{(selectedBrgyData ? selectedBrgyData.seniorCitizens : (liveData?.other.seniorCitizens ?? 0)).toLocaleString()}</div>
                    <div className="text-sm text-gray-500">{pct(selectedBrgyData ? selectedBrgyData.seniorCitizens : (liveData?.other.seniorCitizens ?? 0), effTotal)} of households</div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Solo Parents */}
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Solo Parents</div>
                {liveLoading ? <Skeleton className="h-10 w-full" /> : (
                  <>
                    <div className="text-3xl font-bold text-gray-800 mb-1">{(selectedBrgyData ? selectedBrgyData.soloParents : (liveData?.income.soloParents ?? 0)).toLocaleString()}</div>
                    <div className="text-sm text-gray-500">{pct(selectedBrgyData ? selectedBrgyData.soloParents : (liveData?.income.soloParents ?? 0), effTotal)} of households</div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* With Evacuation Plan */}
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">With Evacuation Plan</div>
                {liveLoading ? <Skeleton className="h-10 w-full" /> : (
                  <>
                    <div className="text-3xl font-bold text-gray-800 mb-1">{(selectedBrgyData ? selectedBrgyData.withEvacuationPlan : (liveData?.other.withEvacuationPlan ?? 0)).toLocaleString()}</div>
                    <div className="text-sm text-gray-500 mb-2">{pct(selectedBrgyData ? selectedBrgyData.withEvacuationPlan : (liveData?.other.withEvacuationPlan ?? 0), effTotal)} of households</div>
                    <ProgressBar value={selectedBrgyData ? selectedBrgyData.withEvacuationPlan : (liveData?.other.withEvacuationPlan ?? 0)} max={effTotal} color="bg-blue-400" />
                  </>
                )}
              </CardContent>
            </Card>

            {/* With Agricultural Land */}
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">With Agricultural Land</div>
                {liveLoading ? <Skeleton className="h-10 w-full" /> : (
                  <>
                    <div className="text-3xl font-bold text-gray-800 mb-1">{(selectedBrgyData ? selectedBrgyData.withAgriculturalLand : (liveData?.other.withAgriculturalLand ?? 0)).toLocaleString()}</div>
                    <div className="text-sm text-gray-500">{pct(selectedBrgyData ? selectedBrgyData.withAgriculturalLand : (liveData?.other.withAgriculturalLand ?? 0), effTotal)} of households</div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* 4Ps Beneficiaries */}
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">4Ps Beneficiaries</div>
                {liveLoading ? <Skeleton className="h-10 w-full" /> : (
                  <>
                    <div className="text-3xl font-bold text-gray-800 mb-1">{(selectedBrgyData ? selectedBrgyData.fourPsBeneficiaries : (liveData?.income.fourPsBeneficiaries ?? 0)).toLocaleString()}</div>
                    <div className="text-sm text-gray-500">{pct(selectedBrgyData ? selectedBrgyData.fourPsBeneficiaries : (liveData?.income.fourPsBeneficiaries ?? 0), effTotal)} of households</div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm">Key Observations</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {liveLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : (
                <>
                  {(() => {
                    const elec = selectedBrgyData ? selectedBrgyData.withElectricity : (liveData?.other.withElectricity ?? 0);
                    const elecRate = effTotal > 0 ? elec / effTotal : 0;
                    return (
                      <div className={`flex items-start gap-2 p-3 ${elecRate > 0.9 ? "bg-green-50" : "bg-amber-50"} rounded-lg`}>
                        {elecRate > 0.9 ? <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />}
                        <p className={`text-sm ${elecRate > 0.9 ? "text-green-700" : "text-amber-700"}`}>
                          <strong>Electricity access ({pct(elec, effTotal)}){selectedBarangay !== "all" ? ` — Brgy. ${selectedBarangay}` : ""}:</strong> {elecRate > 0.9 ? "Good infrastructure coverage." : "Below 90% — infrastructure improvement needed."}
                        </p>
                      </div>
                    );
                  })()}
                  <div className="flex items-start gap-2 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-green-700">
                      <strong>Voter registration (live from surveys){selectedBarangay !== "all" ? ` — Brgy. ${selectedBarangay}` : ""}:</strong>{" "}
                      {(selectedBrgyData ? selectedBrgyData.eligibleVoters : (liveData?.eligibleVoterCount ?? 0)) > 0
                        ? `${(selectedBrgyData ? selectedBrgyData.registeredVoters : (liveData?.registeredVoterCount ?? 0)).toLocaleString()} of ${(selectedBrgyData ? selectedBrgyData.eligibleVoters : (liveData?.eligibleVoterCount ?? 0)).toLocaleString()} eligible members (${pct(selectedBrgyData ? selectedBrgyData.registeredVoters : (liveData?.registeredVoterCount ?? 0), selectedBrgyData ? selectedBrgyData.eligibleVoters : (liveData?.eligibleVoterCount ?? 0))}) are registered voters per survey data.`
                        : "No survey data yet for voter registration."}
                    </p>
                  </div>
                  {(selectedBrgyData ? selectedBrgyData.soloParents : (liveData?.income.soloParents ?? 0)) > 0 && (
                    <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-sm text-amber-700"><strong>Solo parents ({pct(selectedBrgyData ? selectedBrgyData.soloParents : (liveData?.income.soloParents ?? 0), effTotal)}){selectedBarangay !== "all" ? ` — Brgy. ${selectedBarangay}` : ""}:</strong> {(selectedBrgyData ? selectedBrgyData.soloParents : (liveData?.income.soloParents ?? 0)).toLocaleString()} solo parents need targeted support programs for childcare and livelihood assistance.</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CITY-WIDE CONTEXT ────────────────────────────── */}
        <TabsContent value="citywide" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-purple-600" />Population per Barangay — City of San Pedro</CardTitle>
              <p className="text-sm text-gray-500">Brgy. Magsaysay in context of the entire city (PSA reference data)</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {BARANGAY_POPULATION.map((brgy, i) => (
                  <div key={i} className={`p-3 rounded-lg ${brgy.highlight ? "bg-blue-50 border border-blue-200" : "bg-gray-50"}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-sm font-medium ${brgy.highlight ? "text-blue-800" : "text-gray-700"}`}>
                        {brgy.name}{brgy.highlight && " ← This Barangay"}
                      </span>
                      <span className={`text-sm font-semibold ${brgy.highlight ? "text-blue-700" : "text-gray-600"}`}>
                        {brgy.population.toLocaleString()} ({brgy.pct}%)
                      </span>
                    </div>
                    <ProgressBar value={brgy.population} max={315000} color={brgy.highlight ? "bg-blue-500" : "bg-gray-400"} />
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-gray-50 border rounded-lg text-xs text-gray-500">
                City-wide population data is from PSA reference records. Survey data covers Brgy. Magsaysay only.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ALERTS ───────────────────────────────────────── */}
        <TabsContent value="alerts">
          <CBMSAlertPanel />
        </TabsContent>

        {/* ── THRESHOLDS ───────────────────────────────────── */}
        <TabsContent value="thresholds">
          <CBMSThresholdConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}
