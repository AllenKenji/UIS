import { useState } from "react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Search, Download, Filter, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { exportToCSV, exportToPDF } from "@/lib/exportUtils";
import { trpc } from "@/lib/trpc";

// This mock data is replaced by database queries below
const householdDataMock = [
  {
    id: "HH-001",
    headName: "Juan Dela Cruz",
    age: 45,
    sex: "Male",
    civilStatus: "Married",
    education: "High School Graduate",
    pwd: "No",
    occupation: "Farmer",
    monthlyIncome: "8,000",
    philhealth: "Member",
    beneficiary4Ps: "Yes",
    otherPrograms: "TUPAD",
    barangay: "Centro",
    municipality: "Parañaque"
  },
  {
    id: "HH-002",
    headName: "Maria Santos",
    age: 38,
    sex: "Female",
    civilStatus: "Widowed",
    education: "College Graduate",
    pwd: "No",
    occupation: "Teacher",
    monthlyIncome: "25,000",
    philhealth: "Member",
    beneficiary4Ps: "No",
    otherPrograms: "None",
    barangay: "Carig",
    municipality: "Parañaque"
  },
  {
    id: "HH-003",
    headName: "Pedro Reyes",
    age: 62,
    sex: "Male",
    civilStatus: "Married",
    education: "Elementary Level",
    pwd: "Yes",
    occupation: "None",
    monthlyIncome: "3,000",
    philhealth: "Dependent",
    beneficiary4Ps: "Yes",
    otherPrograms: "Social Pension",
    barangay: "Ugac",
    municipality: "Parañaque"
  },
  {
    id: "HH-004",
    headName: "Elena Garcia",
    age: 29,
    sex: "Female",
    civilStatus: "Single",
    education: "College Level",
    pwd: "No",
    occupation: "Call Center Agent",
    monthlyIncome: "18,000",
    philhealth: "Member",
    beneficiary4Ps: "No",
    otherPrograms: "None",
    barangay: "Centro",
    municipality: "Parañaque"
  },
  {
    id: "HH-005",
    headName: "Ricardo Dalisay",
    age: 52,
    sex: "Male",
    civilStatus: "Married",
    education: "Vocational",
    pwd: "No",
    occupation: "Carpenter",
    monthlyIncome: "12,000",
    philhealth: "Indigent",
    beneficiary4Ps: "Yes",
    otherPrograms: "AICS",
    barangay: "Buntun",
    municipality: "Parañaque"
  },
  // Add more mock data as needed
];

type SortConfig = {
  key: string;
  direction: "asc" | "desc";
} | null;

