import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Save, 
  Download, 
  Trash2, 
  Plus, 
  Filter, 
  Eye,
  FileText,
  Edit,
  Search,
  X
} from "lucide-react";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { exportToCSV, exportToPDF } from "@/lib/exportUtils";
import { DraftComments } from "@/components/DraftComments";

// Available fields for selection - includes all household and survey response fields
const availableFields = [
  // Basic Household Information
  { id: "headOfFamily", label: "Head of Family", category: "Basic Info" },
  { id: "age", label: "Age", category: "Basic Info" },
  { id: "civilStatus", label: "Civil Status", category: "Basic Info" },
  { id: "occupation", label: "Occupation", category: "Basic Info" },
  { id: "education", label: "Education", category: "Basic Info" },
  { id: "monthlyIncome", label: "Monthly Income", category: "Basic Info" },
  
  // Location
  { id: "barangay", label: "Barangay", category: "Location" },
  { id: "municipality", label: "Municipality", category: "Location" },
  { id: "province", label: "Province", category: "Location" },
  { id: "latitude", label: "GPS Latitude", category: "Location" },
  { id: "longitude", label: "GPS Longitude", category: "Location" },
  
  // Program Membership
  { id: "fourPsBeneficiary", label: "4Ps Beneficiary", category: "Programs" },
  { id: "tupadBeneficiary", label: "TUPAD Beneficiary", category: "Programs" },
  { id: "seniorCitizen", label: "Senior Citizen", category: "Programs" },
  { id: "pwdMember", label: "PWD Member", category: "Programs" },
  { id: "indigenousPeople", label: "Indigenous People", category: "Programs" },
  
  // Survey Metadata
  { id: "status", label: "Survey Status", category: "Metadata" },
  { id: "surveyedAt", label: "Survey Date", category: "Metadata" },
  { id: "reviewedAt", label: "Review Date", category: "Metadata" },
  { id: "returnReason", label: "Return Reason", category: "Metadata" },
  
  // Section A: Household Identification
  { id: "sectionA.householdNumber", label: "Household Number", category: "Section A: Identification" },
  { id: "sectionA.dateOfInterview", label: "Date of Interview", category: "Section A: Identification" },
  { id: "sectionA.enumeratorName", label: "Enumerator Name", category: "Section A: Identification" },
  { id: "sectionA.supervisorName", label: "Supervisor Name", category: "Section A: Identification" },
  
  // Section B: Household Roster
  { id: "sectionB.memberCount", label: "Number of Household Members", category: "Section B: Household Roster" },
  
  // Section C: Housing Characteristics
  { id: "sectionC.houseType", label: "House Type", category: "Section C: Housing" },
  { id: "sectionC.roofMaterial", label: "Roof Material", category: "Section C: Housing" },
  { id: "sectionC.wallMaterial", label: "Wall Material", category: "Section C: Housing" },
  { id: "sectionC.waterSource", label: "Water Source", category: "Section C: Housing" },
  { id: "sectionC.toiletFacility", label: "Toilet Facility", category: "Section C: Housing" },
  { id: "sectionC.electricitySource", label: "Electricity Source", category: "Section C: Housing" },
  
  // Section D: Income and Livelihood
  { id: "sectionD.primaryIncomeSource", label: "Primary Income Source", category: "Section D: Income & Livelihood" },
  { id: "sectionD.monthlyIncome", label: "Monthly Income (Survey)", category: "Section D: Income & Livelihood" },
  { id: "sectionD.secondaryIncome", label: "Secondary Income Source", category: "Section D: Income & Livelihood" },
  { id: "sectionD.hasLivelihoodProgram", label: "Has Livelihood Program", category: "Section D: Income & Livelihood" },
  
  // Section E: Health and Nutrition
  { id: "sectionE.hasHealthInsurance", label: "Has Health Insurance", category: "Section E: Health" },
  { id: "sectionE.healthInsuranceType", label: "Health Insurance Type", category: "Section E: Health" },
  { id: "sectionE.hasChronicIllness", label: "Has Chronic Illness", category: "Section E: Health" },
  { id: "sectionE.chronicIllnessDetails", label: "Chronic Illness Details", category: "Section E: Health" },
  
  // Section F: Education
  { id: "sectionF.childrenInSchool", label: "Children in School", category: "Section F: Education" },
  { id: "sectionF.childrenOutOfSchool", label: "Children Out of School", category: "Section F: Education" },
  { id: "sectionF.reasonsForNotAttending", label: "Reasons for Not Attending School", category: "Section F: Education" },
  
  // Section G: Social Protection
  { id: "sectionG.fourPsBeneficiary", label: "4Ps Beneficiary (Survey)", category: "Section G: Social Protection" },
  { id: "sectionG.tupadBeneficiary", label: "TUPAD Beneficiary (Survey)", category: "Section G: Social Protection" },
  { id: "sectionG.otherPrograms", label: "Other Programs", category: "Section G: Social Protection" },
  
  // Section H: Disaster Preparedness
  { id: "sectionH.hasEmergencyKit", label: "Has Emergency Kit", category: "Section H: Disaster Preparedness" },
  { id: "sectionH.hasEvacuationPlan", label: "Has Evacuation Plan", category: "Section H: Disaster Preparedness" },
  { id: "sectionH.disasterExperience", label: "Disaster Experience", category: "Section H: Disaster Preparedness" },
  
  // Section I: Agricultural Activities
  { id: "sectionI.hasAgriculturalLand", label: "Has Agricultural Land", category: "Section I: Agriculture" },
  { id: "sectionI.landArea", label: "Land Area (hectares)", category: "Section I: Agriculture" },
  { id: "sectionI.cropsPlanted", label: "Crops Planted", category: "Section I: Agriculture" },
  { id: "sectionI.hasLivestock", label: "Has Livestock", category: "Section I: Agriculture" },
  
  // Section J: Access to Services
  { id: "sectionJ.distanceToHealthCenter", label: "Distance to Health Center (km)", category: "Section J: Access to Services" },
  { id: "sectionJ.distanceToSchool", label: "Distance to School (km)", category: "Section J: Access to Services" },
  { id: "sectionJ.distanceToMarket", label: "Distance to Market (km)", category: "Section J: Access to Services" },
  { id: "sectionJ.transportationMode", label: "Transportation Mode", category: "Section J: Access to Services" },
  
  // Section K: Household Needs and Priorities
  { id: "sectionK.primaryNeeds", label: "Primary Needs", category: "Section K: Needs & Priorities" },
  { id: "sectionK.priorityPrograms", label: "Priority Programs", category: "Section K: Needs & Priorities" },
  { id: "sectionK.additionalComments", label: "Additional Comments", category: "Section K: Needs & Priorities" },
];

