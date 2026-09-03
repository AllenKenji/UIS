import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { Trophy, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

export default function BarangayPerformance() {
  const { data: performanceData, isLoading } = trpc.households.barangayPerformance.useQuery();

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!performanceData || performanceData.length === 0) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Barangay Performance Scorecard</CardTitle>
            <CardDescription>No data available yet</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Submit surveys to start tracking barangay performance metrics.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Sort by quality score descending
  const sortedData = [...performanceData].sort((a, b) => b.qualityScore - a.qualityScore);

  const getScoreBadge = (score: number) => {
    if (score >= 90) return <Badge className="bg-green-600">Excellent</Badge>;
    if (score >= 75) return <Badge className="bg-blue-600">Good</Badge>;
    if (score >= 60) return <Badge className="bg-yellow-600">Fair</Badge>;
    return <Badge className="bg-red-600">Needs Improvement</Badge>;
  };

  const getScoreIcon = (score: number) => {
    if (score >= 75) return <TrendingUp className="h-5 w-5 text-green-600" />;
    if (score >= 60) return <AlertCircle className="h-5 w-5 text-yellow-600" />;
    return <TrendingDown className="h-5 w-5 text-red-600" />;
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Barangay Performance Scorecard</h1>
        <p className="text-muted-foreground mt-2">
          Data quality metrics and rankings for each barangay
        </p>
      </div>

      {/* Top Performers */}
      <div className="grid gap-4 md:grid-cols-3">
        {sortedData.slice(0, 3).map((barangay, index) => (
          <Card key={barangay.barangay} className="border-2 border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className={`h-6 w-6 ${
                    index === 0 ? "text-yellow-500" :
                    index === 1 ? "text-gray-400" :
                    "text-amber-700"
                  }`} />
                  <CardTitle className="text-lg">#{index + 1}</CardTitle>
                </div>
                {getScoreBadge(barangay.qualityScore)}
              </div>
              <CardDescription className="font-semibold text-foreground">
                {barangay.barangay}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Quality Score</span>
                    <span className="font-bold">{barangay.qualityScore}%</span>
                  </div>
                  <Progress value={barangay.qualityScore} className="h-2" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Surveys</p>
                    <p className="font-semibold">{barangay.totalSurveys}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Completion</p>
                    <p className="font-semibold">{barangay.completionRate}%</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Full Scorecard Table */}
      <Card>
        <CardHeader>
          <CardTitle>Complete Rankings</CardTitle>
          <CardDescription>
            All barangays ranked by data quality score
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-semibold">Rank</th>
                  <th className="text-left p-3 font-semibold">Barangay</th>
                  <th className="text-center p-3 font-semibold">Quality Score</th>
                  <th className="text-center p-3 font-semibold">Total Surveys</th>
                  <th className="text-center p-3 font-semibold">Completion Rate</th>
                  <th className="text-center p-3 font-semibold">Error Rate</th>
                  <th className="text-center p-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((barangay, index) => (
                  <tr key={barangay.barangay} className="border-b hover:bg-muted/50">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">#{index + 1}</span>
                        {index < 3 && (
                          <Trophy className={`h-4 w-4 ${
                            index === 0 ? "text-yellow-500" :
                            index === 1 ? "text-gray-400" :
                            "text-amber-700"
                          }`} />
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-medium">{barangay.barangay}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        {getScoreIcon(barangay.qualityScore)}
                        <span className="font-semibold">{barangay.qualityScore}%</span>
                      </div>
                    </td>
                    <td className="p-3 text-center">{barangay.totalSurveys}</td>
                    <td className="p-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span>{barangay.completionRate}%</span>
                        <Progress value={barangay.completionRate} className="h-1 w-16" />
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span className={barangay.errorRate > 10 ? "text-red-600 font-semibold" : ""}>
                        {barangay.errorRate}%
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {getScoreBadge(barangay.qualityScore)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Legend */}
      <Card>
        <CardHeader>
          <CardTitle>Scoring Methodology</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>Quality Score:</strong> Calculated as (Completion Rate × 0.6) + ((100 - Error Rate) × 0.4)
          </p>
          <p>
            <strong>Completion Rate:</strong> Percentage of surveys with all required fields filled
          </p>
          <p>
            <strong>Error Rate:</strong> Percentage of surveys flagged for data quality issues
          </p>
          <div className="flex gap-4 mt-4">
            <div className="flex items-center gap-2">
              <Badge className="bg-green-600">Excellent</Badge>
              <span>90-100%</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-600">Good</Badge>
              <span>75-89%</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-yellow-600">Fair</Badge>
              <span>60-74%</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-red-600">Needs Improvement</Badge>
              <span>&lt;60%</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