export default function HouseholdMasterList() {
  const [location, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [filter4Ps, setFilter4Ps] = useState<"All" | "Yes" | "No">("All");
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  
  // Fetch real household data from database
  const { data: householdData = [], isLoading } = trpc.households.list.useQuery();

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="ml-2 h-4 w-4 text-foreground" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4 text-foreground" />
    );
  };

  // Transform database records to match the expected format
  const transformedData = householdData.map(household => ({
    id: `HH-${household.id.toString().padStart(3, '0')}`,
    headName: household.headOfFamily || "N/A",
    age: household.age || 0,
    sex: "N/A", // Not in current schema
    civilStatus: household.civilStatus || "N/A",
    education: household.education || "N/A",
    pwd: household.pwdMember ? "Yes" : "No",
    occupation: household.occupation || "N/A",
    monthlyIncome: household.monthlyIncome ? parseFloat(household.monthlyIncome).toLocaleString() : "0",
    philhealth: "N/A", // Not in current schema
    beneficiary4Ps: household.fourPsBeneficiary ? "Yes" : "No",
    otherPrograms: household.tupadBeneficiary ? "TUPAD" : "None",
    barangay: household.barangay || "N/A",
    municipality: household.municipality || "N/A"
  }));
  
  const filteredData = transformedData.filter(item => {
    const term = searchTerm.toLowerCase();
    
    // Global search across all relevant fields
    const matchesSearch = 
      item.headName.toLowerCase().includes(term) ||
      item.id.toLowerCase().includes(term) ||
      item.barangay.toLowerCase().includes(term) ||
      item.municipality.toLowerCase().includes(term) ||
      item.occupation.toLowerCase().includes(term) ||
      item.civilStatus.toLowerCase().includes(term) ||
      item.education.toLowerCase().includes(term) ||
      item.sex.toLowerCase().includes(term) ||
      item.age.toString().includes(term) ||
      item.monthlyIncome.includes(term) ||
      item.otherPrograms.toLowerCase().includes(term);
    
    const matchesFilter = filter4Ps === "All" || item.beneficiary4Ps === filter4Ps;

    return matchesSearch && matchesFilter;
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortConfig) return 0;

    const { key, direction } = sortConfig;
    let aValue = (a as any)[key];
    let bValue = (b as any)[key];

    // Handle numeric sorting for income
    if (key === "monthlyIncome") {
      aValue = parseFloat(aValue.replace(/,/g, ""));
      bValue = parseFloat(bValue.replace(/,/g, ""));
    }

    if (aValue < bValue) {
      return direction === "asc" ? -1 : 1;
    }
    if (aValue > bValue) {
      return direction === "asc" ? 1 : -1;
    }
    return 0;
  });

  const handleExportCSV = () => {
    exportToCSV(sortedData, "household_master_list");
  };

  const handleExportPDF = () => {
    const columns = ["ID", "Head Name", "Age", "Sex", "Status", "Educ", "PWD", "Job", "Income", "4Ps"];
    const rows = sortedData.map(d => [
      d.id, d.headName, d.age, d.sex, d.civilStatus, d.education, d.pwd, d.occupation, d.monthlyIncome, d.beneficiary4Ps
    ]);
    exportToPDF("Household Master List", columns, rows, "household_master_list");
  };

  return (
    <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Household Master List</h1>
            <p className="text-muted-foreground">
              Detailed demographic and economic profile of all surveyed households.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col lg:flex-row justify-between gap-4">
              <div className="relative w-full lg:w-96">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by keyword (e.g., Farmer, Married, 45)..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center border rounded-md px-3 bg-background">
                  <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                  <select 
                    className="bg-transparent text-sm outline-none h-9"
                    aria-label="Filter households by 4Ps status"
                    value={filter4Ps}
                    onChange={(e) => setFilter4Ps(e.target.value as any)}
                  >
                    <option value="All">All Households</option>
                    <option value="Yes">4Ps Beneficiaries</option>
                    <option value="No">Non-4Ps</option>
                  </select>
                </div>
                <Button className="flex-1 sm:flex-none" variant="outline" onClick={handleExportCSV}>
                  <Download className="mr-2 h-4 w-4" /> CSV
                </Button>
                <Button className="flex-1 sm:flex-none" variant="outline" onClick={handleExportPDF}>
                  <Download className="mr-2 h-4 w-4" /> PDF
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-muted-foreground">Loading household data...</div>
              </div>
            ) : (
            <>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("id")}>
                      <div className="flex items-center">HH ID {getSortIcon("id")}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("headName")}>
                      <div className="flex items-center">Head of Family {getSortIcon("headName")}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("age")}>
                      <div className="flex items-center">Age/Sex {getSortIcon("age")}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("civilStatus")}>
                      <div className="flex items-center">Civil Status {getSortIcon("civilStatus")}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("education")}>
                      <div className="flex items-center">Education {getSortIcon("education")}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("pwd")}>
                      <div className="flex items-center">PWD {getSortIcon("pwd")}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("occupation")}>
                      <div className="flex items-center">Occupation {getSortIcon("occupation")}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("monthlyIncome")}>
                      <div className="flex items-center">Monthly Income {getSortIcon("monthlyIncome")}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("philhealth")}>
                      <div className="flex items-center">PhilHealth {getSortIcon("philhealth")}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("beneficiary4Ps")}>
                      <div className="flex items-center">4Ps {getSortIcon("beneficiary4Ps")}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => handleSort("otherPrograms")}>
                      <div className="flex items-center">Other Programs {getSortIcon("otherPrograms")}</div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center h-24 text-muted-foreground">
                        No households found matching your criteria.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedData.map((row) => (
                      <TableRow 
                        key={row.id} 
                        className="hover:bg-muted/50 cursor-pointer"
                        onClick={() => setLocation(`/households/${row.id}`)}
                      >
                        <TableCell className="font-medium text-blue-600">{row.id}</TableCell>
                        <TableCell>
                          <div className="font-medium">{row.headName}</div>
                          <div className="text-xs text-muted-foreground">{row.barangay}, {row.municipality}</div>
                        </TableCell>
                        <TableCell>{row.age} / {row.sex}</TableCell>
                        <TableCell>{row.civilStatus}</TableCell>
                        <TableCell className="max-w-[150px] truncate" title={row.education}>{row.education}</TableCell>
                        <TableCell>
                          {row.pwd === "Yes" ? (
                            <Badge variant="destructive" className="text-[10px]">Yes</Badge>
                          ) : (
                            <span className="text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell>{row.occupation}</TableCell>
                        <TableCell>₱{row.monthlyIncome}</TableCell>
                        <TableCell>{row.philhealth}</TableCell>
                        <TableCell>
                          {row.beneficiary4Ps === "Yes" ? (
                            <Badge variant="default" className="bg-blue-600 hover:bg-blue-700 text-[10px]">Yes</Badge>
                          ) : (
                            <span className="text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{row.otherPrograms}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 text-xs text-muted-foreground text-right">
              Showing {sortedData.length} of {transformedData.length} records
            </div>
            </>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
