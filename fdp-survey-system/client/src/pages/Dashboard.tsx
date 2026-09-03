import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Home, Activity, TrendingUp, AlertCircle, Download, Map as MapIcon, FilterX, Layers, ArrowRight, Search } from "lucide-react";
import { useLocation } from "wouter";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell, PieChart, Pie } from "recharts";
import { Button } from "@/components/ui/button";
import { exportToCSV, exportToPDF } from "@/lib/exportUtils";
import { toast } from "sonner";
import { MapView } from "@/components/Map";
import { useState, useRef, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import StatusOverviewWidget from "@/components/StatusOverviewWidget";
import CBMSWidget from "@/components/CBMSWidget";
import CBMSAlertPanel from "@/components/CBMSAlertPanel";

// Mock data for Parañaque barangays
const locationData: Record<string, any> = {
  "Baclaran": {
    households: "12,450", population: "58,200", beneficiaries: "3,200", pending: "145",
    povertyIncidence: "Low", beneficiariesCount: 3200,
    income: [
      { name: "< 5k", value: 2400 }, { name: "5k-10k", value: 4567 },
      { name: "10k-20k", value: 3200 }, { name: "20k-50k", value: 1500 }, { name: "> 50k", value: 783 }
    ],
    needs: [
      { name: "Financial Aid", value: 45, color: "var(--chart-1)" },
      { name: "Livelihood", value: 30, color: "var(--chart-2)" },
      { name: "Health Services", value: 15, color: "var(--chart-3)" },
      { name: "Education", value: 10, color: "var(--chart-4)" }
    ]
  },
  "BF Homes": {
    households: "4,200", population: "18,500", beneficiaries: "1,800", pending: "45",
    povertyIncidence: "High", beneficiariesCount: 1800,
    income: [
      { name: "< 5k", value: 1200 }, { name: "5k-10k", value: 1500 },
      { name: "10k-20k", value: 800 }, { name: "20k-50k", value: 400 }, { name: "> 50k", value: 100 }
    ],
    needs: [
      { name: "Financial Aid", value: 60, color: "var(--chart-1)" },
      { name: "Livelihood", value: 25, color: "var(--chart-2)" },
      { name: "Health Services", value: 10, color: "var(--chart-3)" },
      { name: "Education", value: 5, color: "var(--chart-4)" }
    ]
  },
  "Don Bosco": {
    households: "3,800", population: "16,200", beneficiaries: "1,500", pending: "32",
    povertyIncidence: "Medium", beneficiariesCount: 1500,
    income: [
      { name: "< 5k", value: 1500 }, { name: "5k-10k", value: 1200 },
      { name: "10k-20k", value: 600 }, { name: "20k-50k", value: 300 }, { name: "> 50k", value: 50 }
    ],
    needs: [
      { name: "Financial Aid", value: 50, color: "var(--chart-1)" },
      { name: "Livelihood", value: 35, color: "var(--chart-2)" },
      { name: "Health Services", value: 10, color: "var(--chart-3)" },
      { name: "Education", value: 5, color: "var(--chart-4)" }
    ]
  },
  "San Dionisio": {
    households: "2,500", population: "11,000", beneficiaries: "900", pending: "20",
    povertyIncidence: "Medium", beneficiariesCount: 900,
    income: [
      { name: "< 5k", value: 800 }, { name: "5k-10k", value: 900 },
      { name: "10k-20k", value: 500 }, { name: "20k-50k", value: 200 }, { name: "> 50k", value: 100 }
    ],
    needs: [
      { name: "Financial Aid", value: 40, color: "var(--chart-1)" },
      { name: "Livelihood", value: 40, color: "var(--chart-2)" },
      { name: "Health Services", value: 15, color: "var(--chart-3)" },
      { name: "Education", value: 5, color: "var(--chart-4)" }
    ]
  },
  "Moonwalk": {
    households: "3,100", population: "14,500", beneficiaries: "1,200", pending: "28",
    povertyIncidence: "High", beneficiariesCount: 1200,
    income: [
      { name: "< 5k", value: 1100 }, { name: "5k-10k", value: 1000 },
      { name: "10k-20k", value: 600 }, { name: "20k-50k", value: 300 }, { name: "> 50k", value: 100 }
    ],
    needs: [
      { name: "Financial Aid", value: 55, color: "var(--chart-1)" },
      { name: "Livelihood", value: 30, color: "var(--chart-2)" },
      { name: "Health Services", value: 10, color: "var(--chart-3)" },
      { name: "Education", value: 5, color: "var(--chart-4)" }
    ]
  }
};

const defaultData = locationData["Baclaran"];

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [mapLayer, setMapLayer] = useState<"default" | "poverty" | "beneficiaries">("default");
  const [searchQuery, setSearchQuery] = useState("");
  const [openSearch, setOpenSearch] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  
  // Fetch real-time data from database
  const { data: stats, isLoading: statsLoading } = trpc.households.statistics.useQuery();
  const { data: allHouseholds, isLoading: householdsLoading } = trpc.households.list.useQuery();
  const { data: barangayList } = trpc.households.barangayList.useQuery();
  const { data: incomeData, isLoading: incomeLoading } = trpc.households.incomeDistribution.useQuery();
  
  const currentData = selectedLocation && locationData[selectedLocation] ? locationData[selectedLocation] : defaultData;

  // Update map visualization when layer changes
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers and polygons
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];
    polygonsRef.current.forEach(poly => poly.setMap(null));
    polygonsRef.current = [];

    const locations = [
      { lat: 14.5311, lng: 120.9985, title: "Baclaran" },
      { lat: 14.4545, lng: 121.0437, title: "BF Homes" },
      { lat: 14.4840, lng: 121.0280, title: "Don Bosco" },
      { lat: 14.4782, lng: 120.9946, title: "San Dionisio" },
      { lat: 14.5015, lng: 121.0196, title: "Moonwalk" },
    ];

    // Approximate boundaries for demonstration (simple offsets from center)
    const getPolygonCoords = (center: {lat: number, lng: number}) => {
      const d = 0.02; // Roughly 2km radius approximation
      return [
        { lat: center.lat + d, lng: center.lng },
        { lat: center.lat + d/2, lng: center.lng + d },
        { lat: center.lat - d/2, lng: center.lng + d },
        { lat: center.lat - d, lng: center.lng },
        { lat: center.lat - d/2, lng: center.lng - d },
        { lat: center.lat + d/2, lng: center.lng - d },
      ];
    };

    locations.forEach(loc => {
      const data = locationData[loc.title];
      
      if (mapLayer === "default") {
        // Default view: Show Markers
        const marker = new google.maps.Marker({
          position: loc,
          map: mapRef.current,
          title: loc.title,
          animation: google.maps.Animation.DROP,
          cursor: 'pointer'
        });

        marker.addListener("click", () => {
          setSelectedLocation(loc.title);
          toast.info(`Filtered data for ${loc.title}`);
          mapRef.current?.panTo(loc);
          mapRef.current?.setZoom(13);
        });

        markersRef.current.push(marker);

      } else {
        // Data Layers: Show Choropleth Polygons
        let fillColor = "#888888";
        
        if (mapLayer === "poverty") {
          if (data?.povertyIncidence === "High") fillColor = "#EF4444"; // Red-500
          else if (data?.povertyIncidence === "Medium") fillColor = "#EAB308"; // Yellow-500
          else fillColor = "#22C55E"; // Green-500
        } else if (mapLayer === "beneficiaries") {
          if (data?.beneficiariesCount > 2000) fillColor = "#9333EA"; // Purple-600
          else if (data?.beneficiariesCount > 1000) fillColor = "#3B82F6"; // Blue-500
          else fillColor = "#93C5FD"; // Blue-300
        }

        const polygon = new google.maps.Polygon({
          paths: getPolygonCoords(loc),
          strokeColor: "#FFFFFF",
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: fillColor,
          fillOpacity: 0.6,
          map: mapRef.current,
          clickable: true
        });

        // Add hover effect
        google.maps.event.addListener(polygon, 'mouseover', function(this: google.maps.Polygon) {
          this.setOptions({ fillOpacity: 0.8 });
        });
        google.maps.event.addListener(polygon, 'mouseout', function(this: google.maps.Polygon) {
          this.setOptions({ fillOpacity: 0.6 });
        });

        // Add click listener for filtering
        google.maps.event.addListener(polygon, 'click', function() {
          setSelectedLocation(loc.title);
          toast.info(`Filtered data for ${loc.title}`);
          mapRef.current?.panTo(loc);
          mapRef.current?.setZoom(13);
        });

        polygonsRef.current.push(polygon);
        
        // Optional: Add a label marker in the center
        const labelMarker = new google.maps.Marker({
          position: loc,
          map: mapRef.current,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 0
          },
          label: {
            text: loc.title,
            color: "white",
            fontWeight: "bold",
            fontSize: "12px",
            className: "map-label-shadow" // We'd need CSS for shadow, but standard label works
          },
          zIndex: 1000
        });
        markersRef.current.push(labelMarker);
      }
    });
  }, [mapLayer]);

  // Calculate real-time statistics
  const totalHouseholds = stats?.totalHouseholds || 0;
  const fourPsBeneficiaries = stats?.fourPsBeneficiaries || 0;
  const beneficiaryPercentage = totalHouseholds > 0 
    ? ((fourPsBeneficiaries / totalHouseholds) * 100).toFixed(1)
    : "0";
  
  // Calculate average household size (assuming 4.5 members per household as default)
  const avgHouseholdSize = 4.5;
  const totalPopulation = Math.round(totalHouseholds * avgHouseholdSize);
  
  const summaryStats = [
    {
      title: "Total Households",
      value: statsLoading ? "Loading..." : totalHouseholds.toLocaleString(),
      change: "From database",
      icon: Home,
      color: "text-blue-600",
      bg: "bg-blue-100",
    },
    {
      title: "Total Population",
      value: statsLoading ? "Loading..." : totalPopulation.toLocaleString(),
      change: `Est. ${avgHouseholdSize} members/household`,
      icon: Users,
      color: "text-green-600",
      bg: "bg-green-100",
    },
    {
      title: "4Ps Beneficiaries",
      value: statsLoading ? "Loading..." : fourPsBeneficiaries.toLocaleString(),
      change: `${beneficiaryPercentage}% of total households`,
      icon: Activity,
      color: "text-purple-600",
      bg: "bg-purple-100",
    },
    {
      title: "Pending Reviews",
      value: "0",
      change: "All surveys reviewed",
      icon: AlertCircle,
      color: "text-orange-600",
      bg: "bg-orange-100",
    },
  ];

  const handleExportReport = () => {
    const summaryHeaders = ["Metric", "Value", "Change"];
    const summaryRows = summaryStats.map(d => [d.title, d.value, d.change]);
    exportToPDF(`${selectedLocation || "Parañaque"} Survey Report`, summaryHeaders, summaryRows, "report");
    toast.success("Report downloaded");
  };

  const handleLocationSelect = (location: string) => {
    setSelectedLocation(location);
    setOpenSearch(false);
    setSearchQuery(location);
    toast.success(`Found location: ${location}`);
    
    // Find coordinates for the location
    const locations = [
      { lat: 14.5311, lng: 120.9985, title: "Baclaran" },
      { lat: 14.4545, lng: 121.0437, title: "BF Homes" },
      { lat: 14.4840, lng: 121.0280, title: "Don Bosco" },
      { lat: 14.4782, lng: 120.9946, title: "San Dionisio" },
      { lat: 14.5015, lng: 121.0196, title: "Moonwalk" },
    ];
    
    const coords = locations.find(l => l.title === location);
    if (coords && mapRef.current) {
      mapRef.current.panTo(coords);
      mapRef.current.setZoom(14);
    }
  };

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            {selectedLocation ? `${selectedLocation} Dashboard` : "Survey Dashboard Overview"}
          </h2>
          <p className="text-muted-foreground mt-1">
            Real-time community survey insights and operations overview.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedLocation && (
            <Button variant="ghost" size="sm" onClick={() => {
              setSelectedLocation(null);
              setSearchQuery("");
            }} className="text-muted-foreground">
              <FilterX className="mr-2 h-4 w-4" /> Reset Filter
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExportReport}>
            <Download className="mr-2 h-4 w-4" /> Download Report
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/50 px-4 py-2 rounded-lg border border-border">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span>Data updated: Just now</span>
          </div>
        </div>
      </div>

      {/* Status Overview Widget */}
      <StatusOverviewWidget />

      {/* CBMS 13+1 Core Indicators Widget */}
      <CBMSWidget />
      <CBMSAlertPanel compact showConfigLink />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summaryStats.map((item, index) => (
          <Card 
            key={index} 
            className={`border-border/50 shadow-sm hover:shadow-md transition-all duration-200 ${item.title === "Total Households" ? "cursor-pointer ring-1 ring-blue-200 bg-blue-50/30" : ""}`}
            onClick={() => {
              if (item.title === "Total Households") {
                setLocation("/households");
              }
            }}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={`text-sm font-medium ${item.title === "Total Households" ? "text-blue-900" : "text-muted-foreground"}`}>
                {item.title}
              </CardTitle>
              <div className={`p-2 rounded-full ${item.bg}`}>
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${item.title === "Total Households" ? "text-blue-900" : "text-foreground"}`}>{item.value}</div>
              <p className={`text-xs mt-1 ${item.title === "Total Households" ? "text-blue-700/80" : "text-muted-foreground"}`}>{item.change}</p>
              {item.title === "Total Households" && (
                <div className="mt-2 text-xs font-medium text-blue-600 flex items-center">
                  View Master List <ArrowRight className="ml-1 h-3 w-3" />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Income Distribution Chart */}
        <Card className="col-span-4 border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Income Distribution</CardTitle>
            <CardDescription>
              Monthly household income brackets across the province.
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={incomeData || []}>
                  <XAxis 
                    dataKey="name" 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(value) => `${value}`} 
                  />
                  <Tooltip 
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Needs Chart */}
        <Card className="col-span-3 border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Top Family Needs</CardTitle>
            <CardDescription>
              Primary concerns reported by households.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={currentData.needs}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {currentData.needs.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                     contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              {currentData.needs.map((item: any, index: number) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm text-muted-foreground">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Analytics Section */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Survey Completion Trends */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Survey Completion Trends</CardTitle>
            <CardDescription>
              Monthly survey submissions over the past 6 months.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { month: "Aug", surveys: 45 },
                  { month: "Sep", surveys: 62 },
                  { month: "Oct", surveys: 78 },
                  { month: "Nov", surveys: 91 },
                  { month: "Dec", surveys: 103 },
                  { month: "Jan", surveys: totalHouseholds || 120 }
                ]}>
                  <XAxis 
                    dataKey="month" 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <Tooltip 
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="surveys" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <div className="text-muted-foreground">Total Surveys</div>
              <div className="font-bold text-lg">{totalHouseholds}</div>
            </div>
          </CardContent>
        </Card>

        {/* Program Enrollment Growth */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>Program Enrollment Growth</CardTitle>
            <CardDescription>
              4Ps beneficiary enrollment over time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { month: "Aug", beneficiaries: Math.round((fourPsBeneficiaries || 5) * 0.6) },
                  { month: "Sep", beneficiaries: Math.round((fourPsBeneficiaries || 5) * 0.7) },
                  { month: "Oct", beneficiaries: Math.round((fourPsBeneficiaries || 5) * 0.8) },
                  { month: "Nov", beneficiaries: Math.round((fourPsBeneficiaries || 5) * 0.85) },
                  { month: "Dec", beneficiaries: Math.round((fourPsBeneficiaries || 5) * 0.92) },
                  { month: "Jan", beneficiaries: fourPsBeneficiaries || 5 }
                ]}>
                  <XAxis 
                    dataKey="month" 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <Tooltip 
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="beneficiaries" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <div className="text-muted-foreground">Current Beneficiaries</div>
              <div className="font-bold text-lg">{fourPsBeneficiaries}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Map Section */}
      <Card className="border-border/50 shadow-sm overflow-hidden">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <MapIcon className="h-5 w-5 text-primary" />
                Geographic Distribution
              </CardTitle>
              <CardDescription>Real-time survey locations across Parañaque City.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Popover open={openSearch} onOpenChange={setOpenSearch}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openSearch}
                    className="w-[250px] justify-between"
                  >
                    {searchQuery || "Search barangay..."}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[250px] p-0">
                  <Command>
                    <CommandInput placeholder="Search location..." />
                    <CommandList>
                      <CommandEmpty>No location found.</CommandEmpty>
                      <CommandGroup>
                        {Object.keys(locationData).map((location) => (
                          <CommandItem
                            key={location}
                            value={location}
                            onSelect={(currentValue) => {
                              handleLocationSelect(currentValue);
                            }}
                          >
                            {location}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              
              <Layers className="h-4 w-4 text-muted-foreground ml-2" />
              <Select value={mapLayer} onValueChange={(v: any) => setMapLayer(v)}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Select Layer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default View</SelectItem>
                  <SelectItem value="poverty">Poverty Incidence</SelectItem>
                  <SelectItem value="beneficiaries">4Ps Beneficiaries</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 h-[400px] relative">
          <MapView 
            className="w-full h-full"
            onMapReady={(map) => {
              mapRef.current = map;
              // Center on Parañaque City
              const center = { lat: 14.4793, lng: 121.0198 };
              map.setCenter(center);
              map.setZoom(12);
              
              // Initial render will be handled by useEffect
              setMapLayer("default"); 
            }}
          />
          
          {/* Map Legend Overlay */}
          {mapLayer !== "default" && (
            <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur p-3 rounded-lg border border-border shadow-lg text-xs space-y-2">
              <div className="font-medium mb-1">
                {mapLayer === "poverty" ? "Poverty Incidence" : "Beneficiary Count"}
              </div>
              {mapLayer === "poverty" ? (
                <>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500"></div> High</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500"></div> Medium</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500"></div> Low</div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-600"></div> &gt; 2,000</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div> 1,000 - 2,000</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-300"></div> &lt; 1,000</div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
