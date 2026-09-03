import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, AlertCircle, CheckCircle, RefreshCw, Settings } from "lucide-react";
import { Link } from "wouter";

interface CBMSAlertPanelProps {
  /** When true, show only a compact summary (for Dashboard widget). */
  compact?: boolean;
  /** When true, show the "Configure Thresholds" link. */
  showConfigLink?: boolean;
}

export default function CBMSAlertPanel({ compact = false, showConfigLink = false }: CBMSAlertPanelProps) {
  const { data, isLoading, isError, error, refetch, isFetching } = trpc.cbms.alerts.useQuery(undefined, {
    refetchInterval: 60_000, // refresh every 60 s
  });

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-red-700">Unable To Load CBMS Alerts</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <p className="text-xs text-red-700/90">{error?.message || "Please try again."}</p>
          <Button variant="outline" size="sm" className="h-7" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const alerts = data?.alerts ?? [];
  const criticals = data?.criticals ?? 0;
  const warnings = data?.warnings ?? 0;
  const allClear = alerts.length === 0;

  const headerColor = criticals > 0
    ? "border-red-300 bg-red-50"
    : warnings > 0
      ? "border-amber-300 bg-amber-50"
      : "border-green-300 bg-green-50";

  const headerIcon = criticals > 0
    ? <AlertCircle className="w-5 h-5 text-red-600" />
    : warnings > 0
      ? <AlertTriangle className="w-5 h-5 text-amber-600" />
      : <CheckCircle className="w-5 h-5 text-green-600" />;

  const headerTitle = allClear
    ? "All CBMS Indicators Within Thresholds"
    : `${criticals > 0 ? `${criticals} Critical` : ""}${criticals > 0 && warnings > 0 ? ", " : ""}${warnings > 0 ? `${warnings} Warning` : ""} — CBMS Alerts`;

  // In compact mode, only show up to 3 alerts
  const displayedAlerts = compact ? alerts.slice(0, 3) : alerts;

  return (
    <Card className={`border ${headerColor}`}>
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {headerIcon}
            <CardTitle className="text-sm font-semibold">{headerTitle}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {showConfigLink && (
              <Link href="/cbms?tab=thresholds">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                  <Settings className="w-3 h-3" /> Configure
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        {data && (
          <p className="text-xs text-muted-foreground mt-1">
            Monitoring {data.totalActive} active indicators · Last checked {new Date(data.computedAt).toLocaleTimeString()}
          </p>
        )}
      </CardHeader>

      {!allClear && (
        <CardContent className="px-4 pb-4 pt-0 space-y-2">
          {displayedAlerts.map(alert => (
            <div
              key={alert.indicatorKey}
              className={`flex items-start gap-3 p-3 rounded-lg border ${
                alert.level === "critical"
                  ? "bg-red-50 border-red-200"
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {alert.level === "critical"
                  ? <AlertCircle className="w-4 h-4 text-red-600" />
                  : <AlertTriangle className="w-4 h-4 text-amber-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{alert.indicatorName}</span>
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      alert.level === "critical"
                        ? "border-red-400 text-red-700 bg-red-50"
                        : "border-amber-400 text-amber-700 bg-amber-50"
                    }`}
                  >
                    {alert.level === "critical" ? "CRITICAL" : "WARNING"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Live: <strong>{alert.livePct.toFixed(1)}%</strong> · Baseline: {alert.baselinePct.toFixed(1)}% · Deviation: +{alert.deviation}pp
                </p>
                {!compact && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Warn at +{alert.warnThresholdPct}pp · Critical at +{alert.criticalThresholdPct}pp
                  </p>
                )}
              </div>
            </div>
          ))}

          {compact && alerts.length > 3 && (
            <Link href="/cbms?tab=live">
              <Button variant="ghost" size="sm" className="w-full text-xs h-7">
                View all {alerts.length} alerts →
              </Button>
            </Link>
          )}
        </CardContent>
      )}

      {allClear && !compact && (
        <CardContent className="px-4 pb-4 pt-0">
          <p className="text-xs text-muted-foreground">
            All {data?.totalActive ?? 0} monitored indicators are within acceptable thresholds. No action required.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
