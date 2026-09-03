import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  FileText, 
  Download, 
  Calendar as CalendarIcon, 
  Filter, 
  TrendingUp, 
  BarChart3, 
  Users, 
  MapPin,
  FileSpreadsheet,
  File,
  Clock,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { exportToCSV, exportToPDF } from "@/lib/exportUtils";
import CustomReportBuilder from "@/components/CustomReportBuilder";

// Report template definitions
const reportTemplates = [
  {
    id: "monthly-summary",
    title: "Monthly Summary Report",
    description: "Comprehensive overview of all survey activities, approvals, and key metrics for the month",
    icon: FileText,
    color: "text-blue-600",
    bg: "bg-blue-100",
    fields: ["Total Surveys", "Approval Rate", "Top Barangays", "Program Enrollment", "Income Distribution"],
  },
  {
    id: "barangay-analysis",
    title: "Barangay Analysis Report",
    description: "Detailed breakdown of household data, demographics, and program participation by barangay",
    icon: MapPin,
    color: "text-green-600",
    bg: "bg-green-100",
    fields: ["Household Count", "Population", "4Ps Beneficiaries", "Average Income", "Data Quality Score"],
  },
  {
    id: "program-enrollment",
    title: "Program Enrollment Report",
    description: "Analysis of beneficiary enrollment across 4Ps, TUPAD, and other social programs",
    icon: Users,
    color: "text-purple-600",
    bg: "bg-purple-100",
    fields: ["4Ps Enrollment", "TUPAD Enrollment", "Senior Citizens", "PWD Members", "Indigenous Peoples"],
  },
  {
    id: "data-quality",
    title: "Data Quality Report",
    description: "Survey completion rates, validation status, and data integrity metrics by surveyor",
    icon: CheckCircle,
    color: "text-orange-600",
    bg: "bg-orange-100",
    fields: ["Completion Rate", "Validation Errors", "Duplicate Records", "Missing GPS", "Photo Verification"],
  },
  {
    id: "approval-trends",
    title: "Approval Trends Report",
    description: "Historical analysis of survey approval rates, review times, and return reasons",
    icon: TrendingUp,
    color: "text-indigo-600",
    bg: "bg-indigo-100",
    fields: ["Approval Rate Trend", "Average Review Time", "Common Return Reasons", "Surveyor Performance"],
  },
  {
    id: "income-analysis",
    title: "Income & Poverty Analysis",
    description: "Household income distribution, poverty indicators, and economic assistance needs",
    icon: BarChart3,
    color: "text-red-600",
    bg: "bg-red-100",
    fields: ["Income Brackets", "Below Poverty Line", "Employment Status", "Livelihood Needs", "Financial Aid"],
  },
];

