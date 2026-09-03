import { useLocation, useRoute } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MapPin, Phone, Calendar, User, Users, Home, Briefcase, HeartPulse, ShieldCheck, FileText } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";

// Mock data for a single household (in a real app, fetch by ID)
const mockHousehold = {
  id: "HH-001",
  headName: "Juan Dela Cruz",
  respondentName: "Maria Dela Cruz",
  address: "Purok 3, Baclaran, Parañaque City",
  contactNumber: "0917-123-4567",
  interviewDate: "2025-01-15",
  interviewer: "Jane Doe",
  status: "Verified",
  gps: "14.5311° N, 120.9985° E",
  
  members: [
    { name: "Juan Dela Cruz", relation: "Head", age: 45, sex: "Male", civil: "Married", educ: "High School Grad", job: "Farmer" },
    { name: "Maria Dela Cruz", relation: "Spouse", age: 42, sex: "Female", civil: "Married", educ: "College Grad", job: "Teacher" },
    { name: "Jose Dela Cruz", relation: "Son", age: 18, sex: "Male", civil: "Single", educ: "College Level", job: "Student" },
    { name: "Ana Dela Cruz", relation: "Daughter", age: 12, sex: "Female", civil: "Single", educ: "Elem Level", job: "Student" },
  ],

  housing: {
    type: "Single House",
    roof: "Galvanized Iron",
    walls: "Concrete",
    floor: "Cement",
    bedrooms: 2,
    toilet: "Water-sealed, exclusive",
    water: "Level III (Faucet)",
    electricity: "CAGELCO"
  },

  economic: {
    income: "8,000",
    source: "Farming, Livestock",
    tenure: "Owner",
    appliances: ["TV", "Refrigerator", "Washing Machine"],
    vehicles: ["Motorcycle"]
  },

  social: {
    philhealth: "Member (Indigent)",
    pwd: "None",
    soloParent: "No",
    senior: "None",
    ips: "Ibanag",
    programs: ["4Ps", "TUPAD"]
  }
};

