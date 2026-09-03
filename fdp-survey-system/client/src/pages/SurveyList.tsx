import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Filter, Download, FileText, CheckCircle, XCircle, Clock, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { exportToCSV, exportToPDF } from "@/lib/exportUtils";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case "approved":
      return "bg-green-100 text-green-700 hover:bg-green-200 border-green-200";
    case "submitted":
      return "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200";
    case "draft":
      return "bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-200";
    case "returned":
      return "bg-red-100 text-red-700 hover:bg-red-200 border-red-200";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const getStatusLabel = (status: string) => {
  return status.charAt(0).toUpperCase() + status.slice(1);
};

export default function SurveyList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<number | null>(null);
  const [returnReason, setReturnReason] = useState("");

  const { data: households = [], isLoading } = trpc.households.list.useQuery();
  const utils = trpc.useUtils();

  const approveMutation = trpc.households.approve.useMutation({
    onSuccess: () => {
      toast.success("Survey approved successfully");
      utils.households.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to approve survey: ${error.message}`);
    },
  });

  const returnMutation = trpc.households.return.useMutation({
    onSuccess: () => {
      toast.success("Survey returned for corrections");
      utils.households.list.invalidate();
      setReturnDialogOpen(false);
      setReturnReason("");
      setSelectedHouseholdId(null);
    },
    onError: (error) => {
      toast.error(`Failed to return survey: ${error.message}`);
    },
  });

  const deleteMutation = trpc.households.delete.useMutation({
    onSuccess: () => {
      toast.success("Survey deleted successfully");
      utils.households.list.invalidate();
      setDeleteDialogOpen(false);
      setSelectedHouseholdId(null);
    },
    onError: (error) => {
      toast.error(`Failed to delete survey: ${error.message}`);
    },
  });

  // Filter households based on search query and status
  const filteredHouseholds = households.filter(household => {
    const matchesSearch = 
      household.headOfFamily.toLowerCase().includes(searchQuery.toLowerCase()) ||
      household.barangay.toLowerCase().includes(searchQuery.toLowerCase()) ||
      household.id.toString().includes(searchQuery);
    
    const matchesStatus = statusFilter === "all" || household.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Count surveys by status
  const statusCounts = {
    all: households.length,
    submitted: households.filter(h => h.status === "submitted").length,
    approved: households.filter(h => h.status === "approved").length,
    returned: households.filter(h => h.status === "returned").length,
    draft: households.filter(h => h.status === "draft").length,
  };

  const handleExportCSV = () => {
    const exportData = filteredHouseholds.map(h => ({
      id: `HH-${h.id}`,
      head: h.headOfFamily,
      barangay: h.barangay,
      date: new Date(h.createdAt).toLocaleDateString(),
      status: getStatusLabel(h.status),
    }));
    exportToCSV(exportData, "survey_data");
    toast.success("CSV export started");
  };

  const handleExportPDF = () => {
    const headers = ["ID", "Head of Family", "Barangay", "Date", "Status"];
    const data = filteredHouseholds.map(h => [
      `HH-${h.id}`,
      h.headOfFamily,
      h.barangay,
      new Date(h.createdAt).toLocaleDateString(),
      getStatusLabel(h.status),
    ]);
    exportToPDF("Survey Master List", headers, data, "survey_report");
    toast.success("PDF export started");
  };

  const handleApprove = (id: number) => {
    approveMutation.mutate({ id });
  };

  const handleReturn = (id: number) => {
    setSelectedHouseholdId(id);
    setReturnDialogOpen(true);
  };

  const handleReturnSubmit = () => {
    if (!selectedHouseholdId || !returnReason.trim()) {
      toast.error("Please provide a reason for returning the survey");
      return;
    }
    returnMutation.mutate({ id: selectedHouseholdId, reason: returnReason });
  };

  const handleDeleteClick = (id: number) => {
    setSelectedHouseholdId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!selectedHouseholdId) return;
    deleteMutation.mutate({ id: selectedHouseholdId });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Survey Management</h2>
          <p className="text-muted-foreground mt-1">
            Manage and track household surveys across the province.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV} className="hidden sm:flex">
            <FileText className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" onClick={handleExportPDF} className="hidden sm:flex">
            <Download className="mr-2 h-4 w-4" /> Export PDF
          </Button>
          <Link href="/surveys/new">
            <Button className="shadow-lg hover:shadow-xl transition-all duration-200">
              <Plus className="mr-2 h-4 w-4" /> New Survey
            </Button>
          </Link>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          onClick={() => setStatusFilter("all")}
          className="whitespace-nowrap"
        >
          All <Badge variant="secondary" className="ml-2">{statusCounts.all}</Badge>
        </Button>
        <Button
          variant={statusFilter === "submitted" ? "default" : "outline"}
          onClick={() => setStatusFilter("submitted")}
          className="whitespace-nowrap"
        >
          <Clock className="mr-1 h-4 w-4" />
          Submitted <Badge variant="secondary" className="ml-2">{statusCounts.submitted}</Badge>
        </Button>
        <Button
          variant={statusFilter === "approved" ? "default" : "outline"}
          onClick={() => setStatusFilter("approved")}
          className="whitespace-nowrap"
        >
          <CheckCircle className="mr-1 h-4 w-4" />
          Approved <Badge variant="secondary" className="ml-2">{statusCounts.approved}</Badge>
        </Button>
        <Button
          variant={statusFilter === "returned" ? "default" : "outline"}
          onClick={() => setStatusFilter("returned")}
          className="whitespace-nowrap"
        >
          <XCircle className="mr-1 h-4 w-4" />
          Returned <Badge variant="secondary" className="ml-2">{statusCounts.returned}</Badge>
        </Button>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <CardTitle className="text-lg font-medium">
              {statusFilter === "all" ? "All Surveys" : `${getStatusLabel(statusFilter)} Surveys`}
            </CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by ID, Name, or Barangay..."
                  className="pl-9 bg-secondary/20"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-secondary/30">
                <TableRow>
                  <TableHead className="font-semibold">Household ID</TableHead>
                  <TableHead className="font-semibold">Head of Family</TableHead>
                  <TableHead className="font-semibold">Barangay</TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Loading surveys...
                    </TableCell>
                  </TableRow>
                ) : filteredHouseholds.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {searchQuery || statusFilter !== "all" 
                        ? "No surveys found matching your filters." 
                        : "No surveys submitted yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredHouseholds.map((household) => (
                    <TableRow key={household.id} className="hover:bg-secondary/10 transition-colors">
                      <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                        HH-{household.id}
                      </TableCell>
                      <TableCell className="font-medium">{household.headOfFamily}</TableCell>
                      <TableCell>{household.barangay}</TableCell>
                      <TableCell>{new Date(household.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusColor(household.status)}>
                          {getStatusLabel(household.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteClick(household.id)}
                            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                Actions
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <Link href={`/households/${household.id}`}>
                                <DropdownMenuItem>
                                  View Details
                                </DropdownMenuItem>
                              </Link>
                              <DropdownMenuSeparator />
                              {household.status === "submitted" && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => handleApprove(household.id)}
                                    className="text-green-600"
                                  >
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Approve Survey
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleReturn(household.id)}
                                    className="text-red-600"
                                  >
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Return for Corrections
                                  </DropdownMenuItem>
                                </>
                              )}
                              {household.status === "returned" && (
                                <DropdownMenuItem
                                  onClick={() => handleApprove(household.id)}
                                  className="text-green-600"
                                >
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Approve Survey
                                </DropdownMenuItem>
                              )}
                              {household.status === "approved" && (
                                <DropdownMenuItem disabled className="text-muted-foreground">
                                  Already Approved
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Survey Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Survey</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this survey? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Survey"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Survey Dialog */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return Survey for Corrections</DialogTitle>
            <DialogDescription>
              Please provide a reason for returning this survey. The surveyor will be notified to make corrections.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              placeholder="e.g., Missing verification photo, Incomplete household roster, Invalid GPS coordinates..."
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReturnSubmit} disabled={!returnReason.trim()}>
              Return Survey
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