export default function Reports() {
  const [location] = useLocation();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  
  // Check for draft parameter in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const draftToken = params.get('draft');
    
    if (draftToken) {
      setLoadingDraft(true);
      // The draft will be loaded by CustomReportBuilder component
      toast.info("Loading shared report configuration...");
    }
  }, [location]);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());
  const [selectedBarangay, setSelectedBarangay] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [exportFormat, setExportFormat] = useState<"pdf" | "excel" | "csv">("pdf");

  // Fetch data for reports
  const { data: households = [] } = trpc.households.list.useQuery();
  const { data: stats } = trpc.households.statusStatistics.useQuery();

  // Filter households based on selected criteria
  const filteredHouseholds = households.filter(h => {
    const matchesBarangay = selectedBarangay === "all" || h.barangay === selectedBarangay;
    const matchesStatus = selectedStatus === "all" || h.status === selectedStatus;
    const householdDate = new Date(h.createdAt);
    const matchesDateRange = (!dateFrom || householdDate >= dateFrom) && (!dateTo || householdDate <= dateTo);
    
    return matchesBarangay && matchesStatus && matchesDateRange;
  });

  // Get unique barangays for filter
  const barangays = Array.from(new Set(households.map(h => h.barangay))).sort();

  const handleGenerateReport = (templateId: string) => {
    setSelectedTemplate(templateId);
    toast.success(`Generating ${reportTemplates.find(t => t.id === templateId)?.title}...`);
  };

  const handleExportReport = () => {
    if (!selectedTemplate) {
      toast.error("Please select a report template first");
      return;
    }

    const template = reportTemplates.find(t => t.id === selectedTemplate);
    const reportTitle = `${template?.title} - ${format(dateFrom || new Date(), "MMM dd")} to ${format(dateTo || new Date(), "MMM dd, yyyy")}`;

    // Prepare report data based on template
    let headers: string[] = [];
    let rows: string[][] = [];

    switch (selectedTemplate) {
      case "monthly-summary":
        headers = ["Metric", "Value", "Change"];
        rows = [
          ["Total Surveys", filteredHouseholds.length.toString(), `${selectedBarangay === "all" ? "All Barangays" : selectedBarangay}`],
          ["Approved", stats?.approved.toString() || "0", `${stats?.approvalRate}% rate`],
          ["Pending Review", stats?.submitted.toString() || "0", "Awaiting approval"],
          ["Returned", stats?.returned.toString() || "0", "Needs corrections"],
          ["4Ps Beneficiaries", filteredHouseholds.filter(h => h.fourPsBeneficiary).length.toString(), "Enrolled"],
        ];
        break;

      case "barangay-analysis":
        headers = ["Barangay", "Households", "4Ps", "Avg Income", "Status"];
        const barangayGroups = barangays.map(barangay => {
          const barangayHouseholds = filteredHouseholds.filter(h => h.barangay === barangay);
          const fourPs = barangayHouseholds.filter(h => h.fourPsBeneficiary).length;
          const avgIncome = barangayHouseholds.reduce((sum, h) => sum + (Number(h.monthlyIncome) || 0), 0) / (barangayHouseholds.length || 1);
          return [
            barangay,
            barangayHouseholds.length.toString(),
            fourPs.toString(),
            `₱${avgIncome.toFixed(0)}`,
            "Active"
          ];
        });
        rows = barangayGroups;
        break;

      case "program-enrollment":
        headers = ["Program", "Enrolled", "Percentage"];
        const total = filteredHouseholds.length;
        rows = [
          ["4Ps", filteredHouseholds.filter(h => h.fourPsBeneficiary).length.toString(), `${((filteredHouseholds.filter(h => h.fourPsBeneficiary).length / total) * 100).toFixed(1)}%`],
          ["TUPAD", filteredHouseholds.filter(h => h.tupadBeneficiary).length.toString(), `${((filteredHouseholds.filter(h => h.tupadBeneficiary).length / total) * 100).toFixed(1)}%`],
          ["Senior Citizens", filteredHouseholds.filter(h => h.seniorCitizen).length.toString(), `${((filteredHouseholds.filter(h => h.seniorCitizen).length / total) * 100).toFixed(1)}%`],
          ["PWD Members", filteredHouseholds.filter(h => h.pwdMember).length.toString(), `${((filteredHouseholds.filter(h => h.pwdMember).length / total) * 100).toFixed(1)}%`],
          ["Indigenous Peoples", filteredHouseholds.filter(h => h.indigenousPeople).length.toString(), `${((filteredHouseholds.filter(h => h.indigenousPeople).length / total) * 100).toFixed(1)}%`],
        ];
        break;

      default:
        headers = ["Field", "Value"];
        rows = [["Data", "Not available for this report type"]];
    }

    // Export based on format
    if (exportFormat === "pdf") {
      exportToPDF(reportTitle, headers, rows, selectedTemplate || "report");
      toast.success("Report exported as PDF");
    } else if (exportFormat === "csv") {
      // Convert to object array for CSV export
      const csvData = rows.map(row => {
        const obj: Record<string, string> = {};
        headers.forEach((header, idx) => {
          obj[header] = row[idx] || "";
        });
        return obj;
      });
      exportToCSV(csvData, selectedTemplate || "report");
      toast.success("Report exported as CSV");
    } else {
      // Excel export (using CSV for now)
      const csvData = rows.map(row => {
        const obj: Record<string, string> = {};
        headers.forEach((header, idx) => {
          obj[header] = row[idx] || "";
        });
        return obj;
      });
      exportToCSV(csvData, selectedTemplate || "report");
      toast.success("Report exported as Excel");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
          <p className="text-muted-foreground mt-1">
            Generate comprehensive analytical reports with custom filters and export options
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            <Clock className="h-3 w-3 mr-1" />
            {filteredHouseholds.length} records
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="templates" className="space-y-6">
        <TabsList>
          <TabsTrigger value="templates">Report Templates</TabsTrigger>
          <TabsTrigger value="custom">Custom Report Builder</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled Reports</TabsTrigger>
        </TabsList>

        {/* Report Templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          {/* Report Template Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reportTemplates.map((template) => (
              <Card 
                key={template.id}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md",
                  selectedTemplate === template.id && "ring-2 ring-primary"
                )}
                onClick={() => handleGenerateReport(template.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className={`p-3 rounded-lg ${template.bg}`}>
                      <template.icon className={`h-6 w-6 ${template.color}`} />
                    </div>
                    {selectedTemplate === template.id && (
                      <Badge variant="default">Selected</Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg mt-4">{template.title}</CardTitle>
                  <CardDescription>{template.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Includes:</p>
                    <div className="flex flex-wrap gap-1">
                      {template.fields.slice(0, 3).map((field, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {field}
                        </Badge>
                      ))}
                      {template.fields.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{template.fields.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters and Export Section */}
          {selectedTemplate && (
            <Card>
              <CardHeader>
                <CardTitle>Report Configuration</CardTitle>
                <CardDescription>
                  Customize filters and export options for your selected report
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Filters Row */}
                <div className="grid gap-4 md:grid-cols-4">
                  {/* Date From */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date From</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !dateFrom && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateFrom ? format(dateFrom, "MMM dd, yyyy") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={dateFrom}
                          onSelect={setDateFrom}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Date To */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date To</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !dateTo && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateTo ? format(dateTo, "MMM dd, yyyy") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={dateTo}
                          onSelect={setDateTo}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Barangay Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Barangay</label>
                    <Select value={selectedBarangay} onValueChange={setSelectedBarangay}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select barangay" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Barangays</SelectItem>
                        {barangays.map((barangay) => (
                          <SelectItem key={barangay} value={barangay}>
                            {barangay}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Status Filter */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="returned">Returned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Export Options */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium">Export Format:</span>
                    <div className="flex gap-2">
                      <Button
                        variant={exportFormat === "pdf" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setExportFormat("pdf")}
                      >
                        <File className="h-4 w-4 mr-2" />
                        PDF
                      </Button>
                      <Button
                        variant={exportFormat === "excel" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setExportFormat("excel")}
                      >
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Excel
                      </Button>
                      <Button
                        variant={exportFormat === "csv" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setExportFormat("csv")}
                      >
                        <File className="h-4 w-4 mr-2" />
                        CSV
                      </Button>
                    </div>
                  </div>
                  <Button onClick={handleExportReport} size="lg">
                    <Download className="h-4 w-4 mr-2" />
                    Generate & Export Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Custom Report Builder Tab */}
        <TabsContent value="custom" className="space-y-6">
          <CustomReportBuilder />
        </TabsContent>

        {/* Scheduled Reports Tab */}
        <TabsContent value="scheduled" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Scheduled Reports</CardTitle>
              <CardDescription>
                Set up automated report generation and email delivery
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <div className="text-center space-y-2">
                  <AlertCircle className="h-12 w-12 mx-auto opacity-50" />
                  <p className="font-medium">Scheduled Reports</p>
                  <p className="text-sm">
                    Automated report scheduling coming soon
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