const fieldCategories = Array.from(new Set(availableFields.map(f => f.category)));

interface FilterConfig {
  barangay?: string[];
  municipality?: string[];
  status?: string[];
  dateFrom?: string;
  dateTo?: string;
  minIncome?: number;
  maxIncome?: number;
  minAge?: number;
  maxAge?: number;
  fourPsBeneficiary?: boolean;
  tupadBeneficiary?: boolean;
  seniorCitizen?: boolean;
  pwdMember?: boolean;
  indigenousPeople?: boolean;
}

// Layout titles mapping
const layoutTitles: Record<string, string> = {
  executive: 'Executive Summary Report',
  detailed: 'Detailed Data Report',
  field: 'Field Report'
};

export default function CustomReportBuilder() {
  const [selectedFields, setSelectedFields] = useState<string[]>([
    "headOfFamily",
    "barangay",
    "age",
    "monthlyIncome",
    "status",
  ]);
  const [filters, setFilters] = useState<FilterConfig>({});
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [exportLayout, setExportLayout] = useState<'executive' | 'detailed' | 'field' | number>('detailed');
  const [showLayoutDialog, setShowLayoutDialog] = useState(false);
  const [layoutName, setLayoutName] = useState("");
  const [layoutDescription, setLayoutDescription] = useState("");
  const [layoutPreferences, setLayoutPreferences] = useState({
    includeCharts: false,
    includeMetrics: true,
    includeNarrative: false,
    fontSize: 'medium' as 'small' | 'medium' | 'large',
    orientation: 'portrait' as 'portrait' | 'landscape',
    pageSize: 'A4' as 'A4' | 'Letter' | 'Legal',
    includeTimestamp: true,
    includePageNumbers: true,
  });
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showSaveDraftDialog, setShowSaveDraftDialog] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [savedDraftUrl, setSavedDraftUrl] = useState<string | null>(null);
  const [savedDraftId, setSavedDraftId] = useState<number | null>(null);

  // Load recent searches from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('reportBuilderRecentSearches');
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse recent searches:', e);
      }
    }
  }, []);

  // Load draft from URL parameter
  const [draftToken, setDraftToken] = useState<string | null>(null);
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('draft');
    if (token) {
      setDraftToken(token);
    }
  }, []);
  
  const { data: loadedDraft } = trpc.reportDrafts.getByToken.useQuery(
    { token: draftToken! },
    { enabled: !!draftToken }
  );
  
  useEffect(() => {
    if (loadedDraft && draftToken) {
      setSelectedFields(loadedDraft.selectedFields);
      setFilters(loadedDraft.filters as any || {});
      if (loadedDraft.exportLayout === 'custom' && loadedDraft.customLayoutId) {
        setExportLayout(loadedDraft.customLayoutId);
      } else {
        setExportLayout(loadedDraft.exportLayout as 'executive' | 'detailed' | 'field');
      }
      toast.success(`Loaded draft: ${loadedDraft.name}`);
      // Remove draft parameter from URL
      window.history.replaceState({}, '', window.location.pathname);
      setDraftToken(null);
    }
  }, [loadedDraft, draftToken]);

  // Save a search query to recent searches
  const saveToRecentSearches = (query: string) => {
    if (!query.trim()) return;
    
    setRecentSearches(prev => {
      // Remove duplicates and add to front
      const filtered = prev.filter(q => q.toLowerCase() !== query.toLowerCase());
      const updated = [query, ...filtered].slice(0, 5); // Keep only last 5
      
      // Persist to localStorage
      localStorage.setItem('reportBuilderRecentSearches', JSON.stringify(updated));
      
      return updated;
    });
  };

  // Remove a specific search from recent searches
  const removeFromRecentSearches = (query: string) => {
    setRecentSearches(prev => {
      const updated = prev.filter(q => q !== query);
      localStorage.setItem('reportBuilderRecentSearches', JSON.stringify(updated));
      return updated;
    });
  };

  // Handle search query change with debounced save
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setShowSuggestions(value.trim().length > 0);
    setSelectedSuggestionIndex(-1);
  };

  // Get field suggestions based on search query
  const getFieldSuggestions = () => {
    if (!searchQuery.trim()) return [];
    return availableFields
      .filter(field => 
        field.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        field.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .slice(0, 8); // Show max 8 suggestions
  };

  const fieldSuggestions = getFieldSuggestions();

  // Handle keyboard navigation in suggestions
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || fieldSuggestions.length === 0) {
      if (e.key === 'Enter' && searchQuery.trim()) {
        saveToRecentSearches(searchQuery);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < fieldSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          const selectedField = fieldSuggestions[selectedSuggestionIndex];
          selectFieldFromSuggestion(selectedField);
        } else if (searchQuery.trim()) {
          saveToRecentSearches(searchQuery);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  };

  // Select a field from suggestion dropdown
  const selectFieldFromSuggestion = (field: typeof availableFields[0]) => {
    // Toggle field selection
    setSelectedFields(prev => 
      prev.includes(field.id)
        ? prev.filter(id => id !== field.id)
        : [...prev, field.id]
    );
    // Save search to history
    saveToRecentSearches(searchQuery);
    // Clear search
    setSearchQuery("");
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
  };

  // Fetch saved templates
  const { data: templates = [], refetch: refetchTemplates } = trpc.reportTemplates.list.useQuery();
  
  // Fetch custom export layouts
  const { data: customLayouts = [], refetch: refetchLayouts } = trpc.exportLayouts.list.useQuery();
  
  // Fetch filtered data for preview
  const { data: filteredData = [], isLoading: isLoadingData } = trpc.reportTemplates.getFilteredData.useQuery(filters);
  
  // Fetch all households for filter options
  const { data: allHouseholds = [] } = trpc.households.list.useQuery();

  // Mutations
  const createTemplate = trpc.reportTemplates.create.useMutation({
    onSuccess: () => {
      toast.success("Template saved successfully");
      refetchTemplates();
      setShowSaveDialog(false);
      setTemplateName("");
      setTemplateDescription("");
    },
  });

  const updateTemplate = trpc.reportTemplates.update.useMutation({
    onSuccess: () => {
      toast.success("Template updated successfully");
      refetchTemplates();
      setEditingTemplate(null);
    },
  });

  const deleteTemplate = trpc.reportTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template deleted successfully");
      refetchTemplates();
    },
  });

  // Custom layout mutations
  const createLayout = trpc.exportLayouts.create.useMutation({
    onSuccess: () => {
      toast.success("Custom layout saved successfully");
      refetchLayouts();
      setShowLayoutDialog(false);
      setLayoutName("");
      setLayoutDescription("");
    },
  });

  const deleteLayout = trpc.exportLayouts.delete.useMutation({
    onSuccess: () => {
      toast.success("Layout deleted successfully");
      refetchLayouts();
      // Reset to default layout if deleted layout was selected
      if (typeof exportLayout === 'number') {
        setExportLayout('detailed');
      }
    },
  });

  // Report draft mutations
  const createDraft = trpc.reportDrafts.create.useMutation({
    onSuccess: (data) => {
      const shareUrl = `${window.location.origin}/reports?draft=${data.shareToken}`;
      setSavedDraftUrl(shareUrl);
      setSavedDraftId(data.id);
      toast.success("Draft saved successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to save draft: ${error.message}`);
    },
  });

  // Get unique values for filters
  const uniqueBarangays = Array.from(new Set(allHouseholds.map(h => h.barangay))).sort();
  const uniqueMunicipalities = Array.from(new Set(allHouseholds.map(h => h.municipality))).sort();

  // Filter fields based on search query
  const filteredFields = searchQuery.trim()
    ? availableFields.filter(field => 
        field.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        field.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : availableFields;

  // Get categories that have matching fields
  const filteredCategories = Array.from(new Set(filteredFields.map(f => f.category)));

  const toggleField = (fieldId: string) => {
    setSelectedFields(prev =>
      prev.includes(fieldId)
        ? prev.filter(f => f !== fieldId)
        : [...prev, fieldId]
    );
  };

  const toggleAllInCategory = (category: string) => {
    const categoryFields = availableFields.filter(f => f.category === category).map(f => f.id);
    const allSelected = categoryFields.every(f => selectedFields.includes(f));
    
    if (allSelected) {
      setSelectedFields(prev => prev.filter(f => !categoryFields.includes(f)));
    } else {
      setSelectedFields(prev => Array.from(new Set([...prev, ...categoryFields])));
    }
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }

    if (editingTemplate) {
      updateTemplate.mutate({
        id: editingTemplate,
        name: templateName,
        description: templateDescription,
        selectedFields,
        filters,
      });
    } else {
      createTemplate.mutate({
        name: templateName,
        description: templateDescription,
        selectedFields,
        filters,
      });
    }
  };

  const handleLoadTemplate = (template: any) => {
    setSelectedFields(template.selectedFields);
    setFilters(template.filters || {});
    setShowTemplateDialog(false);
    toast.success(`Loaded template: ${template.name}`);
  };

  const handleDeleteTemplate = (id: number) => {
    if (confirm("Are you sure you want to delete this template?")) {
      deleteTemplate.mutate({ id });
    }
  };

  const handleSaveDraft = () => {
    if (selectedFields.length === 0) {
      toast.error("Please select at least one field to save draft");
      return;
    }
    
    if (!draftName.trim()) {
      toast.error("Please enter a draft name");
      return;
    }
    
    createDraft.mutate({
      name: draftName,
      description: draftDescription || undefined,
      selectedFields,
      filters,
      exportLayout: typeof exportLayout === 'number' ? 'custom' : exportLayout,
      customLayoutId: typeof exportLayout === 'number' ? exportLayout : undefined,
    });
  };

  const handleExport = (format: "pdf" | "csv") => {
    if (selectedFields.length === 0) {
      toast.error("Please select at least one field");
      return;
    }

    const headers = selectedFields.map(fieldId => {
      const field = availableFields.find(f => f.id === fieldId);
      return field?.label || fieldId;
    });

    const rows = filteredData.map(household => {
      return selectedFields.map(fieldId => {
        const value = (household as any)[fieldId];
        if (value === null || value === undefined) return "";
        if (typeof value === "boolean") return value ? "Yes" : "No";
        if (value instanceof Date) return value.toLocaleDateString();
        return String(value);
      });
    });

    // Layout-specific title and filename
    const layoutKey = typeof exportLayout === 'number' ? 'custom' : exportLayout;
    const reportTitle = `${layoutTitles[layoutKey] || 'Custom Report'} - ${new Date().toLocaleDateString()}`;
    const filename = `${layoutKey}-report`;

    if (format === "pdf") {
      // Add layout description to PDF
      const layoutDescriptions: Record<string, string> = {
        executive: 'Key metrics and visual insights for leadership presentations',
        detailed: 'Complete tabular data with all selected fields for analysis',
        field: 'Narrative format with observations for field documentation'
      };
      
      exportToPDF(
        `${reportTitle}\n${layoutDescriptions[layoutKey] || 'Custom layout configuration'}`,
        headers,
        rows,
        filename
      );
      toast.success(`${layoutTitles[layoutKey] || 'Custom Report'} exported as PDF`);
    } else {
      const csvData = rows.map(row => {
        const obj: Record<string, string> = {};
        headers.forEach((header, idx) => {
          obj[header] = row[idx] || "";
        });
        return obj;
      });
      exportToCSV(csvData, filename);
      toast.success(`${layoutTitles[layoutKey] || 'Custom Report'} exported as CSV`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold">Custom Report Builder</h3>
          <p className="text-muted-foreground">
            Select fields and apply filters to create your custom report
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowTemplateDialog(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Load Template ({templates.length})
          </Button>
          <Button variant="outline" onClick={() => setShowSaveDialog(true)}>
            <Save className="h-4 w-4 mr-2" />
            Save Template
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Field Selection */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Select Fields
            </CardTitle>
            <CardDescription>
              Choose which data fields to include in your report
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search Box */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                <Input
                  placeholder="Search fields by name or category..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  onFocus={() => searchQuery.trim() && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  className="pl-9 pr-9"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Clear field search"
                    title="Clear search"
                    onClick={() => {
                      if (searchQuery.trim()) {
                        saveToRecentSearches(searchQuery);
                      }
                      setSearchQuery("");
                      setShowSuggestions(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}

                {/* Suggestions Dropdown */}
                {showSuggestions && fieldSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
                    {fieldSuggestions.map((field, index) => {
                      const isSelected = selectedFields.includes(field.id);
                      const isHighlighted = index === selectedSuggestionIndex;
                      
                      return (
                        <button
                          type="button"
                          key={field.id}
                          onClick={() => selectFieldFromSuggestion(field)}
                          className={`w-full px-3 py-2 text-left hover:bg-accent flex items-center justify-between gap-2 ${
                            isHighlighted ? 'bg-accent' : ''
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{field.label}</div>
                            <div className="text-xs text-muted-foreground truncate">{field.category}</div>
                          </div>
                          {isSelected && (
                            <Badge variant="secondary" className="text-xs shrink-0">Selected</Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent Searches */}
              {!searchQuery && recentSearches.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((query, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="cursor-pointer hover:bg-secondary/80 pr-1 group"
                    >
                      <span
                        onClick={() => {
                          setSearchQuery(query);
                          saveToRecentSearches(query);
                        }}
                        className="pr-1"
                      >
                        {query}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove recent search ${query}`}
                        title={`Remove ${query} from recent searches`}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromRecentSearches(query);
                        }}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="text-sm text-muted-foreground">
              {selectedFields.length} field{selectedFields.length !== 1 ? "s" : ""} selected
              {searchQuery && (
                <span className="ml-2">
                  · {filteredFields.length} matching field{filteredFields.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {filteredCategories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="font-medium">No fields found</p>
                <p className="text-sm">Try a different search term</p>
              </div>
            ) : (
              filteredCategories.map(category => {
                const categoryFields = filteredFields.filter(f => f.category === category);
              const allSelected = categoryFields.every(f => selectedFields.includes(f.id));
              const someSelected = categoryFields.some(f => selectedFields.includes(f.id));

              return (
                <div key={category} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">{category}</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleAllInCategory(category)}
                      className="h-6 text-xs"
                    >
                      {allSelected ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                  <div className="space-y-2 pl-2">
                    {categoryFields.map(field => (
                      <div key={field.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={field.id}
                          checked={selectedFields.includes(field.id)}
                          onCheckedChange={() => toggleField(field.id)}
                        />
                        <label
                          htmlFor={field.id}
                          className="text-sm cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {field.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              );
              })
            )}
          </CardContent>
        </Card>

        {/* Middle Column: Filters */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Apply Filters
            </CardTitle>
            <CardDescription>
              Filter data based on specific criteria
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Location Filters */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Location</Label>
              <div className="space-y-2">
                <div>
                  <Label htmlFor="barangay-filter" className="text-xs text-muted-foreground">
                    Barangay
                  </Label>
                  <Select
                    value={filters.barangay?.[0] || "all"}
                    onValueChange={(value) =>
                      setFilters(prev => ({
                        ...prev,
                        barangay: value === "all" ? undefined : [value],
                      }))
                    }
                  >
                    <SelectTrigger id="barangay-filter">
                      <SelectValue placeholder="All Barangays" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Barangays</SelectItem>
                      {uniqueBarangays.map(b => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Status Filter */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Survey Status</Label>
              <Select
                value={filters.status?.[0] || "all"}
                onValueChange={(value) =>
                  setFilters(prev => ({
                    ...prev,
                    status: value === "all" ? undefined : [value],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
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

            {/* Income Range */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Monthly Income Range</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="min-income" className="text-xs text-muted-foreground">
                    Min
                  </Label>
                  <Input
                    id="min-income"
                    type="number"
                    placeholder="0"
                    value={filters.minIncome || ""}
                    onChange={(e) =>
                      setFilters(prev => ({
                        ...prev,
                        minIncome: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="max-income" className="text-xs text-muted-foreground">
                    Max
                  </Label>
                  <Input
                    id="max-income"
                    type="number"
                    placeholder="100000"
                    value={filters.maxIncome || ""}
                    onChange={(e) =>
                      setFilters(prev => ({
                        ...prev,
                        maxIncome: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            {/* Age Range */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Age Range</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="min-age" className="text-xs text-muted-foreground">
                    Min
                  </Label>
                  <Input
                    id="min-age"
                    type="number"
                    placeholder="0"
                    value={filters.minAge || ""}
                    onChange={(e) =>
                      setFilters(prev => ({
                        ...prev,
                        minAge: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="max-age" className="text-xs text-muted-foreground">
                    Max
                  </Label>
                  <Input
                    id="max-age"
                    type="number"
                    placeholder="100"
                    value={filters.maxAge || ""}
                    onChange={(e) =>
                      setFilters(prev => ({
                        ...prev,
                        maxAge: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            {/* Program Filters */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Program Enrollment</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="fourps-filter"
                    checked={filters.fourPsBeneficiary === true}
                    onCheckedChange={(checked) =>
                      setFilters(prev => ({
                        ...prev,
                        fourPsBeneficiary: checked ? true : undefined,
                      }))
                    }
                  />
                  <label htmlFor="fourps-filter" className="text-sm cursor-pointer">
                    4Ps Beneficiaries Only
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="tupad-filter"
                    checked={filters.tupadBeneficiary === true}
                    onCheckedChange={(checked) =>
                      setFilters(prev => ({
                        ...prev,
                        tupadBeneficiary: checked ? true : undefined,
                      }))
                    }
                  />
                  <label htmlFor="tupad-filter" className="text-sm cursor-pointer">
                    TUPAD Beneficiaries Only
                  </label>
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => setFilters({})}
            >
              Clear All Filters
            </Button>
          </CardContent>
        </Card>

        {/* Right Column: Preview & Export */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Preview & Export
            </CardTitle>
            <CardDescription>
              View filtered results and export your report
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Matching Records:</span>
                <Badge variant="secondary" className="text-lg">
                  {isLoadingData ? "..." : filteredData.length}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Selected Fields:</span>
                <Badge variant="secondary" className="text-lg">
                  {selectedFields.length}
                </Badge>
              </div>
            </div>

            {/* Preview Table */}
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      {selectedFields.slice(0, 3).map(fieldId => {
                        const field = availableFields.find(f => f.id === fieldId);
                        return (
                          <th key={fieldId} className="p-2 text-left font-medium">
                            {field?.label}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="border-t">
                        {selectedFields.slice(0, 3).map(fieldId => (
                          <td key={fieldId} className="p-2">
                            {String((row as any)[fieldId] || "-")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredData.length > 5 && (
                <div className="p-2 text-xs text-center text-muted-foreground bg-muted/50">
                  Showing 5 of {filteredData.length} records
                </div>
              )}
            </div>

            {/* Export Layout Selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Export Layout</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLayoutDialog(true)}
                  className="h-7 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Create Custom
                </Button>
              </div>
              <div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportLayout('executive')}
                    className={`p-3 border rounded-lg text-left transition-all ${
                      exportLayout === 'executive'
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="font-medium text-sm">Executive</div>
                    <div className="text-xs text-muted-foreground mt-1">Charts & metrics</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportLayout('detailed')}
                    className={`p-3 border rounded-lg text-left transition-all ${
                      exportLayout === 'detailed'
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="font-medium text-sm">Detailed</div>
                    <div className="text-xs text-muted-foreground mt-1">Complete table</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportLayout('field')}
                    className={`p-3 border rounded-lg text-left transition-all ${
                      exportLayout === 'field'
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="font-medium text-sm">Field</div>
                    <div className="text-xs text-muted-foreground mt-1">Narrative format</div>
                  </button>
                </div>
                
                {/* Custom Layouts */}
                {customLayouts.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Custom Layouts</div>
                    <div className="grid grid-cols-2 gap-2">
                      {customLayouts.map((layout) => (
                        <div
                          key={layout.id}
                          className={`group relative p-3 border rounded-lg text-left transition-all cursor-pointer ${
                            exportLayout === layout.id
                              ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                              : 'border-border hover:border-primary/50'
                          }`}
                          onClick={() => setExportLayout(layout.id)}
                        >
                          <div className="font-medium text-sm pr-6">{layout.name}</div>
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {layout.description || 'Custom layout'}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete layout "${layout.name}"?`)) {
                                deleteLayout.mutate({ id: layout.id });
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Export Buttons */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowPreviewModal(true)}
                disabled={selectedFields.length === 0 || filteredData.length === 0}
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview Report
              </Button>
              <Button
                className="w-full"
                onClick={() => handleExport("pdf")}
                disabled={selectedFields.length === 0 || filteredData.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export as PDF
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleExport("csv")}
                disabled={selectedFields.length === 0 || filteredData.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export as CSV
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save Template Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Report Template</DialogTitle>
            <DialogDescription>
              Save your current field selection and filters as a reusable template
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name *</Label>
              <Input
                id="template-name"
                placeholder="e.g., 4Ps Beneficiaries Report"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                placeholder="Optional description of what this template is for..."
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={createTemplate.isPending}>
              <Save className="h-4 w-4 mr-2" />
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Load Report Template</DialogTitle>
            <DialogDescription>
              Choose a saved template to load its field selection and filters
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-auto">
            {templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No saved templates yet</p>
                <p className="text-sm">Create your first template to get started</p>
              </div>
            ) : (
              templates.map((template) => (
                <Card key={template.id} className="cursor-pointer hover:bg-accent/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1" onClick={() => handleLoadTemplate(template)}>
                        <h4 className="font-semibold">{template.name}</h4>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {template.description}
                          </p>
                        )}
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {template.selectedFields.length} fields
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {new Date(template.createdAt).toLocaleDateString()}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTemplate(template.id);
                            setTemplateName(template.name);
                            setTemplateDescription(template.description || "");
                            setSelectedFields(template.selectedFields);
                            setFilters(template.filters || {});
                            setShowTemplateDialog(false);
                            setShowSaveDialog(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTemplate(template.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Custom Layout Creation Dialog */}
      <Dialog open={showLayoutDialog} onOpenChange={setShowLayoutDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Custom Export Layout</DialogTitle>
            <DialogDescription>
              Define your custom layout preferences for report exports
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="layout-name">Layout Name</Label>
              <Input
                id="layout-name"
                value={layoutName}
                onChange={(e) => setLayoutName(e.target.value)}
                placeholder="e.g., Monthly Executive Summary"
              />
            </div>
            <div>
              <Label htmlFor="layout-description">Description (Optional)</Label>
              <Textarea
                id="layout-description"
                value={layoutDescription}
                onChange={(e) => setLayoutDescription(e.target.value)}
                placeholder="Describe the purpose of this layout..."
                rows={2}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="font-size">Font Size</Label>
                <Select
                  value={layoutPreferences.fontSize}
                  onValueChange={(value: 'small' | 'medium' | 'large') =>
                    setLayoutPreferences(prev => ({ ...prev, fontSize: value }))
                  }
                >
                  <SelectTrigger id="font-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="orientation">Orientation</Label>
                <Select
                  value={layoutPreferences.orientation}
                  onValueChange={(value: 'portrait' | 'landscape') =>
                    setLayoutPreferences(prev => ({ ...prev, orientation: value }))
                  }
                >
                  <SelectTrigger id="orientation">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Portrait</SelectItem>
                    <SelectItem value="landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="page-size">Page Size</Label>
                <Select
                  value={layoutPreferences.pageSize}
                  onValueChange={(value: 'A4' | 'Letter' | 'Legal') =>
                    setLayoutPreferences(prev => ({ ...prev, pageSize: value }))
                  }
                >
                  <SelectTrigger id="page-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4</SelectItem>
                    <SelectItem value="Letter">Letter</SelectItem>
                    <SelectItem value="Legal">Legal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Layout Features</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-charts"
                    checked={layoutPreferences.includeCharts}
                    onCheckedChange={(checked) =>
                      setLayoutPreferences(prev => ({ ...prev, includeCharts: checked as boolean }))
                    }
                  />
                  <label htmlFor="include-charts" className="text-sm cursor-pointer">
                    Include Charts
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-metrics"
                    checked={layoutPreferences.includeMetrics}
                    onCheckedChange={(checked) =>
                      setLayoutPreferences(prev => ({ ...prev, includeMetrics: checked as boolean }))
                    }
                  />
                  <label htmlFor="include-metrics" className="text-sm cursor-pointer">
                    Include Metrics
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-narrative"
                    checked={layoutPreferences.includeNarrative}
                    onCheckedChange={(checked) =>
                      setLayoutPreferences(prev => ({ ...prev, includeNarrative: checked as boolean }))
                    }
                  />
                  <label htmlFor="include-narrative" className="text-sm cursor-pointer">
                    Include Narrative
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-timestamp"
                    checked={layoutPreferences.includeTimestamp}
                    onCheckedChange={(checked) =>
                      setLayoutPreferences(prev => ({ ...prev, includeTimestamp: checked as boolean }))
                    }
                  />
                  <label htmlFor="include-timestamp" className="text-sm cursor-pointer">
                    Include Timestamp
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-page-numbers"
                    checked={layoutPreferences.includePageNumbers}
                    onCheckedChange={(checked) =>
                      setLayoutPreferences(prev => ({ ...prev, includePageNumbers: checked as boolean }))
                    }
                  />
                  <label htmlFor="include-page-numbers" className="text-sm cursor-pointer">
                    Include Page Numbers
                  </label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLayoutDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!layoutName.trim()) {
                  toast.error("Please enter a layout name");
                  return;
                }
                createLayout.mutate({
                  name: layoutName,
                  description: layoutDescription,
                  layoutType: 'custom',
                  preferences: layoutPreferences,
                });
              }}
              disabled={!layoutName.trim()}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Layout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report Preview</DialogTitle>
            <DialogDescription>
              Preview of your custom report with the selected layout and filters
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Preview Header */}
            <div className="border-b pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Custom Report</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
                <Badge variant="outline" className="text-sm">
                  {typeof exportLayout === 'number' 
                    ? customLayouts.find(l => l.id === exportLayout)?.name || 'Custom'
                    : layoutTitles[exportLayout]}
                </Badge>
              </div>
            </div>

            {/* Preview Metrics (for Executive and Custom with includeMetrics) */}
            {(exportLayout === 'executive' || 
              (typeof exportLayout === 'number' && 
               customLayouts.find(l => l.id === exportLayout)?.preferences?.includeMetrics)) && (
              <div className="grid grid-cols-4 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Total Records</div>
                  <div className="text-2xl font-bold mt-1">{filteredData.length}</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Selected Fields</div>
                  <div className="text-2xl font-bold mt-1">{selectedFields.length}</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Active Filters</div>
                  <div className="text-2xl font-bold mt-1">
                    {Object.values(filters).filter(v => v !== undefined && v !== null).length}
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Avg Income</div>
                  <div className="text-2xl font-bold mt-1">
                    ₱{Math.round(filteredData.reduce((sum, h) => sum + (Number(h.monthlyIncome) || 0), 0) / filteredData.length || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            )}

            {/* Preview Data Table */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted px-4 py-2 font-semibold text-sm">
                Data Preview (First 10 records)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {selectedFields.slice(0, 8).map(fieldId => {
                        const field = availableFields.find(f => f.id === fieldId);
                        return (
                          <th key={fieldId} className="px-4 py-2 text-left font-medium">
                            {field?.label}
                          </th>
                        );
                      })}
                      {selectedFields.length > 8 && (
                        <th className="px-4 py-2 text-left font-medium">
                          +{selectedFields.length - 8} more
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.slice(0, 10).map((household, idx) => (
                      <tr key={household.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                        {selectedFields.slice(0, 8).map(fieldId => {
                          const value = household[fieldId as keyof typeof household];
                          return (
                            <td key={fieldId} className="px-4 py-2">
                              {value !== null && value !== undefined ? String(value) : '-'}
                            </td>
                          );
                        })}
                        {selectedFields.length > 8 && (
                          <td className="px-4 py-2 text-muted-foreground">...</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredData.length > 10 && (
                <div className="bg-muted/50 px-4 py-2 text-xs text-muted-foreground text-center">
                  Showing 10 of {filteredData.length} records. Full data will be included in export.
                </div>
              )}
            </div>

            {/* Preview Narrative (for Field layout) */}
            {exportLayout === 'field' && (
              <div className="space-y-4">
                <h3 className="font-semibold">Field Report Summary</h3>
                <div className="prose prose-sm max-w-none">
                  <p>
                    This report contains {filteredData.length} household records collected from the 
                    Parañaque Family Development Program. The data includes {selectedFields.length} fields 
                    covering household demographics, economic status, and program enrollment information.
                  </p>
                  {filteredData.length > 0 && (
                    <p>
                      Key findings: The average monthly household income is ₱
                      {Math.round(filteredData.reduce((sum, h) => sum + (Number(h.monthlyIncome) || 0), 0) / filteredData.length || 0).toLocaleString()}.
                      {filters.fourPsBeneficiary && ' All records are 4Ps beneficiaries.'}
                      {filters.tupadBeneficiary && ' All records are TUPAD beneficiaries.'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Layout Preferences Info */}
            {typeof exportLayout === 'number' && (
              <div className="bg-muted/30 p-4 rounded-lg">
                <div className="text-sm font-medium mb-2">Layout Preferences</div>
                <div className="grid grid-cols-3 gap-4 text-xs">
                  {(() => {
                    const layout = customLayouts.find(l => l.id === exportLayout);
                    if (!layout?.preferences) return null;
                    return (
                      <>
                        <div>
                          <span className="text-muted-foreground">Font Size:</span>{' '}
                          <span className="font-medium">{layout.preferences.fontSize}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Orientation:</span>{' '}
                          <span className="font-medium">{layout.preferences.orientation}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Page Size:</span>{' '}
                          <span className="font-medium">{layout.preferences.pageSize}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPreviewModal(false)}>
              Close Preview
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowPreviewModal(false);
                setShowSaveDraftDialog(true);
              }}
            >
              <Save className="h-4 w-4 mr-2" />
              Save as Draft
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                handleExport('csv');
                setShowPreviewModal(false);
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Export as CSV
            </Button>
            <Button
              onClick={() => {
                handleExport('pdf');
                setShowPreviewModal(false);
              }}
            >
              <Download className="h-4 w-4 mr-2" />
              Export as PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Draft Dialog */}
      <Dialog open={showSaveDraftDialog} onOpenChange={setShowSaveDraftDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Report Draft</DialogTitle>
            <DialogDescription>
              Save your current report configuration to share with others or resume later.
            </DialogDescription>
          </DialogHeader>
          
          {!savedDraftUrl ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="draft-name">Draft Name *</Label>
                <Input
                  id="draft-name"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="e.g., Q1 2026 Income Analysis"
                />
              </div>
              
              <div>
                <Label htmlFor="draft-description">Description (Optional)</Label>
                <Textarea
                  id="draft-description"
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  placeholder="Add notes about this report configuration..."
                  rows={3}
                />
              </div>
              
              <div className="bg-muted/30 p-4 rounded-lg space-y-2">
                <div className="text-sm font-medium">Configuration Summary</div>
                <div className="text-xs space-y-1">
                  <div><span className="text-muted-foreground">Selected Fields:</span> {selectedFields.length}</div>
                  <div><span className="text-muted-foreground">Active Filters:</span> {Object.values(filters).filter(v => v !== undefined && v !== null).length}</div>
                  <div><span className="text-muted-foreground">Layout:</span> {typeof exportLayout === 'number' ? customLayouts.find(l => l.id === exportLayout)?.name || 'Custom' : layoutTitles[exportLayout]}</div>
                  <div><span className="text-muted-foreground">Records:</span> {filteredData.length}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-green-900 dark:text-green-100">Draft Saved Successfully!</div>
                  <div className="text-sm text-green-700 dark:text-green-300 mt-1">Share this link with others to collaborate</div>
                </div>
              </div>
              
              <div>
                <Label>Shareable Link</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={savedDraftUrl}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(savedDraftUrl);
                      toast.success("Link copied to clipboard");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground">
                Anyone with this link can view and load this report configuration.
              </div>
              
              {/* Comments Section */}
              {savedDraftId && (
                <div className="mt-6 border-t pt-4">
                  <DraftComments draftId={savedDraftId} />
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            {!savedDraftUrl ? (
              <>
                <Button variant="outline" onClick={() => setShowSaveDraftDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveDraft} disabled={createDraft.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  {createDraft.isPending ? "Saving..." : "Save Draft"}
                </Button>
              </>
            ) : (
              <Button onClick={() => {
                setShowSaveDraftDialog(false);
                setSavedDraftUrl(null);
                setSavedDraftId(null);
                setDraftName("");
                setDraftDescription("");
              }}>
                Done
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
