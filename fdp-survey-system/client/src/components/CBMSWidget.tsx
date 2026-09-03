import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Home,
  Droplets,
  DollarSign,
  BookOpen,
  Heart,
  Shield,
  ExternalLink,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Minus,
  RefreshCw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

const ICON_MAP: Record<string, React.ElementType> = {
  "Below Poverty Threshold": DollarSign,
  "Without Safe Water Source": Droplets,
  "Without Sanitary Toilet": Droplets,
  "Informal Settlers": Home,
  "Without Health Insurance": Heart,
  "With PhilHealth Coverage": Heart,
  "With Electricity": Shield,
  "4Ps Beneficiaries": Users,
  "Senior Citizens": Users,
  "PWD Members": Users,
  "With Evacuation Plan": Shield,
  "With Agricultural Land": Home,
  "Out-of-School Children": BookOpen,
};

const PRIORITY_INDICATORS = [
  "Below Poverty Threshold",
  "Informal Settlers",
  "Without Safe Water Source",
  "Without Health Insurance",
  "Out-of-School Children",
  "With Electricity",
];

function TrendBadge({ trend, diff }: { trend: string; diff: number }) {
  if (trend === "no_baseline") {
    return (
      <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 border-gray-300 text-gray-500">
        New
      </Badge>
    );
  }
  if (trend === "same") {
    return (
      <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 border-gray-300 text-gray-500 gap-0.5">
        <Minus className="h-2.5 w-2.5" />
        {Math.abs(diff)}%
      </Badge>
    );
  }
  if (trend === "improved") {
    return (
      <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 border-green-400 text-green-700 bg-green-50 gap-0.5">
        <TrendingDown className="h-2.5 w-2.5" />
        {Math.abs(diff)}%
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 border-red-400 text-red-700 bg-red-50 gap-0.5">
      <TrendingUp className="h-2.5 w-2.5" />
      {Math.abs(diff)}%
    </Badge>
  );
}

export default function CBMSWidget() {
  const { data, isLoading, refetch, dataUpdatedAt } = trpc.cbms.indicators.useQuery(undefined, {
    refetchInterval: 60_000, // refresh every minute
  });

  const priorityData = data?.indicators.filter((ind) =>
    PRIORITY_INDICATORS.includes(ind.indicator)
  ) ?? [];

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-blue-600 flex items-center justify-center">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">CBMS 13+1 Core Indicators</CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                Live survey data vs. PPTX baseline · Brgy. Magsaysay
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => refetch()}
              title="Refresh indicators"
            >
              <RefreshCw className="h-3.5 w-3.5 text-gray-400" />
            </Button>
            <Link href="/cbms">
              <Button variant="outline" size="sm" className="text-xs gap-1">
                View Full Data <ExternalLink className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats Row */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 bg-blue-50 rounded-lg border border-blue-100">
              <Home className="h-3 w-3 text-blue-400 mx-auto mb-1" />
              <div className="text-sm font-bold text-blue-800">{data?.totalApprovedHouseholds ?? 0}</div>
              <div className="text-xs text-blue-600 leading-tight">Approved Surveys</div>
            </div>
            <div className="text-center p-2 bg-blue-50 rounded-lg border border-blue-100">
              <Users className="h-3 w-3 text-blue-400 mx-auto mb-1" />
              <div className="text-sm font-bold text-blue-800">{data?.totalMembers ?? 0}</div>
              <div className="text-xs text-blue-600 leading-tight">Total Members</div>
            </div>
            <div className="text-center p-2 bg-gray-50 rounded-lg border border-gray-100">
              <Shield className="h-3 w-3 text-gray-400 mx-auto mb-1" />
              <div className="text-sm font-bold text-gray-700">3,141</div>
              <div className="text-xs text-gray-500 leading-tight">CBMS Baseline HH</div>
            </div>
          </div>
        )}

        {/* Priority Indicators */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Priority Indicators — Survey vs. Baseline
            </span>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : priorityData.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              No approved survey data yet. Approve surveys to see live indicators.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {priorityData.map((ind) => {
                const Icon = ICON_MAP[ind.indicator] ?? Shield;
                const isNegative = ind.trend === "worsened";
                const isPositive = ind.trend === "improved";
                const bgClass = isNegative
                  ? "bg-red-50 border-red-100"
                  : isPositive
                  ? "bg-green-50 border-green-100"
                  : "bg-gray-50 border-gray-100";
                const textClass = isNegative
                  ? "text-red-700"
                  : isPositive
                  ? "text-green-700"
                  : "text-gray-700";

                return (
                  <div key={ind.indicator} className={`p-2.5 rounded-lg border ${bgClass}`}>
                    <div className="flex items-start gap-2">
                      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${textClass}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-500 truncate">{ind.indicator}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className={`text-sm font-bold ${textClass}`}>
                            {ind.surveyCount} ({ind.surveyPct}%)
                          </span>
                          <TrendBadge trend={ind.trend} diff={ind.trendDiff} />
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Baseline: {ind.baselineCount} ({ind.baselinePct}%)
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 pt-1 border-t border-gray-100">
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <TrendDown className="h-3 w-3 text-green-500" />
            <span>Improved vs. baseline</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <TrendUp className="h-3 w-3 text-red-500" />
            <span>Worsened vs. baseline</span>
          </div>
          {lastUpdated && (
            <span className="text-xs text-gray-300 ml-auto">Updated {lastUpdated}</span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Based on {data?.totalApprovedHouseholds ?? 0} approved surveys · CBMS baseline from Brgy. Magsaysay PPTX
          </p>
          <Link href="/cbms">
            <span className="text-xs text-blue-600 hover:underline cursor-pointer">
              Explore all indicators →
            </span>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// Inline aliases to avoid import issues
function TrendDown({ className }: { className?: string }) {
  return <TrendingDown className={className} />;
}
function TrendUp({ className }: { className?: string }) {
  return <TrendingUp className={className} />;
}
