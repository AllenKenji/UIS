import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { CheckCircle, XCircle, Clock, FileText, TrendingUp, TrendingDown } from "lucide-react";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const STATUS_COLORS = {
  draft: "#EAB308", // yellow
  submitted: "#3B82F6", // blue
  approved: "#22C55E", // green
  returned: "#EF4444", // red
};

export default function StatusOverviewWidget() {
  const { data: stats, isLoading: statsLoading } = trpc.households.statusStatistics.useQuery();
  const { data: trends, isLoading: trendsLoading } = trpc.households.approvalTrends.useQuery();
  const { data: avgReviewTime, isLoading: reviewTimeLoading } = trpc.households.averageReviewTime.useQuery();

  const isLoading = statsLoading || trendsLoading || reviewTimeLoading;

  if (isLoading) {
    return (
      <Card className="col-span-full">
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading status overview...
        </CardContent>
      </Card>
    );
  }

  if (!stats || !trends) {
    return null;
  }

  // Prepare pie chart data
  const pieData = [
    { name: "Draft", value: stats.draft, color: STATUS_COLORS.draft },
    { name: "Submitted", value: stats.submitted, color: STATUS_COLORS.submitted },
    { name: "Approved", value: stats.approved, color: STATUS_COLORS.approved },
    { name: "Returned", value: stats.returned, color: STATUS_COLORS.returned },
  ].filter(item => item.value > 0); // Only show non-zero values

  // Calculate trend direction
  const recentTrends = trends.slice(0, 2);
  const trendDirection = recentTrends.length >= 2 
    ? recentTrends[0].approvalRate - recentTrends[1].approvalRate 
    : 0;

  return (
    <>
      {/* Status Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Submitted Card */}
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Review
              </CardTitle>
              <Clock className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-700">{stats.submitted}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Awaiting supervisor approval
            </p>
          </CardContent>
        </Card>

        {/* Approved Card */}
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Approved
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700">{stats.approved}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.approvalRate}% approval rate
            </p>
          </CardContent>
        </Card>

        {/* Returned Card */}
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Returned
              </CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-700">{stats.returned}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Needs corrections
            </p>
          </CardContent>
        </Card>

        {/* Average Review Time Card */}
        <Card className="border-purple-200 bg-purple-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Review Time
              </CardTitle>
              <FileText className="h-4 w-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-700">
              {avgReviewTime || 0}<span className="text-lg">h</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              From submission to review
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Approval Rate Trends Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Approval Rate Trends</CardTitle>
                <CardDescription>Monthly approval rates over the last 6 months</CardDescription>
              </div>
              <Badge 
                variant="outline" 
                className={trendDirection > 0 ? "border-green-300 text-green-700" : trendDirection < 0 ? "border-red-300 text-red-700" : ""}
              >
                {trendDirection > 0 ? (
                  <><TrendingUp className="h-3 w-3 mr-1" /> +{trendDirection}%</>
                ) : trendDirection < 0 ? (
                  <><TrendingDown className="h-3 w-3 mr-1" /> {trendDirection}%</>
                ) : (
                  "No change"
                )}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  stroke="#6b7280"
                  domain={[0, 100]}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="approvalRate" 
                  stroke="#22C55E" 
                  strokeWidth={2}
                  name="Approval Rate (%)"
                  dot={{ fill: '#22C55E', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Status Distribution</CardTitle>
            <CardDescription>Current breakdown of all surveys by status</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value, percent }) => 
                    `${name}: ${value} (${(percent * 100).toFixed(0)}%)`
                  }
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {pieData.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-muted-foreground">
                    {item.name}: <span className="font-medium text-foreground">{item.value}</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
