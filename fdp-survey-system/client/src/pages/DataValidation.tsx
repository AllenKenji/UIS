import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle, XCircle, FileWarning, Users, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

export default function DataValidation() {
  const [, setLocation] = useLocation();
  const { data: households, isLoading } = trpc.households.list.useQuery();
  const { data: stats } = trpc.households.statistics.useQuery();

  // Data quality checks
  const incompleteRecords = households?.filter(h => 
    !h.headOfFamily || !h.barangay || !h.municipality || !h.monthlyIncome
  ) || [];

  const duplicateRecords = households?.filter((h, index, arr) => 
    arr.findIndex(other => 
      other.headOfFamily === h.headOfFamily && 
      other.barangay === h.barangay && 
      other.id !== h.id
    ) !== -1
  ) || [];

  const outlierRecords = households?.filter(h => {
    const income = parseFloat(h.monthlyIncome || "0");
    return income > 100000 || (income > 0 && income < 1000);
  }) || [];

  // Note: Household size is stored in surveyResponses.sectionB.members
  // For now, we'll skip this check until we join with survey responses
  const suspiciousRecords: any[] = [];

  const totalIssues = incompleteRecords.length + duplicateRecords.length + 
    outlierRecords.length + suspiciousRecords.length;

  const [flaggedRecords, setFlaggedRecords] = useState<Set<number>>(new Set());
  const [resolvedRecords, setResolvedRecords] = useState<Set<number>>(new Set());

  const handleFlag = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFlaggedRecords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleResolve = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setResolvedRecords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const renderRecordRow = (household: any, issueType: string) => {
    const isFlagged = flaggedRecords.has(household.id);
    const isResolved = resolvedRecords.has(household.id);
    
    return (
      <tr 
        key={household.id} 
        className={cn(
          "border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors",
          isResolved && "opacity-50 bg-green-50",
          isFlagged && "bg-red-50"
        )}
        onClick={() => setLocation(`/households/${household.id}`)}
      >
        <td className="py-3 px-4 text-sm">{household.headOfFamily || "N/A"}</td>
        <td className="py-3 px-4 text-sm">{household.barangay || "N/A"}</td>
        <td className="py-3 px-4 text-sm">{household.municipality || "N/A"}</td>
        <td className="py-3 px-4">
          <Badge variant="destructive" className="text-xs">
            {issueType}
          </Badge>
        </td>
        <td className="py-3 px-4 text-sm text-muted-foreground">
          {new Date(household.createdAt).toLocaleDateString()}
        </td>
        <td className="py-3 px-4">
          <div className="flex gap-2" onClick={e => e.stopPropagation()}>
            <Button
              size="sm"
              variant={isFlagged ? "default" : "outline"}
              onClick={(e) => handleFlag(household.id, e)}
              className="h-7 text-xs"
            >
              {isFlagged ? "Flagged" : "Flag"}
            </Button>
            <Button
              size="sm"
              variant={isResolved ? "default" : "outline"}
              onClick={(e) => handleResolve(household.id, e)}
              className="h-7 text-xs"
            >
              {isResolved ? "Resolved" : "Resolve"}
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading validation data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Data Validation Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Review and flag data quality issues before final verification.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalIssues}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all categories
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Incomplete</CardTitle>
            <FileWarning className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{incompleteRecords.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Missing required fields
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duplicates</CardTitle>
            <Users className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{duplicateRecords.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Potential duplicate entries
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outliers</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{outlierRecords.length + suspiciousRecords.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Unusual data values
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Validation Tabs */}
      <Tabs defaultValue="incomplete" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="incomplete">
            Incomplete ({incompleteRecords.length})
          </TabsTrigger>
          <TabsTrigger value="duplicates">
            Duplicates ({duplicateRecords.length})
          </TabsTrigger>
          <TabsTrigger value="outliers">
            Outliers ({outlierRecords.length})
          </TabsTrigger>
          <TabsTrigger value="suspicious">
            Suspicious ({suspiciousRecords.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="incomplete" className="mt-6">
          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>Incomplete Records</CardTitle>
              <CardDescription>
                Surveys missing required fields like head of family, location, or income data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {incompleteRecords.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">No incomplete records found!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/50">
                        <th className="py-3 px-4 text-left text-sm font-medium">Head of Family</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Barangay</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Municipality</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Issue</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Date</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incompleteRecords.map(h => renderRecordRow(h, "Incomplete"))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="duplicates" className="mt-6">
          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>Duplicate Records</CardTitle>
              <CardDescription>
                Multiple entries with the same head of family and location.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {duplicateRecords.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">No duplicate records found!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/50">
                        <th className="py-3 px-4 text-left text-sm font-medium">Head of Family</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Barangay</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Municipality</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Issue</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Date</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duplicateRecords.map(h => renderRecordRow(h, "Duplicate"))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outliers" className="mt-6">
          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>Income Outliers</CardTitle>
              <CardDescription>
                Households with unusually high (&gt; ₱100,000) or low (&lt; ₱1,000) monthly income.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {outlierRecords.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">No income outliers found!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/50">
                        <th className="py-3 px-4 text-left text-sm font-medium">Head of Family</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Barangay</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Municipality</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Issue</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Date</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outlierRecords.map(h => renderRecordRow(h, "Income Outlier"))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suspicious" className="mt-6">
          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>Suspicious Household Size</CardTitle>
              <CardDescription>
                Households with 0 members or more than 15 members.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {suspiciousRecords.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-muted-foreground">No suspicious records found!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/50">
                        <th className="py-3 px-4 text-left text-sm font-medium">Head of Family</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Barangay</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Municipality</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Issue</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Date</th>
                        <th className="py-3 px-4 text-left text-sm font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suspiciousRecords.map(h => renderRecordRow(h, "Suspicious Size"))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
