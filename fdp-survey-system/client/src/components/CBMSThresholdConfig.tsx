import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Settings, Save, RotateCcw, AlertTriangle, AlertCircle, CheckCircle } from "lucide-react";

interface ThresholdRow {
  id: number;
  indicatorKey: string;
  indicatorName: string;
  baselinePct: string;
  warnThresholdPct: string;
  criticalThresholdPct: string;
  isActive: boolean;
}

interface EditState {
  warnThresholdPct: string;
  criticalThresholdPct: string;
  isActive: boolean;
}

export default function CBMSThresholdConfig() {
  const utils = trpc.useUtils();
  const { data: thresholds, isLoading } = trpc.cbms.thresholds.useQuery();
  const { data: alertData } = trpc.cbms.alerts.useQuery();

  const updateMutation = trpc.cbms.updateThreshold.useMutation({
    onSuccess: () => {
      utils.cbms.thresholds.invalidate();
      utils.cbms.alerts.invalidate();
      toast.success("Threshold updated successfully");
    },
    onError: (err) => toast.error(`Failed to update: ${err.message}`),
  });

  // Local edit state: indicatorKey → EditState
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const getEdit = (row: ThresholdRow): EditState =>
    edits[row.indicatorKey] ?? {
      warnThresholdPct: row.warnThresholdPct,
      criticalThresholdPct: row.criticalThresholdPct,
      isActive: row.isActive,
    };

  const setEdit = (key: string, patch: Partial<EditState>) =>
    setEdits(prev => ({
      ...prev,
      [key]: { ...getEdit({ indicatorKey: key } as ThresholdRow), ...patch },
    }));

  const isDirty = (row: ThresholdRow) => {
    const e = edits[row.indicatorKey];
    if (!e) return false;
    return (
      e.warnThresholdPct !== row.warnThresholdPct ||
      e.criticalThresholdPct !== row.criticalThresholdPct ||
      e.isActive !== row.isActive
    );
  };

  const handleSave = async (row: ThresholdRow) => {
    const e = getEdit(row);
    const warn = parseFloat(e.warnThresholdPct);
    const crit = parseFloat(e.criticalThresholdPct);
    if (isNaN(warn) || isNaN(crit) || warn < 0 || crit < 0) {
      toast.error("Threshold values must be non-negative numbers");
      return;
    }
    if (warn >= crit) {
      toast.error("Warning threshold must be less than Critical threshold");
      return;
    }
    setSaving(row.indicatorKey);
    await updateMutation.mutateAsync({
      indicatorKey: row.indicatorKey,
      warnThresholdPct: warn,
      criticalThresholdPct: crit,
      isActive: e.isActive,
    });
    // Clear local edit after save
    setEdits(prev => {
      const next = { ...prev };
      delete next[row.indicatorKey];
      return next;
    });
    setSaving(null);
  };

  const handleReset = (row: ThresholdRow) => {
    setEdits(prev => {
      const next = { ...prev };
      delete next[row.indicatorKey];
      return next;
    });
  };

  // Build alert map for inline status badges
  const alertMap = new Map(
    (alertData?.alerts ?? []).map(a => [a.indicatorKey, a.level])
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  const rows = thresholds as ThresholdRow[] | undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Settings className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Configure warning and critical thresholds for each CBMS indicator. An alert fires when the live value deviates from the baseline by more than the configured percentage points.
        </p>
      </div>

      <div className="grid gap-3">
        {rows?.map(row => {
          const edit = getEdit(row);
          const dirty = isDirty(row);
          const alertLevel = alertMap.get(row.indicatorKey);
          const isSavingThis = saving === row.indicatorKey;

          return (
            <Card
              key={row.indicatorKey}
              className={`border transition-colors ${
                !edit.isActive
                  ? "opacity-60 border-border"
                  : alertLevel === "critical"
                    ? "border-red-300 bg-red-50/30"
                    : alertLevel === "warning"
                      ? "border-amber-300 bg-amber-50/30"
                      : "border-border"
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4 flex-wrap">
                  {/* Indicator info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium">{row.indicatorName}</span>
                      {alertLevel === "critical" && (
                        <Badge variant="outline" className="text-xs border-red-400 text-red-700 bg-red-50 gap-1">
                          <AlertCircle className="w-3 h-3" /> CRITICAL
                        </Badge>
                      )}
                      {alertLevel === "warning" && (
                        <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 bg-amber-50 gap-1">
                          <AlertTriangle className="w-3 h-3" /> WARNING
                        </Badge>
                      )}
                      {!alertLevel && edit.isActive && (
                        <Badge variant="outline" className="text-xs border-green-400 text-green-700 bg-green-50 gap-1">
                          <CheckCircle className="w-3 h-3" /> OK
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Baseline: <strong>{parseFloat(row.baselinePct).toFixed(2)}%</strong>
                    </p>
                  </div>

                  {/* Threshold inputs */}
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="space-y-1">
                      <Label className="text-xs text-amber-700">Warn at +pp</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={edit.warnThresholdPct}
                        onChange={e => setEdit(row.indicatorKey, { warnThresholdPct: e.target.value })}
                        className="w-20 h-8 text-sm"
                        disabled={!edit.isActive}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-red-700">Critical at +pp</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={edit.criticalThresholdPct}
                        onChange={e => setEdit(row.indicatorKey, { criticalThresholdPct: e.target.value })}
                        className="w-20 h-8 text-sm"
                        disabled={!edit.isActive}
                      />
                    </div>

                    {/* Active toggle */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Active</Label>
                      <div className="h-8 flex items-center">
                        <Switch
                          checked={edit.isActive}
                          onCheckedChange={v => setEdit(row.indicatorKey, { isActive: v })}
                        />
                      </div>
                    </div>

                    {/* Save / Reset */}
                    {dirty && (
                      <div className="flex items-end gap-1">
                        <Button
                          size="sm"
                          className="h-8 px-3 text-xs gap-1"
                          onClick={() => handleSave(row)}
                          disabled={isSavingThis}
                        >
                          <Save className="w-3 h-3" />
                          {isSavingThis ? "Saving…" : "Save"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleReset(row)}
                        >
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