// History Tab Component
function HistoryTab({ householdId, household }: { householdId: number; household: any }) {
  const { data: statusHistory = [], isLoading } = trpc.households.getStatusHistory.useQuery(
    { id: householdId },
    { enabled: householdId > 0 }
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading history...
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "approved":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "returned":
        return <XCircle className="h-5 w-5 text-red-600" />;
      case "submitted":
        return <Clock className="h-5 w-5 text-blue-600" />;
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "approved":
        return "bg-green-500";
      case "returned":
        return "bg-red-500";
      case "submitted":
        return "bg-blue-500";
      default:
        return "bg-yellow-500";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <FileText className="h-5 w-5 mr-2 text-purple-600" /> Survey History
        </CardTitle>
        <CardDescription>Timeline of all survey submissions and status changes.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {statusHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No history available
            </div>
          ) : (
            statusHistory.map((entry, idx) => (
              <div key={idx} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full mt-1 ${getStatusColor(entry.status)}`}></div>
                  {idx < statusHistory.length - 1 && (
                    <div className="w-0.5 h-full bg-border mt-1"></div>
                  )}
                </div>
                <div className="flex-1 pb-6">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium flex items-center gap-2">
                      {getStatusIcon(entry.status)}
                      {entry.action}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(entry.date).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">By {entry.user}</div>
                  {entry.details && (
                    <div className="text-sm">
                      <Badge variant="outline" className={entry.status === "returned" ? "border-red-300 text-red-700" : ""}>
                        {entry.details}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Current Status */}
          <div className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full mt-1 ${getStatusColor(household.status)}`}></div>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium flex items-center gap-2">
                  {getStatusIcon(household.status)}
                  Current Status: {household.status.charAt(0).toUpperCase() + household.status.slice(1)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {household.reviewedAt ? new Date(household.reviewedAt).toLocaleDateString() : "Present"}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {household.status === "approved" && "Survey has been reviewed and approved"}
                {household.status === "submitted" && "Awaiting supervisor review"}
                {household.status === "returned" && household.returnReason && (
                  <span className="text-red-600">Returned: {household.returnReason}</span>
                )}
                {household.status === "draft" && "Survey is still in draft mode"}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function HouseholdProfile() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/households/:id");
  const householdId = match && params.id ? parseInt(params.id) : 0;

  // Fetch real household data from database
  const { data: household, isLoading: householdLoading } = trpc.households.get.useQuery(
    { id: householdId },
    { enabled: householdId > 0 }
  );
  
  // Fetch survey response data
  const { data: surveyData, isLoading: surveyLoading } = trpc.surveys.getByHouseholdId.useQuery(
    { householdId },
    { enabled: householdId > 0 }
  );
  
  const isLoading = householdLoading || surveyLoading;
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading household profile...</div>
      </div>
    );
  }
  
  if (!household) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Household not found</div>
      </div>
    );
  }
  
  // Transform database data to match the expected format
  const data = {
    id: `HH-${household.id.toString().padStart(3, '0')}`,
    headName: household.headOfFamily || "N/A",
    respondentName: household.headOfFamily || "N/A",
    address: `${household.barangay}, ${household.municipality}`,
    contactNumber: "N/A",
    interviewDate: household.createdAt ? new Date(household.createdAt).toLocaleDateString() : "N/A",
    interviewer: "Field Worker",
    status: household.status || "submitted",
    gps: household.latitude && household.longitude ? `${household.latitude}° N, ${household.longitude}° E` : "N/A",
    verificationPhoto: household.verificationPhoto,
    
    members: surveyData?.sectionB ? JSON.parse(surveyData.sectionB as string).members || [] : [],
    housing: surveyData?.sectionD ? JSON.parse(surveyData.sectionD as string) : {},
    economic: {
      income: household.monthlyIncome ? parseFloat(household.monthlyIncome).toLocaleString() : "0",
      source: household.occupation || "N/A",
      tenure: "N/A",
      appliances: [],
      vehicles: []
    },
    social: {
      philhealth: "N/A",
      pwd: household.pwdMember ? "Yes" : "No",
      soloParent: "N/A",
      senior: household.seniorCitizen ? "Yes" : "No",
      ips: household.indigenousPeople ? "Yes" : "No",
      programs: [household.fourPsBeneficiary && "4Ps", household.tupadBeneficiary && "TUPAD"].filter((p): p is string => typeof p === "string")
    }
  }; 

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/households")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{data.headName}</h1>
              <div className="flex items-center text-muted-foreground text-sm mt-1">
                <Badge variant="outline" className="mr-2">{data.id}</Badge>
                <MapPin className="h-3 w-3 mr-1" /> {data.address}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge className={
              data.status === "approved" ? "bg-green-600 hover:bg-green-700" :
              data.status === "submitted" ? "bg-blue-600 hover:bg-blue-700" :
              data.status === "returned" ? "bg-red-600 hover:bg-red-700" :
              "bg-yellow-600 hover:bg-yellow-700"
            }>
              {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
            </Badge>
            <Button variant="outline" size="sm">
              <FileText className="h-4 w-4 mr-2" /> Export Profile
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Left Sidebar: Key Info */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Survey Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center"><Calendar className="h-3 w-3 mr-2"/> Date</span>
                  <span className="font-medium">{data.interviewDate}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center"><User className="h-3 w-3 mr-2"/> Respondent</span>
                  <span className="font-medium">{data.respondentName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center"><Phone className="h-3 w-3 mr-2"/> Contact</span>
                  <span className="font-medium">{data.contactNumber}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center"><MapPin className="h-3 w-3 mr-2"/> GPS</span>
                  <span className="font-medium text-xs">{data.gps}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Programs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {data.social.programs.map(p => (
                    <Badge key={p} variant="secondary">{p}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Content: Tabs */}
          <div className="md:col-span-2">
            <Tabs defaultValue="members" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="members">Family</TabsTrigger>
                <TabsTrigger value="housing">Housing</TabsTrigger>
                <TabsTrigger value="economic">Economic</TabsTrigger>
                <TabsTrigger value="social">Social</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              {/* Family Members Tab */}
              <TabsContent value="members" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center"><Users className="h-5 w-5 mr-2 text-blue-600"/> Household Members</CardTitle>
                    <CardDescription>List of all individuals living in the household.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {data.members.map((member: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                          <div>
                            <div className="font-medium">{member.name}</div>
                            <div className="text-xs text-muted-foreground">{member.relation} • {member.age} y/o • {member.sex}</div>
                          </div>
                          <div className="text-right text-sm">
                            <div>{member.job}</div>
                            <div className="text-xs text-muted-foreground">{member.educ}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Housing Tab */}
              <TabsContent value="housing" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center"><Home className="h-5 w-5 mr-2 text-orange-600"/> Housing Characteristics</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Building Type</div>
                      <div className="font-medium">{data.housing.type}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Roof Material</div>
                      <div className="font-medium">{data.housing.roof}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Wall Material</div>
                      <div className="font-medium">{data.housing.walls}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Toilet Facility</div>
                      <div className="font-medium">{data.housing.toilet}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Water Source</div>
                      <div className="font-medium">{data.housing.water}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Electricity</div>
                      <div className="font-medium">{data.housing.electricity}</div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Economic Tab */}
              <TabsContent value="economic" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center"><Briefcase className="h-5 w-5 mr-2 text-green-600"/> Economic Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Monthly Income</div>
                        <div className="font-medium text-lg">₱{data.economic.income}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Main Source</div>
                        <div className="font-medium">{data.economic.source}</div>
                      </div>
                    </div>
                    <div className="pt-4 border-t">
                      <div className="text-sm font-medium mb-2">Assets</div>
                      <div className="flex flex-wrap gap-2">
                        {data.economic.appliances.map(a => <Badge key={a} variant="outline">{a}</Badge>)}
                        {data.economic.vehicles.map(v => <Badge key={v} variant="outline">{v}</Badge>)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Social Tab */}
              <TabsContent value="social" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center"><HeartPulse className="h-5 w-5 mr-2 text-red-600"/> Social Services & Health</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">PhilHealth</div>
                      <div className="font-medium">{data.social.philhealth}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">PWD Member</div>
                      <div className="font-medium">{data.social.pwd}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Solo Parent</div>
                      <div className="font-medium">{data.social.soloParent}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Indigenous People</div>
                      <div className="font-medium">{data.social.ips}</div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* History Tab */}
              <TabsContent value="history" className="mt-4">
                <HistoryTab householdId={householdId} household={household} />
              </TabsContent>

            </Tabs>
          </div>
        </div>
      </div>
  );
}
