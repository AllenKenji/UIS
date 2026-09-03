import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ArrowRight, Save, CheckCircle2, Plus, Trash2, Camera, Upload, MapPin, WifiOff } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
// Shared with Settings.tsx, where a surveyor picks their own Province → City
// → Barangay once — Section A below just auto-fills from that saved choice.
import { getProvinceForMunicipality } from "@/lib/bisLocations";

const steps = [
  { id: 1, title: "A. Identification", description: "Household Location & Interview Details" },
  { id: 2, title: "B. HH Head Profile", description: "Head of the Family Information" },
  { id: 3, title: "C. HH Composition", description: "List of all Household Members" },
  { id: 4, title: "D. Housing", description: "Housing Characteristics & Living Conditions" },
  { id: 5, title: "E. Health", description: "Health Insurance & Nutrition Status" },
  { id: 6, title: "F. Education", description: "School Attendance & Digital Access" },
  { id: 7, title: "G. Livelihood", description: "Income, Food Sources & Savings" },
  { id: 8, title: "H. Social/Safety", description: "Social Protection & Disaster Preparedness" },
  { id: 9, title: "I. Agriculture", description: "Agricultural Land & Livelihood Activities" },
  { id: 10, title: "K. Feedback", description: "Aspirations & Needs" },
  { id: 11, title: "Verification", description: "Photo Evidence" },
  { id: 12, title: "Review", description: "Verify and Submit" },
];


// ── Form State Types ──────────────────────────────────────────────────────────
interface SectionAData {
  householdNumber: string;
  dateOfInterview: string;
  municipality: string;
  barangay: string;
  enumeratorName: string;
  houseNumber: string;
  street: string;
  purok: string;
  zipCode: string;
  respondentContactNumber: string;
  respondentEmail: string;
}

interface MemberRow {
  id: number;
  name: string;
  relationship: string;
  age: string;
  sex: string;
  civilStatus: string;
  education: string;
  occupation: string;
  registeredVoter: boolean;  // Is this member a registered voter? (18+ only)
}

interface SectionBData {
  headName: string;
  headBirthDate: string;
  headSex: string;
  headAge: string;
  headCivilStatus: string;
  headEthnicity: string;
  headReligion: string;
  headEducation: string;
  headOccupation: string;
  headMonthlyIncome: string;
  fourPsBeneficiary: boolean;
  pwdMember: boolean;
  seniorCitizen: boolean;
  soloParent: boolean;
  indigenousPeople: boolean;
}

interface SectionCData {
  houseType: string;
  tenureStatus: string;       // CBMS: Informal Settlers
  roofMaterial: string;
  wallMaterial: string;
  numberOfRooms: string;
  waterSource: string;        // CBMS: Without Safe Water Source
  toiletFacility: string;     // CBMS: Without Sanitary Toilet
  electricitySource: string;  // CBMS: With Electricity
  cookingFuel: string;
}

interface SectionEData {
  hasHealthInsurance: string;   // "yes" | "no" | "" — CBMS: Without Health Insurance
  healthInsuranceType: string;  // PhilHealth, private, HMO, none
  hasPhilHealth: boolean;       // CBMS: With PhilHealth Coverage
  philHealthType: string;
  hasChronicIllness: boolean;
  chronicIllnessDetails: string;
  hasDisabledMember: boolean;
  disabilityDetails: string;
  hasPregnantMember: boolean;
  pregnantMemberAge: string;
  childrenNutritionStatus: string;
  childrenImmunized: boolean;
  // CBMS Health Mortality & Nutrition Indicators
  childDeaths: string;              // number of children under 5 who died in past 12 months
  childDeathDetails: string;
  maternalDeaths: string;           // number of women who died from pregnancy-related causes in past 12 months
  maternalDeathDetails: string;
  malnourishedChildren: string;     // number of children 0-5 who are malnourished
  malnourishedChildrenDetails: string;
}

interface SectionFData {
  childrenInSchool: string;       // 6-11 in elementary
  childrenOutOfSchool: string;    // CBMS: children 6-11 not attending
  youthInSchool: string;          // 12-15 in high school
  youthOutOfSchool: string;       // CBMS: youth 12-15 not attending (primary indicator)
  reasonsForNotAttending: string;
  hasInternetAccess: boolean;
  digitalDevices: string[];
  informationSources: string[];
}

interface SectionGData {
  incomeSources: string[];
  monthlyIncome: string;          // CBMS: Below Poverty Threshold
  magsakabataanRecipient: boolean;
  hasSavings: boolean;
  hasLoanAccess: boolean;
  experiencedFoodShortage: boolean;
}

interface SectionHData {
  disasterExperience: string;
  hasEvacuationPlan: boolean;     // CBMS: With Evacuation Plan
  evacuationCenterAccessible: boolean;
  hasEmergencyKit: boolean;
  memberOfCommunityOrg: boolean;
  // CBMS Peace & Order
  victimOfCrime: boolean;         // CBMS: Households with crime victims
  crimeTypes: string[];           // types of crime experienced
  maleVictims: string;            // number of male victims
  femaleVictims: string;          // number of female victims
  crimeReported: boolean;         // was the crime reported to authorities?
  reportedTo: string;             // barangay, police, DSWD, etc.
  crimeDetails: string;           // additional details
}

interface SectionIData {
  hasAgriculturalLand: boolean;   // CBMS: With Agricultural Land
  landArea: string;
  cropsPlanted: string;
  hasLivestock: boolean;
  livestockDetails: string;
  hasBackyardGarden: boolean;
  gardenDetails: string;
}

interface SectionKData {
  primaryNeed1: string;
  primaryNeed2: string;
  primaryNeed3: string;
  expectations: string;
  includedInPlanning: boolean;
}

type SubmitFieldErrorKey =
  | "municipality"
  | "barangay"
  | "houseNumber"
  | "street"
  | "purok"
  | "respondentContactNumber"
  | "respondentEmail"
  | "headBirthDate";

export default function SurveyForm() {
  const [currentStep, setCurrentStep] = useState(1);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const createHousehold = trpc.households.create.useMutation();
  const createSurvey = trpc.surveys.create.useMutation();
  const uploadPhoto = trpc.upload.photo.useMutation();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // ── Head of Family registered voter ─────────────────────────────────────
  const [headRegisteredVoter, setHeadRegisteredVoter] = useState<boolean>(false);

  // ── Section States ────────────────────────────────────────────────────────
  const [sectionA, setSectionA] = useState<SectionAData>({
    householdNumber: "HH-2025-005",
    dateOfInterview: new Date().toISOString().split("T")[0],
    municipality: "",
    barangay: "",
    enumeratorName: "",
    houseNumber: "",
    street: "",
    purok: "",
    zipCode: "",
    respondentContactNumber: "",
    respondentEmail: "",
  });

  const [sectionB, setSectionB] = useState<SectionBData>({
    headName: "",
    headBirthDate: "",
    headSex: "male",
    headAge: "",
    headCivilStatus: "",
    headEthnicity: "",
    headReligion: "",
    headEducation: "",
    headOccupation: "",
    headMonthlyIncome: "",
    fourPsBeneficiary: false,
    pwdMember: false,
    seniorCitizen: false,
    soloParent: false,
    indigenousPeople: false,
  });

  const [members, setMembers] = useState<MemberRow[]>([
    { id: 1, name: "", relationship: "spouse", age: "", sex: "female", civilStatus: "", education: "", occupation: "", registeredVoter: false }
  ]);

  const [sectionC, setSectionC] = useState<SectionCData>({
    houseType: "",
    tenureStatus: "",
    roofMaterial: "",
    wallMaterial: "",
    numberOfRooms: "",
    waterSource: "",
    toiletFacility: "",
    electricitySource: "",
    cookingFuel: "",
  });

  const [sectionE, setSectionE] = useState<SectionEData>({
    hasHealthInsurance: "",
    healthInsuranceType: "",
    hasPhilHealth: false,
    philHealthType: "",
    hasChronicIllness: false,
    chronicIllnessDetails: "",
    hasDisabledMember: false,
    disabilityDetails: "",
    hasPregnantMember: false,
    pregnantMemberAge: "",
    childrenNutritionStatus: "normal",
    childrenImmunized: false,
    childDeaths: "0",
    childDeathDetails: "",
    maternalDeaths: "0",
    maternalDeathDetails: "",
    malnourishedChildren: "0",
    malnourishedChildrenDetails: "",
  });

  const [sectionF, setSectionF] = useState<SectionFData>({
    childrenInSchool: "",
    childrenOutOfSchool: "",
    youthInSchool: "",
    youthOutOfSchool: "",
    reasonsForNotAttending: "",
    hasInternetAccess: false,
    digitalDevices: [],
    informationSources: [],
  });

  const [sectionG, setSectionG] = useState<SectionGData>({
    incomeSources: [],
    monthlyIncome: "",
    magsakabataanRecipient: false,
    hasSavings: false,
    hasLoanAccess: false,
    experiencedFoodShortage: false,
  });

  const [sectionH, setSectionH] = useState<SectionHData>({
    disasterExperience: "none",
    hasEvacuationPlan: false,
    evacuationCenterAccessible: false,
    hasEmergencyKit: false,
    memberOfCommunityOrg: false,
    victimOfCrime: false,
    crimeTypes: [],
    maleVictims: "0",
    femaleVictims: "0",
    crimeReported: false,
    reportedTo: "",
    crimeDetails: "",
  });

  const [sectionI, setSectionI] = useState<SectionIData>({
    hasAgriculturalLand: false,
    landArea: "",
    cropsPlanted: "",
    hasLivestock: false,
    livestockDetails: "",
    hasBackyardGarden: false,
    gardenDetails: "",
  });

  const [sectionK, setSectionK] = useState<SectionKData>({
    primaryNeed1: "",
    primaryNeed2: "",
    primaryNeed3: "",
    expectations: "",
    includedInPlanning: false,
  });

  const [dwellingPhoto, setDwellingPhoto] = useState<string | null>(null);
  const [idPhoto, setIdPhoto] = useState<string | null>(null);
  const [dwellingLocation, setDwellingLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [idLocation, setIdLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [submitErrors, setSubmitErrors] = useState<Partial<Record<SubmitFieldErrorKey, string>>>({});

  const calculateAgeFromBirthDate = (birthDate: string): string => {
    if (!birthDate) return "";

    const dob = new Date(birthDate);
    if (Number.isNaN(dob.getTime())) return "";

    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    const hasBirthdayPassedThisYear =
      monthDiff > 0 || (monthDiff === 0 && today.getDate() >= dob.getDate());

    if (!hasBirthdayPassedThisYear) age -= 1;
    return age >= 0 ? String(age) : "";
  };

  const isSeniorCitizenFromAge = (age: string): boolean => {
    const parsedAge = parseInt(age, 10);
    return !Number.isNaN(parsedAge) && parsedAge >= 60;
  };

  const getErrorMessage = (error: unknown): string => {
    const fallback = "Failed to submit survey. Please try again.";
    if (!error || typeof error !== "object") return fallback;

    const maybeError = error as {
      message?: string;
      data?: { code?: string; zodError?: { fieldErrors?: Record<string, string[]> } };
      shape?: { message?: string };
    };

    const trpcCode = maybeError.data?.code;
    if (trpcCode === "UNAUTHORIZED") {
      return "Session expired. Please sign in again and resubmit.";
    }

    const loweredMessage = (maybeError.message || maybeError.shape?.message || "").toLowerCase();
    if (
      loweredMessage.includes("database not available") ||
      loweredMessage.includes("econnrefused") ||
      loweredMessage.includes("connect etimedout") ||
      loweredMessage.includes("cannot enqueue")
    ) {
      return "Database is currently unavailable. Your draft is saved locally; please try submitting again later.";
    }

    const fieldErrors = maybeError.data?.zodError?.fieldErrors;
    if (fieldErrors) {
      const firstFieldError = Object.values(fieldErrors).flat().find(Boolean);
      if (firstFieldError) return firstFieldError;
    }

    return maybeError.message || maybeError.shape?.message || fallback;
  };

  // ── Offline & Draft ───────────────────────────────────────────────────────
  useEffect(() => {
    const savedDraft = localStorage.getItem("survey_draft_fdp_2025");
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed.step) setCurrentStep(parsed.step);
        if (parsed.sectionA) setSectionA((prev) => ({ ...prev, ...parsed.sectionA }));
        if (parsed.sectionB) setSectionB(parsed.sectionB);
        if (parsed.members) setMembers(parsed.members);
        if (parsed.sectionC) setSectionC(parsed.sectionC);
        if (parsed.sectionE) setSectionE(parsed.sectionE);
        if (parsed.sectionF) setSectionF(parsed.sectionF);
        if (parsed.sectionG) setSectionG(parsed.sectionG);
        if (parsed.sectionH) setSectionH(parsed.sectionH);
        if (parsed.sectionI) setSectionI(parsed.sectionI);
        if (parsed.sectionK) setSectionK(parsed.sectionK);
        if (parsed.dwellingPhoto) setDwellingPhoto(parsed.dwellingPhoto);
        if (parsed.idPhoto) setIdPhoto(parsed.idPhoto);
        if (parsed.dwellingLocation) setDwellingLocation(parsed.dwellingLocation);
        if (parsed.idLocation) setIdLocation(parsed.idLocation);
        toast.info("Restored draft from local storage");
      } catch (e) {
        console.error("Failed to parse draft", e);
      }
    }
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Auto-fill City/Municipality and Barangay from the surveyor's own
  // assigned location (set once in Settings) — always wins over a
  // restored draft's copy, since a surveyor only ever works within one
  // barangay and this should reflect their current assignment.
  useEffect(() => {
    if (!user?.municipality || !user?.barangay) return;
    setSectionA((prev) => ({
      ...prev,
      municipality: user.municipality ?? "",
      barangay: user.barangay ?? "",
    }));
  }, [user?.municipality, user?.barangay]);

  useEffect(() => {
    const draft = {
      step: currentStep, sectionA, sectionB, members, sectionC, sectionE,
      sectionF, sectionG, sectionH, sectionI, sectionK,
      dwellingPhoto, idPhoto, dwellingLocation, idLocation,
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem("survey_draft_fdp_2025", JSON.stringify(draft));
  }, [currentStep, sectionA, sectionB, members, sectionC, sectionE, sectionF, sectionG, sectionH, sectionI, sectionK, dwellingPhoto, idPhoto, dwellingLocation, idLocation]);

  useEffect(() => {
    const loggedInName = user?.name?.trim();
    if (!loggedInName) return;

    setSectionA((prev) => {
      if ((prev.enumeratorName ?? "").trim()) return prev;
      return { ...prev, enumeratorName: loggedInName };
    });
  }, [user?.name]);

  useEffect(() => {
    setSectionB((prev) => {
      const computedAge = calculateAgeFromBirthDate(prev.headBirthDate);
      return {
        ...prev,
        headAge: computedAge,
        seniorCitizen: isSeniorCitizenFromAge(computedAge),
      };
    });
  }, [sectionB.headBirthDate]);

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>, type: "dwelling" | "id") => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === "dwelling") setDwellingPhoto(reader.result as string);
        else setIdPhoto(reader.result as string);
        if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
              if (type === "dwelling") setDwellingLocation(loc);
              else setIdLocation(loc);
              toast.success("Location tagged successfully");
            },
            () => toast.error("Could not tag location. Please enable GPS.")
          );
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const addMember = () => {
    setMembers([...members, { id: members.length + 1, name: "", relationship: "child", age: "", sex: "male", civilStatus: "", education: "", occupation: "", registeredVoter: false }]);
  };

  const removeMember = (id: number) => {
    if (members.length > 1) setMembers(members.filter((m) => m.id !== id));
  };

  const updateMember = (id: number, field: keyof MemberRow, value: string | boolean) => {
    setMembers(members.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const toggleArrayItem = (arr: string[], item: string): string[] =>
    arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];

  // City/Municipality and Barangay are no longer picked here — they're
  // auto-filled from the surveyor's own assigned location (see the effect
  // above and Settings.tsx). Province is derived from the auto-filled city.
  const sectionAProvince = getProvinceForMunicipality(sectionA.municipality);

  const getBisProvisioningError = (): string | null => {
    const errors: Partial<Record<SubmitFieldErrorKey, string>> = {};

    const municipality = (sectionA.municipality ?? "").trim();
    const barangay = (sectionA.barangay ?? "").trim();
    const houseNumber = (sectionA.houseNumber ?? "").trim();
    const street = (sectionA.street ?? "").trim();
    const respondentContactNumber = (sectionA.respondentContactNumber ?? "").trim();
    const respondentEmail = (sectionA.respondentEmail ?? "").trim();
    const headBirthDate = sectionB.headBirthDate ?? "";

    if (!municipality) {
      errors.municipality = "Set your assigned City/Municipality in Settings before surveying.";
    }
    if (!barangay) {
      errors.barangay = "Set your assigned Barangay in Settings before surveying.";
    }
    if (!houseNumber) {
      errors.houseNumber = "House number is required for BIS account creation.";
    }
    if (!street) {
      errors.street = "Street is required for BIS account creation.";
    }
    if (!/^09\d{9}$/.test(respondentContactNumber)) {
      errors.respondentContactNumber = "Respondent contact number must be a valid PH mobile number for BIS account creation.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(respondentEmail)) {
      errors.respondentEmail = "Respondent email is required for BIS account creation.";
    }
    if (!headBirthDate) {
      errors.headBirthDate = "Head of family birth date is required for BIS account creation.";
    }

    setSubmitErrors(errors);
    return Object.values(errors)[0] ?? null;
  };

  const handleNext = async () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
      window.scrollTo(0, 0);
    } else {
      if (isOffline) {
        toast.success("Survey saved locally! Will sync when online.");
        setTimeout(() => setLocation("/surveys"), 1500);
        return;
      }
      try {
        const bisProvisioningError = getBisProvisioningError();
        if (bisProvisioningError) {
          toast.error(bisProvisioningError);
          return;
        }

        setSubmitErrors({});

        toast.loading("Submitting survey...");
        let dwellingPhotoUrl = "";
        let idPhotoUrl = "";
        if (dwellingPhoto) {
          try {
            const base64Data = dwellingPhoto.split(",")[1];
            const photoResult = await uploadPhoto.mutateAsync({ fileData: base64Data, fileName: `dwelling-${Date.now()}.jpg`, mimeType: "image/jpeg" });
            dwellingPhotoUrl = photoResult.url;
          } catch (photoError) {
            console.warn("Dwelling photo upload failed, continuing without photo:", photoError);
            toast.warning("Dwelling photo upload failed. Survey will be submitted without it.");
          }
        }
        if (idPhoto) {
          try {
            const base64Data = idPhoto.split(",")[1];
            const photoResult = await uploadPhoto.mutateAsync({ fileData: base64Data, fileName: `id-${Date.now()}.jpg`, mimeType: "image/jpeg" });
            idPhotoUrl = photoResult.url;
          } catch (photoError) {
            console.warn("ID photo upload failed, continuing without photo:", photoError);
            toast.warning("ID photo upload failed. Survey will be submitted without it.");
          }
        }

        // Create household record with all CBMS-relevant fields
        const household = await createHousehold.mutateAsync({
          barangay: sectionA.barangay.trim(),
          municipality: sectionA.municipality.trim(),
          province: getProvinceForMunicipality(sectionA.municipality.trim()) || "Metro Manila",
          headOfFamily: sectionB.headName || "Unknown",
          age: parseInt(sectionB.headAge || "0"),
          civilStatus: sectionB.headCivilStatus,
          occupation: sectionB.headOccupation,
          education: sectionB.headEducation,
          monthlyIncome: parseFloat(sectionG.monthlyIncome || sectionB.headMonthlyIncome || "0"),
          latitude: dwellingLocation?.lat,
          longitude: dwellingLocation?.lng,
          fourPsBeneficiary: sectionB.fourPsBeneficiary,
          pwdMember: sectionB.pwdMember,
          seniorCitizen: sectionB.seniorCitizen,
          indigenousPeople: sectionB.indigenousPeople,
          verificationPhoto: dwellingPhotoUrl || idPhotoUrl,
        });

        // Create survey response with all sections mapped to CBMS indicators
        await createSurvey.mutateAsync({
          householdId: household.id,
          sectionA: {
            householdNumber: sectionA.householdNumber,
            dateOfInterview: sectionA.dateOfInterview,
            municipality: sectionA.municipality,
            barangay: sectionA.barangay,
            province: sectionAProvince,
            enumeratorName: sectionA.enumeratorName,
            houseNumber: sectionA.houseNumber,
            street: sectionA.street,
            purok: sectionA.purok,
            zipCode: sectionA.zipCode,
            respondentContactNumber: sectionA.respondentContactNumber,
            respondentEmail: sectionA.respondentEmail,
          },
          sectionB: {
            headBirthDate: sectionB.headBirthDate,
            members: [
              // Head of family as first member
              {
                name: sectionB.headName,
                relationship: "head",
                sex: sectionB.headSex,
                age: parseInt(sectionB.headAge || "0"),
                civilStatus: sectionB.headCivilStatus,
                education: sectionB.headEducation,
                occupation: sectionB.headOccupation,
                registeredVoter: headRegisteredVoter,
              },
              // Other household members
              ...members.map((m) => ({
                name: m.name,
                relationship: m.relationship,
                sex: m.sex,
                age: parseInt(m.age || "0"),
                civilStatus: m.civilStatus,
                education: m.education,
                occupation: m.occupation,
                registeredVoter: m.registeredVoter,
              })),
            ],
          },
          // Section C: Housing — maps to Water, Sanitation, Electricity, Shelter indicators
          sectionC: {
            houseType: sectionC.houseType,
            tenureStatus: sectionC.tenureStatus,       // → Informal Settlers indicator
            roofMaterial: sectionC.roofMaterial,
            wallMaterial: sectionC.wallMaterial,
            numberOfRooms: parseInt(sectionC.numberOfRooms || "0"),
            waterSource: sectionC.waterSource,          // → Without Safe Water Source indicator
            toiletFacility: sectionC.toiletFacility,    // → Without Sanitary Toilet indicator
            electricitySource: sectionC.electricitySource, // → With Electricity indicator
            cookingFuel: sectionC.cookingFuel,
          },
          // Section D: Income (backward compat)
          sectionD: {
            monthlyIncome: parseFloat(sectionG.monthlyIncome || "0"),
            experiencedFoodShortage: sectionG.experiencedFoodShortage,
          },
          // Section E: Health — maps to Health Insurance & PhilHealth indicators
          sectionE: {
            hasHealthInsurance: sectionE.hasHealthInsurance === "yes",  // → Without Health Insurance
            healthInsuranceType: sectionE.healthInsuranceType,
            hasPhilHealth: sectionE.hasPhilHealth,                       // → With PhilHealth Coverage
            philHealthType: sectionE.philHealthType,
            hasChronicIllness: sectionE.hasChronicIllness,
            chronicIllnessDetails: sectionE.chronicIllnessDetails,
            hasDisabledMember: sectionE.hasDisabledMember,
            disabilityDetails: sectionE.disabilityDetails,
            hasPregnantMember: sectionE.hasPregnantMember,
            pregnantMemberAge: sectionE.pregnantMemberAge,
            childrenNutritionStatus: sectionE.childrenNutritionStatus,
            childrenImmunized: sectionE.childrenImmunized,
            childDeaths: parseInt(sectionE.childDeaths || "0"),
            childDeathDetails: sectionE.childDeathDetails,
            maternalDeaths: parseInt(sectionE.maternalDeaths || "0"),
            maternalDeathDetails: sectionE.maternalDeathDetails,
            malnourishedChildren: parseInt(sectionE.malnourishedChildren || "0"),
            malnourishedChildrenDetails: sectionE.malnourishedChildrenDetails,
          },
          // Section F: Education — maps to Out-of-School Children indicator
          sectionF: {
            childrenInSchool: parseInt(sectionF.childrenInSchool || "0"),
            childrenOutOfSchool: parseInt(sectionF.childrenOutOfSchool || "0"),  // → Out-of-School (6-11)
            youthInSchool: parseInt(sectionF.youthInSchool || "0"),
            youthOutOfSchool: parseInt(sectionF.youthOutOfSchool || "0"),        // → Out-of-School (12-15, primary)
            reasonsForNotAttending: sectionF.reasonsForNotAttending,
            hasInternetAccess: sectionF.hasInternetAccess,
            digitalDevices: sectionF.digitalDevices,
            informationSources: sectionF.informationSources,
          },
          // Section G: Social Protection
          sectionG: {
            fourPsBeneficiary: sectionB.fourPsBeneficiary,
            tupadBeneficiary: false,
            magsakabataanRecipient: sectionG.magsakabataanRecipient,
            soloParent: sectionB.soloParent,
          },
          // Section H: Disaster Preparedness & Peace/Order
          sectionH: {
            hasEmergencyKit: sectionH.hasEmergencyKit,
            hasEvacuationPlan: sectionH.hasEvacuationPlan,               // → With Evacuation Plan
            evacuationCenterAccessible: sectionH.evacuationCenterAccessible,
            disasterExperience: sectionH.disasterExperience,
            memberOfCommunityOrg: sectionH.memberOfCommunityOrg,
            // CBMS Peace & Order
            victimOfCrime: sectionH.victimOfCrime,                       // → Households with crime victims
            crimeTypes: sectionH.crimeTypes,
            maleVictims: parseInt(sectionH.maleVictims || "0"),
            femaleVictims: parseInt(sectionH.femaleVictims || "0"),
            crimeReported: sectionH.crimeReported,
            reportedTo: sectionH.reportedTo,
            crimeDetails: sectionH.crimeDetails,
          },
          // Section I: Agriculture — maps to With Agricultural Land indicator
          sectionI: {
            hasAgriculturalLand: sectionI.hasAgriculturalLand,           // → With Agricultural Land
            landArea: parseFloat(sectionI.landArea || "0"),
            cropsPlanted: sectionI.cropsPlanted ? sectionI.cropsPlanted.split(",").map((s) => s.trim()) : [],
            hasLivestock: sectionI.hasLivestock,
            livestockDetails: sectionI.livestockDetails,
            hasBackyardGarden: sectionI.hasBackyardGarden,
            gardenDetails: sectionI.gardenDetails,
            hasSavings: sectionG.hasSavings,
            hasLoanAccess: sectionG.hasLoanAccess,
          },
          sectionK: {
            primaryNeeds: [sectionK.primaryNeed1, sectionK.primaryNeed2, sectionK.primaryNeed3].filter(Boolean),
            additionalComments: sectionK.expectations,
          },
        });

        toast.dismiss();
        toast.success("Survey submitted successfully!");
        localStorage.removeItem("survey_draft_fdp_2025");
        setTimeout(() => setLocation("/surveys"), 1500);
      } catch (error) {
        toast.dismiss();
        toast.error(getErrorMessage(error));
        const errorText = getErrorMessage(error).toLowerCase();
        if (errorText.includes("database is currently unavailable")) {
          toast.info("Survey data remains in local draft and can be resubmitted once the database is back online.");
        }
        console.error("Submit error:", error);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      window.scrollTo(0, 0);
    }
  };

  const goToStep = (stepId: number) => {
    setCurrentStep(stepId);
    window.scrollTo(0, 0);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12 px-2 sm:px-0">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="text-primary font-medium">New Survey</span>
            <span>/</span>
            <span>{sectionA.householdNumber}</span>
          </div>
          {isOffline && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
              <WifiOff className="h-3 w-3" />
              Offline Mode
            </div>
          )}
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Family Survey Questionnaire</h2>
        <p className="text-muted-foreground">Parañaque Family Development Program (FDP) — "No Family Left Behind"</p>
      </div>

      {/* Progress Steps */}
      <div className="relative hidden md:block">
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-secondary -z-10" />
        <div className="absolute top-1/2 left-0 w-full -z-10 flex gap-0.5">
          {steps.slice(1).map((step, index) => (
            <span
              key={`progress-${step.id}`}
              className={`h-0.5 flex-1 transition-colors duration-300 ${index < currentStep - 1 ? "bg-primary" : "bg-transparent"}`}
            />
          ))}
        </div>
        <div className="flex justify-between">
          {steps.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => goToStep(step.id)}
              className="flex flex-col items-center gap-2 bg-background px-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              aria-label={`Go to step ${step.id}: ${step.title}`}
              title={`Go to ${step.title}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 ${currentStep >= step.id ? "bg-primary border-primary text-primary-foreground" : "bg-background border-muted-foreground/30 text-muted-foreground"}`}>
                {currentStep > step.id ? <CheckCircle2 className="h-4 w-4" /> : step.id}
              </div>
              <span className={`text-[10px] font-medium text-center max-w-[70px] ${currentStep >= step.id ? "text-foreground" : "text-muted-foreground"}`}>{step.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="md:hidden sticky top-16 z-10 bg-background/95 backdrop-blur border-b py-3 px-1 flex items-center justify-between text-sm font-medium">
        <span>Step {currentStep} of {steps.length}</span>
        <span className="text-primary">{steps[currentStep - 1].title}</span>
      </div>

      {/* Form Content */}
      <Card className="border-border/50 shadow-md overflow-hidden">
        <div className="h-1 bg-primary w-full" />
        <CardHeader className="bg-secondary/10 border-b border-border/50">
          <CardTitle>{steps[currentStep - 1].title}</CardTitle>
          <CardDescription>{steps[currentStep - 1].description}</CardDescription>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-6">

          {/* ── Section A: Household Identification ─────────────────────────── */}
          {currentStep === 1 && (
            <div className="grid gap-6 md:grid-cols-2 animate-in fade-in slide-in-from-right-4 duration-300">
              {(!user?.municipality || !user?.barangay) && (
                <div className="md:col-span-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
                  <span>
                    City/Municipality and Barangay aren't set for your account yet, so they can't
                    auto-fill below. Set them once in Settings — every survey you submit will use it after that.
                  </span>
                  <Button type="button" size="sm" variant="outline" onClick={() => setLocation("/settings")}>
                    Go to Settings
                  </Button>
                </div>
              )}
              <div className="space-y-2">
                <Label>Household ID Number</Label>
                <Input value={sectionA.householdNumber} onChange={(e) => setSectionA({ ...sectionA, householdNumber: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Date of Interview</Label>
                <Input type="date" value={sectionA.dateOfInterview} onChange={(e) => setSectionA({ ...sectionA, dateOfInterview: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>City / Municipality</Label>
                <Input
                  className={submitErrors.municipality ? "border-red-500 focus-visible:ring-red-500" : ""}
                  value={sectionA.municipality || "Not set"}
                  readOnly
                  disabled
                  title="Set in Settings — auto-filled from your assigned location"
                />
                {submitErrors.municipality && <p className="text-xs text-red-600">{submitErrors.municipality}</p>}
              </div>
              <div className="space-y-2">
                <Label>Barangay</Label>
                <Input
                  className={submitErrors.barangay ? "border-red-500 focus-visible:ring-red-500" : ""}
                  value={sectionA.barangay || "Not set"}
                  readOnly
                  disabled
                  title="Set in Settings — auto-filled from your assigned location"
                />
                {submitErrors.barangay && <p className="text-xs text-red-600">{submitErrors.barangay}</p>}
              </div>
              <div className="space-y-2">
                <Label>Province</Label>
                <Input value={sectionAProvince || "Not set"} readOnly disabled />
              </div>
              <div className="space-y-2">
                <Label>Enumerator's Name</Label>
                <Input placeholder="Enter full name" value={sectionA.enumeratorName} onChange={(e) => setSectionA({ ...sectionA, enumeratorName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>House Number</Label>
                <Input className={submitErrors.houseNumber ? "border-red-500 focus-visible:ring-red-500" : ""} placeholder="e.g. 123" value={sectionA.houseNumber} onChange={(e) => setSectionA({ ...sectionA, houseNumber: e.target.value })} />
                {submitErrors.houseNumber && <p className="text-xs text-red-600">{submitErrors.houseNumber}</p>}
              </div>
              <div className="space-y-2">
                <Label>Street</Label>
                <Input className={submitErrors.street ? "border-red-500 focus-visible:ring-red-500" : ""} placeholder="e.g. Rizal Street" value={sectionA.street} onChange={(e) => setSectionA({ ...sectionA, street: e.target.value })} />
                {submitErrors.street && <p className="text-xs text-red-600">{submitErrors.street}</p>}
              </div>
              <div className="space-y-2">
                <Label>Purok / Sitio (Optional)</Label>
                <Input className={submitErrors.purok ? "border-red-500 focus-visible:ring-red-500" : ""} placeholder="Optional" value={sectionA.purok} onChange={(e) => setSectionA({ ...sectionA, purok: e.target.value })} />
                {submitErrors.purok && <p className="text-xs text-red-600">{submitErrors.purok}</p>}
              </div>
              <div className="space-y-2">
                <Label>ZIP Code</Label>
                <Input placeholder="Optional" value={sectionA.zipCode} onChange={(e) => setSectionA({ ...sectionA, zipCode: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Respondent Contact Number</Label>
                <Input className={submitErrors.respondentContactNumber ? "border-red-500 focus-visible:ring-red-500" : ""} placeholder="09XXXXXXXXX" value={sectionA.respondentContactNumber} onChange={(e) => setSectionA({ ...sectionA, respondentContactNumber: e.target.value })} />
                {submitErrors.respondentContactNumber && <p className="text-xs text-red-600">{submitErrors.respondentContactNumber}</p>}
              </div>
              <div className="space-y-2">
                <Label>Respondent Email</Label>
                <Input className={submitErrors.respondentEmail ? "border-red-500 focus-visible:ring-red-500" : ""} type="email" placeholder="name@example.com" value={sectionA.respondentEmail} onChange={(e) => setSectionA({ ...sectionA, respondentEmail: e.target.value })} />
                {submitErrors.respondentEmail && <p className="text-xs text-red-600">{submitErrors.respondentEmail}</p>}
              </div>
            </div>
          )}

          {/* ── Section B: Head of Family Profile ───────────────────────────── */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Name of Household Head</Label>
                  <Input placeholder="Last Name, First Name, Middle Name" value={sectionB.headName} onChange={(e) => setSectionB({ ...sectionB, headName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Birth Date</Label>
                  <Input
                    className={submitErrors.headBirthDate ? "border-red-500 focus-visible:ring-red-500" : ""}
                    type="date"
                    value={sectionB.headBirthDate}
                    onChange={(e) =>
                      setSectionB(() => {
                        const computedAge = calculateAgeFromBirthDate(e.target.value);
                        return {
                          ...sectionB,
                          headBirthDate: e.target.value,
                          headAge: computedAge,
                          seniorCitizen: isSeniorCitizenFromAge(computedAge),
                        };
                      })
                    }
                  />
                  {submitErrors.headBirthDate && <p className="text-xs text-red-600">{submitErrors.headBirthDate}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Sex</Label>
                  <RadioGroup value={sectionB.headSex} onValueChange={(v) => setSectionB({ ...sectionB, headSex: v })} className="flex gap-4">
                    <div className="flex items-center space-x-2"><RadioGroupItem value="male" id="male" /><Label htmlFor="male">Male</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="female" id="female" /><Label htmlFor="female">Female</Label></div>
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label>Age</Label>
                  <Input type="number" placeholder="Years" value={sectionB.headAge} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>Civil Status</Label>
                  <Select value={sectionB.headCivilStatus} onValueChange={(v) => setSectionB({ ...sectionB, headCivilStatus: v })}>
                    <SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Single">Single</SelectItem>
                      <SelectItem value="Married">Married</SelectItem>
                      <SelectItem value="Widowed">Widowed</SelectItem>
                      <SelectItem value="Separated">Separated</SelectItem>
                      <SelectItem value="Cohabiting">Cohabiting</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Ethnicity</Label>
                  <Input placeholder="e.g. Ibanag, Ilocano, Itawit" value={sectionB.headEthnicity} onChange={(e) => setSectionB({ ...sectionB, headEthnicity: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Highest Education Attained</Label>
                  <Select value={sectionB.headEducation} onValueChange={(v) => setSectionB({ ...sectionB, headEducation: v })}>
                    <SelectTrigger><SelectValue placeholder="Select Level" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="No formal education">No formal education</SelectItem>
                      <SelectItem value="Elementary">Elementary</SelectItem>
                      <SelectItem value="High School">High School</SelectItem>
                      <SelectItem value="Senior High School">Senior High School</SelectItem>
                      <SelectItem value="College">College</SelectItem>
                      <SelectItem value="Vocational">Vocational / Technical</SelectItem>
                      <SelectItem value="Post-graduate">Post-graduate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Occupation / Source of Income</Label>
                  <Input placeholder="e.g. Farmer, Driver, Vendor" value={sectionB.headOccupation} onChange={(e) => setSectionB({ ...sectionB, headOccupation: e.target.value })} />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Household Membership & Programs</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { id: "fourPs", label: "4Ps (Pantawid Pamilyang Pilipino Program) Beneficiary", field: "fourPsBeneficiary" as keyof SectionBData },
                    { id: "pwd", label: "PWD Member (Person with Disability)", field: "pwdMember" as keyof SectionBData },
                    { id: "senior", label: "Senior Citizen (60 years old and above)", field: "seniorCitizen" as keyof SectionBData },
                    { id: "solo", label: "Solo Parent", field: "soloParent" as keyof SectionBData },
                    { id: "ip", label: "Indigenous People (IP) / Lumad", field: "indigenousPeople" as keyof SectionBData },
                  ].map((item) => (
                    <div key={item.id} className="flex items-center space-x-2 border p-3 rounded-md hover:bg-secondary/20 transition-colors">
                      <Checkbox
                        id={item.id}
                        checked={sectionB[item.field] as boolean}
                        disabled={item.field === "seniorCitizen" && !isSeniorCitizenFromAge(sectionB.headAge)}
                        onCheckedChange={(checked) => setSectionB({ ...sectionB, [item.field]: !!checked })}
                      />
                      <Label
                        htmlFor={item.id}
                        className={`flex-1 text-sm ${item.field === "seniorCitizen" && !isSeniorCitizenFromAge(sectionB.headAge) ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer"}`}
                      >
                        {item.label}
                      </Label>
                    </div>
                  ))}
                </div>
                {/* Registered Voter for Head of Family */}
                <div className="flex items-center space-x-2 border p-3 rounded-md hover:bg-secondary/20 transition-colors bg-blue-50/50 border-blue-200">
                  <Checkbox
                    id="headVoter"
                    checked={headRegisteredVoter}
                    onCheckedChange={(checked) => setHeadRegisteredVoter(!!checked)}
                  />
                  <div className="flex-1">
                    <Label htmlFor="headVoter" className="cursor-pointer text-sm font-medium">Registered Voter</Label>
                    <p className="text-xs text-muted-foreground">Is the household head a registered voter? (18 years old and above)</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Section C: Household Composition (Member Roster) ─────────────── */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Label className="text-base">Household Members List (excluding Head)</Label>
                <Button size="sm" onClick={addMember} variant="outline"><Plus className="h-4 w-4 mr-2" /> Add Member</Button>
              </div>
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[160px]">Full Name</TableHead>
                      <TableHead className="min-w-[110px]">Relation</TableHead>
                      <TableHead className="w-[100px]">Age</TableHead>
                      <TableHead className="w-[90px]">Sex</TableHead>
                      <TableHead className="min-w-[120px]">Education</TableHead>
                      <TableHead className="w-[100px] text-center">Registered Voter?</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <Input placeholder="Name" className="h-8" value={member.name} onChange={(e) => updateMember(member.id, "name", e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Select value={member.relationship} onValueChange={(v) => updateMember(member.id, "relationship", v)}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="spouse">Spouse</SelectItem>
                              <SelectItem value="child">Child</SelectItem>
                              <SelectItem value="parent">Parent</SelectItem>
                              <SelectItem value="sibling">Sibling</SelectItem>
                              <SelectItem value="grandchild">Grandchild</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input type="number" placeholder="Age" className="h-8 w-full" value={member.age} onChange={(e) => updateMember(member.id, "age", e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Select value={member.sex} onValueChange={(v) => updateMember(member.id, "sex", v)}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select value={member.education} onValueChange={(v) => updateMember(member.id, "education", v)}>
                            <SelectTrigger className="h-8"><SelectValue placeholder="Level" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="None">None</SelectItem>
                              <SelectItem value="Elementary">Elementary</SelectItem>
                              <SelectItem value="High School">High School</SelectItem>
                              <SelectItem value="College">College</SelectItem>
                              <SelectItem value="Vocational">Vocational</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center">
                          {parseInt(member.age || "0") >= 18 ? (
                            <Checkbox
                              checked={member.registeredVoter}
                              onCheckedChange={(checked) => updateMember(member.id, "registeredVoter", !!checked)}
                              title="Is this member a registered voter?"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeMember(member.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">* List ALL household members including children and elderly. The household head is recorded in Section B.</p>
            </div>
          )}

          {/* ── Section D: Housing Characteristics ──────────────────────────── */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠️ <strong>CBMS Indicators:</strong> Tenure Status → Informal Settlers | Water Source → Without Safe Water | Toilet Facility → Without Sanitary Toilet | Electricity Source → With Electricity
              </p>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="font-semibold">Type of Dwelling / House</Label>
                  <Select value={sectionC.houseType} onValueChange={(v) => setSectionC({ ...sectionC, houseType: v })}>
                    <SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Concrete">Concrete / Strong materials</SelectItem>
                      <SelectItem value="Semi-concrete">Semi-concrete / Mixed</SelectItem>
                      <SelectItem value="Light materials">Light materials (wood/bamboo)</SelectItem>
                      <SelectItem value="Makeshift">Makeshift / Salvaged</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="font-semibold">Tenure / Ownership Status <span className="text-red-500 text-xs">(CBMS: Informal Settlers)</span></Label>
                  <Select value={sectionC.tenureStatus} onValueChange={(v) => setSectionC({ ...sectionC, tenureStatus: v })}>
                    <SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Owned">Owned (with title/certificate)</SelectItem>
                      <SelectItem value="Owned (no title)">Owned (no title/certificate)</SelectItem>
                      <SelectItem value="Rented">Rented</SelectItem>
                      <SelectItem value="Informal settler">Informal Settler / Squatter</SelectItem>
                      <SelectItem value="Shared">Shared / Living with relatives</SelectItem>
                      <SelectItem value="Rent-free">Rent-free (not owned)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="font-semibold">Roof Material</Label>
                  <Select value={sectionC.roofMaterial} onValueChange={(v) => setSectionC({ ...sectionC, roofMaterial: v })}>
                    <SelectTrigger><SelectValue placeholder="Select Material" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Galvanized iron/aluminum">Galvanized iron / Aluminum</SelectItem>
                      <SelectItem value="Concrete/clay tile">Concrete / Clay tile</SelectItem>
                      <SelectItem value="Wood/bamboo">Wood / Bamboo</SelectItem>
                      <SelectItem value="Cogon/nipa/anahaw">Cogon / Nipa / Anahaw</SelectItem>
                      <SelectItem value="Others">Others</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="font-semibold">Wall Material</Label>
                  <Select value={sectionC.wallMaterial} onValueChange={(v) => setSectionC({ ...sectionC, wallMaterial: v })}>
                    <SelectTrigger><SelectValue placeholder="Select Material" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Concrete/brick/stone">Concrete / Brick / Stone</SelectItem>
                      <SelectItem value="Wood">Wood</SelectItem>
                      <SelectItem value="Bamboo/sawali">Bamboo / Sawali</SelectItem>
                      <SelectItem value="Galvanized iron">Galvanized iron</SelectItem>
                      <SelectItem value="Makeshift/salvaged">Makeshift / Salvaged</SelectItem>
                      <SelectItem value="Others">Others</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="font-semibold">Number of Rooms</Label>
                  <Input type="number" placeholder="0" value={sectionC.numberOfRooms} onChange={(e) => setSectionC({ ...sectionC, numberOfRooms: e.target.value })} />
                </div>

                <div className="space-y-2">
                  <Label className="font-semibold">Source of Drinking Water <span className="text-red-500 text-xs">(CBMS: Safe Water)</span></Label>
                  <Select value={sectionC.waterSource} onValueChange={(v) => setSectionC({ ...sectionC, waterSource: v })}>
                    <SelectTrigger><SelectValue placeholder="Select Source" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Piped water (Level III)">Piped water — Level III (metered)</SelectItem>
                      <SelectItem value="Piped water (Level II)">Piped water — Level II (communal faucet)</SelectItem>
                      <SelectItem value="Deep well (protected)">Deep well — Protected</SelectItem>
                      <SelectItem value="Open well">Open well — Unprotected</SelectItem>
                      <SelectItem value="Spring (protected)">Spring — Protected</SelectItem>
                      <SelectItem value="Spring (unprotected)">Spring — Unprotected</SelectItem>
                      <SelectItem value="River/stream">River / Stream</SelectItem>
                      <SelectItem value="Rain water">Rain water</SelectItem>
                      <SelectItem value="Bottled/purified water">Bottled / Purified water</SelectItem>
                      <SelectItem value="Others">Others</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="font-semibold">Toilet Facility <span className="text-red-500 text-xs">(CBMS: Sanitary Toilet)</span></Label>
                  <Select value={sectionC.toiletFacility} onValueChange={(v) => setSectionC({ ...sectionC, toiletFacility: v })}>
                    <SelectTrigger><SelectValue placeholder="Select Facility" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Flush/water-sealed (to septic tank)">Flush / Water-sealed — Septic tank</SelectItem>
                      <SelectItem value="Flush/water-sealed (to sewage)">Flush / Water-sealed — Sewage system</SelectItem>
                      <SelectItem value="Closed pit">Closed pit latrine (with cover)</SelectItem>
                      <SelectItem value="Open pit">Open pit latrine (without cover)</SelectItem>
                      <SelectItem value="Hanging toilet">Hanging toilet</SelectItem>
                      <SelectItem value="None">None / Open defecation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="font-semibold">Source of Electricity / Lighting <span className="text-red-500 text-xs">(CBMS: Electricity)</span></Label>
                  <Select value={sectionC.electricitySource} onValueChange={(v) => setSectionC({ ...sectionC, electricitySource: v })}>
                    <SelectTrigger><SelectValue placeholder="Select Source" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Metered electricity (CAGELCO/CEPALCO)">Metered electricity (CAGELCO / CEPALCO)</SelectItem>
                      <SelectItem value="Solar energy">Solar energy</SelectItem>
                      <SelectItem value="Generator">Generator</SelectItem>
                      <SelectItem value="Kerosene/lamp">Kerosene / Lamp</SelectItem>
                      <SelectItem value="None">None / No electricity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="font-semibold">Cooking Fuel</Label>
                  <Select value={sectionC.cookingFuel} onValueChange={(v) => setSectionC({ ...sectionC, cookingFuel: v })}>
                    <SelectTrigger><SelectValue placeholder="Select Fuel" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LPG">LPG (liquefied petroleum gas)</SelectItem>
                      <SelectItem value="Charcoal">Charcoal</SelectItem>
                      <SelectItem value="Firewood">Firewood</SelectItem>
                      <SelectItem value="Electricity">Electricity</SelectItem>
                      <SelectItem value="Others">Others</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* ── Section E: Health & Nutrition ───────────────────────────────── */}
          {currentStep === 5 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠️ <strong>CBMS Indicators:</strong> Health Insurance → Without Health Insurance | PhilHealth → With PhilHealth Coverage
              </p>

              {/* Health Insurance — CBMS: Without Health Insurance */}
              <div className="space-y-3 p-4 border rounded-md bg-secondary/5">
                <Label className="font-semibold">Does any household member have health insurance? <span className="text-red-500 text-xs">(CBMS)</span></Label>
                <RadioGroup value={sectionE.hasHealthInsurance} onValueChange={(v) => setSectionE({ ...sectionE, hasHealthInsurance: v })} className="flex gap-6">
                  <div className="flex items-center space-x-2"><RadioGroupItem value="yes" id="ins-yes" /><Label htmlFor="ins-yes">Yes</Label></div>
                  <div className="flex items-center space-x-2"><RadioGroupItem value="no" id="ins-no" /><Label htmlFor="ins-no">No</Label></div>
                </RadioGroup>
                {sectionE.hasHealthInsurance === "yes" && (
                  <div className="space-y-3 mt-3">
                    <Label className="text-sm">Type of Health Insurance</Label>
                    <Select value={sectionE.healthInsuranceType} onValueChange={(v) => setSectionE({ ...sectionE, healthInsuranceType: v, hasPhilHealth: v === "PhilHealth" || v === "PhilHealth (indigent/sponsored)" })}>
                      <SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PhilHealth">PhilHealth (employed/self-employed)</SelectItem>
                        <SelectItem value="PhilHealth (indigent/sponsored)">PhilHealth (indigent / sponsored)</SelectItem>
                        <SelectItem value="Private insurance">Private insurance</SelectItem>
                        <SelectItem value="HMO">HMO</SelectItem>
                        <SelectItem value="Multiple">Multiple types</SelectItem>
                      </SelectContent>
                    </Select>
                    {/* PhilHealth specific — CBMS: With PhilHealth Coverage */}
                    <div className="flex items-center space-x-2 mt-2">
                      <Checkbox id="philhealth" checked={sectionE.hasPhilHealth} onCheckedChange={(c) => setSectionE({ ...sectionE, hasPhilHealth: !!c })} />
                      <Label htmlFor="philhealth" className="cursor-pointer text-sm font-medium">
                        Household has PhilHealth coverage <span className="text-red-500 text-xs">(CBMS)</span>
                      </Label>
                    </div>
                    {sectionE.hasPhilHealth && (
                      <Select value={sectionE.philHealthType} onValueChange={(v) => setSectionE({ ...sectionE, philHealthType: v })}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="PhilHealth membership type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Employed">Employed member</SelectItem>
                          <SelectItem value="Self-employed">Self-employed / Individually paying</SelectItem>
                          <SelectItem value="Indigent/sponsored">Indigent / Sponsored (free)</SelectItem>
                          <SelectItem value="Senior citizen">Senior citizen</SelectItem>
                          <SelectItem value="Lifetime member">Lifetime member</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>

              {/* Disability */}
              <div className="flex items-start space-x-3 p-4 border rounded-md bg-secondary/5">
                <Checkbox id="disability" className="mt-1" checked={sectionE.hasDisabledMember} onCheckedChange={(c) => setSectionE({ ...sectionE, hasDisabledMember: !!c })} />
                <div className="space-y-1 w-full">
                  <Label htmlFor="disability" className="font-medium cursor-pointer">Any family member with disability (PWD)?</Label>
                  {sectionE.hasDisabledMember && (
                    <Input placeholder="Nature of disability (e.g. visual, hearing, physical, mental)" className="mt-2" value={sectionE.disabilityDetails} onChange={(e) => setSectionE({ ...sectionE, disabilityDetails: e.target.value })} />
                  )}
                </div>
              </div>

              {/* Chronic Illness */}
              <div className="flex items-start space-x-3 p-4 border rounded-md bg-secondary/5">
                <Checkbox id="illness" className="mt-1" checked={sectionE.hasChronicIllness} onCheckedChange={(c) => setSectionE({ ...sectionE, hasChronicIllness: !!c })} />
                <div className="space-y-1 w-full">
                  <Label htmlFor="illness" className="font-medium cursor-pointer">Any family member with chronic illness?</Label>
                  {sectionE.hasChronicIllness && (
                    <Input placeholder="Nature of illness (e.g. diabetes, hypertension, TB)" className="mt-2" value={sectionE.chronicIllnessDetails} onChange={(e) => setSectionE({ ...sectionE, chronicIllnessDetails: e.target.value })} />
                  )}
                </div>
              </div>

              {/* Pregnant Member */}
              <div className="flex items-start space-x-3 p-4 border rounded-md bg-secondary/5">
                <Checkbox id="pregnant" className="mt-1" checked={sectionE.hasPregnantMember} onCheckedChange={(c) => setSectionE({ ...sectionE, hasPregnantMember: !!c })} />
                <div className="space-y-1 w-full">
                  <Label htmlFor="pregnant" className="font-medium cursor-pointer">Pregnant women in household?</Label>
                  {sectionE.hasPregnantMember && (
                    <Select value={sectionE.pregnantMemberAge} onValueChange={(v) => setSectionE({ ...sectionE, pregnantMemberAge: v })}>
                      <SelectTrigger className="mt-2"><SelectValue placeholder="Age range of pregnant member" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10-15">10–15 years old</SelectItem>
                        <SelectItem value="16-20">16–20 years old</SelectItem>
                        <SelectItem value="21-30">21–30 years old</SelectItem>
                        <SelectItem value="31-40">31–40 years old</SelectItem>
                        <SelectItem value="41+">41 and above</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Nutrition Status */}
              <div className="space-y-2 p-4 border rounded-md bg-secondary/5">
                <Label className="font-medium">Nutrition Status of Children (0–12 years old)</Label>
                <RadioGroup value={sectionE.childrenNutritionStatus} onValueChange={(v) => setSectionE({ ...sectionE, childrenNutritionStatus: v })} className="flex flex-wrap gap-4 mt-2">
                  {["Normal", "Underweight", "Severely underweight", "Overweight", "No children 0-12"].map((status) => (
                    <div key={status} className="flex items-center space-x-2">
                      <RadioGroupItem value={status.toLowerCase()} id={`nutrition-${status}`} />
                      <Label htmlFor={`nutrition-${status}`}>{status}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* Immunization */}
              <div className="flex items-center space-x-2 border p-3 rounded-md">
                <Checkbox id="immunized" checked={sectionE.childrenImmunized} onCheckedChange={(c) => setSectionE({ ...sectionE, childrenImmunized: !!c })} />
                <Label htmlFor="immunized" className="cursor-pointer">Children (0–11 years) are fully immunized</Label>
              </div>

              {/* ── CBMS Mortality & Nutrition Indicators ─────────────────────── */}
              <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                🔴 <strong>CBMS Core Indicators:</strong> The following questions are required for the CBMS 13+1 Health Indicators (Child Mortality, Maternal Mortality, Malnourished Children). Please answer accurately.
              </div>

              {/* Child Mortality */}
              <div className="space-y-3 p-4 border border-red-100 rounded-md bg-red-50/30">
                <Label className="font-semibold text-red-800">Child Mortality (Under 5 years old)</Label>
                <p className="text-xs text-gray-500">Number of children under 5 years old who died in the past 12 months (January–December {new Date().getFullYear() - 1})</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="childDeaths" className="text-sm">Number of child deaths (0–4 yrs)</Label>
                    <Input
                      id="childDeaths"
                      type="number"
                      min="0"
                      max="20"
                      placeholder="0"
                      value={sectionE.childDeaths}
                      onChange={(e) => setSectionE({ ...sectionE, childDeaths: e.target.value })}
                    />
                  </div>
                  {parseInt(sectionE.childDeaths || "0") > 0 && (
                    <div className="space-y-1">
                      <Label htmlFor="childDeathDetails" className="text-sm">Cause of death / circumstances</Label>
                      <Input
                        id="childDeathDetails"
                        placeholder="e.g. pneumonia, diarrhea, accident"
                        value={sectionE.childDeathDetails}
                        onChange={(e) => setSectionE({ ...sectionE, childDeathDetails: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Maternal Mortality */}
              <div className="space-y-3 p-4 border border-red-100 rounded-md bg-red-50/30">
                <Label className="font-semibold text-red-800">Maternal Mortality</Label>
                <p className="text-xs text-gray-500">Number of women who died due to pregnancy-related causes (during pregnancy, childbirth, or within 42 days of delivery) in the past 12 months</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="maternalDeaths" className="text-sm">Number of maternal deaths</Label>
                    <Input
                      id="maternalDeaths"
                      type="number"
                      min="0"
                      max="10"
                      placeholder="0"
                      value={sectionE.maternalDeaths}
                      onChange={(e) => setSectionE({ ...sectionE, maternalDeaths: e.target.value })}
                    />
                  </div>
                  {parseInt(sectionE.maternalDeaths || "0") > 0 && (
                    <div className="space-y-1">
                      <Label htmlFor="maternalDeathDetails" className="text-sm">Cause of death / circumstances</Label>
                      <Input
                        id="maternalDeathDetails"
                        placeholder="e.g. hemorrhage, eclampsia, sepsis"
                        value={sectionE.maternalDeathDetails}
                        onChange={(e) => setSectionE({ ...sectionE, maternalDeathDetails: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Malnourished Children */}
              <div className="space-y-3 p-4 border border-amber-100 rounded-md bg-amber-50/30">
                <Label className="font-semibold text-amber-800">Malnourished Children (0–5 years old)</Label>
                <p className="text-xs text-gray-500">Number of children aged 0–5 who are underweight or severely underweight based on the latest weight-for-age assessment</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="malnourishedChildren" className="text-sm">Number of malnourished children (0–5 yrs)</Label>
                    <Input
                      id="malnourishedChildren"
                      type="number"
                      min="0"
                      max="20"
                      placeholder="0"
                      value={sectionE.malnourishedChildren}
                      onChange={(e) => setSectionE({ ...sectionE, malnourishedChildren: e.target.value })}
                    />
                  </div>
                  {parseInt(sectionE.malnourishedChildren || "0") > 0 && (
                    <div className="space-y-1">
                      <Label htmlFor="malnourishedChildrenDetails" className="text-sm">Names/ages of malnourished children</Label>
                      <Input
                        id="malnourishedChildrenDetails"
                        placeholder="e.g. Juan (2 yrs), Maria (4 yrs)"
                        value={sectionE.malnourishedChildrenDetails}
                        onChange={(e) => setSectionE({ ...sectionE, malnourishedChildrenDetails: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Section F: Education ─────────────────────────────────────────── */}
          {currentStep === 6 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠️ <strong>CBMS Indicator:</strong> Out-of-School Children/Youth — children 6–11 not in elementary AND youth 12–15 not in high school
              </p>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2 p-4 border rounded-md bg-secondary/5">
                  <Label className="font-semibold">Children 6–11 years old</Label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Attending elementary school</Label>
                      <Input type="number" placeholder="0" min="0" value={sectionF.childrenInSchool} onChange={(e) => setSectionF({ ...sectionF, childrenInSchool: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-red-600 font-medium">NOT attending school <span className="text-red-500">(CBMS)</span></Label>
                      <Input type="number" placeholder="0" min="0" value={sectionF.childrenOutOfSchool} onChange={(e) => setSectionF({ ...sectionF, childrenOutOfSchool: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 p-4 border rounded-md bg-secondary/5">
                  <Label className="font-semibold">Youth 12–15 years old</Label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Attending high school</Label>
                      <Input type="number" placeholder="0" min="0" value={sectionF.youthInSchool} onChange={(e) => setSectionF({ ...sectionF, youthInSchool: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-red-600 font-medium">NOT attending school <span className="text-red-500">(CBMS)</span></Label>
                      <Input type="number" placeholder="0" min="0" value={sectionF.youthOutOfSchool} onChange={(e) => setSectionF({ ...sectionF, youthOutOfSchool: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>

              {(parseInt(sectionF.childrenOutOfSchool || "0") > 0 || parseInt(sectionF.youthOutOfSchool || "0") > 0) && (
                <div className="space-y-2">
                  <Label>Reason(s) for Not Attending School</Label>
                  <Textarea placeholder="e.g. financial constraints, working, illness, distance, no interest..." value={sectionF.reasonsForNotAttending} onChange={(e) => setSectionF({ ...sectionF, reasonsForNotAttending: e.target.value })} />
                </div>
              )}

              <Separator />

              <div className="space-y-4">
                <Label className="text-base font-semibold">Digital Access</Label>
                <div className="flex items-center space-x-2 border p-3 rounded-md">
                  <Checkbox id="internet" checked={sectionF.hasInternetAccess} onCheckedChange={(c) => setSectionF({ ...sectionF, hasInternetAccess: !!c })} />
                  <Label htmlFor="internet" className="cursor-pointer">Household has access to internet / digital learning tools</Label>
                </div>
                {sectionF.hasInternetAccess && (
                  <div className="grid grid-cols-2 gap-2 ml-6">
                    {["Laptop/PC", "Cellular Phone", "Tablet", "Smart TV"].map((device) => (
                      <div key={device} className="flex items-center space-x-2">
                        <Checkbox id={`device-${device}`} checked={sectionF.digitalDevices.includes(device)} onCheckedChange={(c) => setSectionF({ ...sectionF, digitalDevices: c ? toggleArrayItem(sectionF.digitalDevices, device) : sectionF.digitalDevices.filter((d) => d !== device) })} />
                        <Label htmlFor={`device-${device}`}>{device}</Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Label className="text-base font-semibold">Sources of Information</Label>
                <div className="grid grid-cols-2 gap-3">
                  {["Radio", "Television", "Internet", "Newspaper/Print", "Community bulletin board"].map((source) => (
                    <div key={source} className="flex items-center space-x-2 border p-3 rounded-md">
                      <Checkbox id={`source-${source}`} checked={sectionF.informationSources.includes(source)} onCheckedChange={(c) => setSectionF({ ...sectionF, informationSources: c ? toggleArrayItem(sectionF.informationSources, source) : sectionF.informationSources.filter((s) => s !== source) })} />
                      <Label htmlFor={`source-${source}`}>{source}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Section G: Livelihood & Income ──────────────────────────────── */}
          {currentStep === 7 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠️ <strong>CBMS Indicator:</strong> Monthly income is used to determine households Below Poverty Threshold (₱{(9064).toLocaleString()}/month for a family of 5)
              </p>

              <div className="space-y-2">
                <Label className="font-semibold">Total Monthly Household Income (₱) <span className="text-red-500 text-xs">(CBMS: Poverty Threshold)</span></Label>
                <Input type="number" placeholder="0.00" value={sectionG.monthlyIncome} onChange={(e) => setSectionG({ ...sectionG, monthlyIncome: e.target.value })} />
                <p className="text-xs text-muted-foreground">Include all sources: employment, farming, business, remittances, etc.</p>
              </div>

              <div className="space-y-3">
                <Label className="font-semibold">Sources of Income (check all that apply)</Label>
                <div className="grid grid-cols-2 gap-3">
                  {["Farming/Agriculture", "Fishing", "Employment (regular)", "Employment (contractual)", "Business/Trade", "Remittances (OFW)", "Pension/SSS/GSIS", "Others"].map((source) => (
                    <div key={source} className="flex items-center space-x-2 border p-3 rounded-md">
                      <Checkbox id={`inc-${source}`} checked={sectionG.incomeSources.includes(source)} onCheckedChange={(c) => setSectionG({ ...sectionG, incomeSources: c ? toggleArrayItem(sectionG.incomeSources, source) : sectionG.incomeSources.filter((s) => s !== source) })} />
                      <Label htmlFor={`inc-${source}`} className="text-sm">{source}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="font-semibold">Livelihood Programs</Label>
                <div className="flex items-start space-x-3 p-4 border rounded-md bg-secondary/5">
                  <Checkbox id="magsakabataan" className="mt-1" checked={sectionG.magsakabataanRecipient} onCheckedChange={(c) => setSectionG({ ...sectionG, magsakabataanRecipient: !!c })} />
                  <div className="space-y-1">
                    <Label htmlFor="magsakabataan" className="font-medium cursor-pointer">Recipient of "Magsakabataan Para sa Kinabukasan Program"?</Label>
                    <p className="text-xs text-muted-foreground">Provincial livelihood assistance program</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center space-x-2 border p-3 rounded-md">
                  <Checkbox id="savings" checked={sectionG.hasSavings} onCheckedChange={(c) => setSectionG({ ...sectionG, hasSavings: !!c })} />
                  <Label htmlFor="savings" className="cursor-pointer text-sm">Household has savings</Label>
                </div>
                <div className="flex items-center space-x-2 border p-3 rounded-md">
                  <Checkbox id="loans" checked={sectionG.hasLoanAccess} onCheckedChange={(c) => setSectionG({ ...sectionG, hasLoanAccess: !!c })} />
                  <Label htmlFor="loans" className="cursor-pointer text-sm">Has access to loans / credit</Label>
                </div>
                <div className="flex items-center space-x-2 border p-3 rounded-md col-span-2">
                  <Checkbox id="foodshortage" checked={sectionG.experiencedFoodShortage} onCheckedChange={(c) => setSectionG({ ...sectionG, experiencedFoodShortage: !!c })} />
                  <Label htmlFor="foodshortage" className="cursor-pointer text-sm">Experienced food shortage in the past 12 months</Label>
                </div>
              </div>
            </div>
          )}

          {/* ── Section H: Social Protection & Disaster Preparedness ─────────── */}
          {currentStep === 8 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠️ <strong>CBMS Indicator:</strong> "Has Evacuation Plan" — whether the household has a family evacuation plan (not just if a center is accessible)
              </p>

              <h3 className="font-semibold text-lg">Disaster Preparedness</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between border p-3 rounded-md">
                  <Label>Disaster experienced in the last 5 years</Label>
                  <Select value={sectionH.disasterExperience} onValueChange={(v) => setSectionH({ ...sectionH, disasterExperience: v })}>
                    <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="Flood">Flood</SelectItem>
                      <SelectItem value="Typhoon">Typhoon</SelectItem>
                      <SelectItem value="Earthquake">Earthquake</SelectItem>
                      <SelectItem value="Landslide">Landslide</SelectItem>
                      <SelectItem value="Multiple">Multiple disasters</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2 border p-3 rounded-md bg-red-50/50">
                  <Checkbox id="evacplan" checked={sectionH.hasEvacuationPlan} onCheckedChange={(c) => setSectionH({ ...sectionH, hasEvacuationPlan: !!c })} />
                  <div className="flex-1">
                    <Label htmlFor="evacplan" className="cursor-pointer font-medium">Household has a family evacuation plan <span className="text-red-500 text-xs">(CBMS)</span></Label>
                    <p className="text-xs text-muted-foreground">A documented or agreed-upon plan for where to go and what to do during a disaster</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 border p-3 rounded-md">
                  <Checkbox id="evaccenter" checked={sectionH.evacuationCenterAccessible} onCheckedChange={(c) => setSectionH({ ...sectionH, evacuationCenterAccessible: !!c })} />
                  <Label htmlFor="evaccenter" className="cursor-pointer">Nearest evacuation center is known and accessible</Label>
                </div>

                <div className="flex items-center space-x-2 border p-3 rounded-md">
                  <Checkbox id="kit" checked={sectionH.hasEmergencyKit} onCheckedChange={(c) => setSectionH({ ...sectionH, hasEmergencyKit: !!c })} />
                  <Label htmlFor="kit" className="cursor-pointer">Household has an emergency / go-bag kit</Label>
                </div>
              </div>

              <Separator />

              <h3 className="font-semibold text-lg">Community Participation</h3>
              <div className="flex items-center space-x-2 border p-3 rounded-md">
                <Checkbox id="org" checked={sectionH.memberOfCommunityOrg} onCheckedChange={(c) => setSectionH({ ...sectionH, memberOfCommunityOrg: !!c })} />
                <Label htmlFor="org" className="cursor-pointer">Member of a community organization (e.g. farmers' group, women's org, cooperative)</Label>
              </div>

              <Separator />

              {/* ── CBMS Peace & Order ────────────────────────────────── */}
              <div className="p-3 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700">
                🚨 <strong>CBMS Peace &amp; Order Indicator:</strong> Households with members who were victims of crime in the past 12 months. This data is used for the CBMS crime victimization report.
              </div>
              <h3 className="font-semibold text-lg">Crime Victimization</h3>

              {/* Was household a victim? */}
              <div className="flex items-start space-x-3 p-4 border border-orange-100 rounded-md bg-orange-50/30">
                <Checkbox
                  id="victimOfCrime"
                  className="mt-1"
                  checked={sectionH.victimOfCrime}
                  onCheckedChange={(c) => setSectionH({ ...sectionH, victimOfCrime: !!c, crimeTypes: !!c ? sectionH.crimeTypes : [], maleVictims: !!c ? sectionH.maleVictims : "0", femaleVictims: !!c ? sectionH.femaleVictims : "0" })}
                />
                <div className="space-y-1 w-full">
                  <Label htmlFor="victimOfCrime" className="font-medium cursor-pointer">
                    Any household member was a victim of crime in the past 12 months <span className="text-red-500 text-xs">(CBMS)</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">Includes theft, robbery, physical assault, rape, murder, or any other criminal act</p>
                </div>
              </div>

              {sectionH.victimOfCrime && (
                <div className="space-y-4 pl-4 border-l-2 border-orange-200">
                  {/* Type of crime */}
                  <div className="space-y-2">
                    <Label className="font-medium">Type of Crime <span className="text-xs text-muted-foreground">(check all that apply)</span></Label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        "Theft / Snatching",
                        "Robbery / Hold-up",
                        "Physical Assault / Mauling",
                        "Rape / Sexual Assault",
                        "Murder / Homicide",
                        "Carnapping / Vehicle Theft",
                        "Cybercrime / Online Scam",
                        "Domestic Violence",
                        "Illegal Drugs",
                        "Other",
                      ].map((type) => (
                        <div key={type} className="flex items-center space-x-2">
                          <Checkbox
                            id={`crime-${type}`}
                            checked={sectionH.crimeTypes.includes(type)}
                            onCheckedChange={(c) => {
                              const updated = c
                                ? [...sectionH.crimeTypes, type]
                                : sectionH.crimeTypes.filter((t) => t !== type);
                              setSectionH({ ...sectionH, crimeTypes: updated });
                            }}
                          />
                          <Label htmlFor={`crime-${type}`} className="text-sm cursor-pointer">{type}</Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Number of victims by sex */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="maleVictims" className="text-sm font-medium">Number of Male Victims</Label>
                      <Input
                        id="maleVictims"
                        type="number"
                        min="0"
                        max="20"
                        placeholder="0"
                        value={sectionH.maleVictims}
                        onChange={(e) => setSectionH({ ...sectionH, maleVictims: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="femaleVictims" className="text-sm font-medium">Number of Female Victims</Label>
                      <Input
                        id="femaleVictims"
                        type="number"
                        min="0"
                        max="20"
                        placeholder="0"
                        value={sectionH.femaleVictims}
                        onChange={(e) => setSectionH({ ...sectionH, femaleVictims: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Was it reported? */}
                  <div className="space-y-3">
                    <Label className="font-medium">Was the crime reported to authorities?</Label>
                    <RadioGroup
                      value={sectionH.crimeReported ? "yes" : "no"}
                      onValueChange={(v) => setSectionH({ ...sectionH, crimeReported: v === "yes", reportedTo: v === "no" ? "" : sectionH.reportedTo })}
                      className="flex gap-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="yes" id="crimeReportedYes" />
                        <Label htmlFor="crimeReportedYes">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="no" id="crimeReportedNo" />
                        <Label htmlFor="crimeReportedNo">No</Label>
                      </div>
                    </RadioGroup>
                    {sectionH.crimeReported && (
                      <Select value={sectionH.reportedTo} onValueChange={(v) => setSectionH({ ...sectionH, reportedTo: v })}>
                        <SelectTrigger><SelectValue placeholder="Reported to..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Barangay">Barangay Officials</SelectItem>
                          <SelectItem value="PNP">Philippine National Police (PNP)</SelectItem>
                          <SelectItem value="NBI">National Bureau of Investigation (NBI)</SelectItem>
                          <SelectItem value="DSWD">DSWD / Social Worker</SelectItem>
                          <SelectItem value="Other">Other Authority</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Additional details */}
                  <div className="space-y-1">
                    <Label htmlFor="crimeDetails" className="text-sm font-medium">Additional details <span className="text-muted-foreground">(optional)</span></Label>
                    <Textarea
                      id="crimeDetails"
                      placeholder="Brief description of the incident (location, time, circumstances)..."
                      value={sectionH.crimeDetails}
                      onChange={(e) => setSectionH({ ...sectionH, crimeDetails: e.target.value })}
                      rows={3}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Section I: Agricultural Activities ──────────────────────────── */}
          {currentStep === 9 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                ⚠️ <strong>CBMS Indicator:</strong> "With Agricultural Land" — whether the household owns or tills agricultural land
              </p>

              <div className="flex items-start space-x-3 p-4 border rounded-md bg-secondary/5">
                <Checkbox id="agriland" className="mt-1" checked={sectionI.hasAgriculturalLand} onCheckedChange={(c) => setSectionI({ ...sectionI, hasAgriculturalLand: !!c })} />
                <div className="space-y-3 w-full">
                  <Label htmlFor="agriland" className="font-medium cursor-pointer">Household owns or tills agricultural land <span className="text-red-500 text-xs">(CBMS)</span></Label>
                  {sectionI.hasAgriculturalLand && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-sm">Land Area (hectares)</Label>
                        <Input type="number" placeholder="0.0" step="0.1" value={sectionI.landArea} onChange={(e) => setSectionI({ ...sectionI, landArea: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-sm">Crops Planted</Label>
                        <Input placeholder="e.g. rice, corn, vegetables" value={sectionI.cropsPlanted} onChange={(e) => setSectionI({ ...sectionI, cropsPlanted: e.target.value })} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start space-x-3 p-4 border rounded-md bg-secondary/5">
                <Checkbox id="livestock" className="mt-1" checked={sectionI.hasLivestock} onCheckedChange={(c) => setSectionI({ ...sectionI, hasLivestock: !!c })} />
                <div className="space-y-2 w-full">
                  <Label htmlFor="livestock" className="font-medium cursor-pointer">Household raises livestock / poultry</Label>
                  {sectionI.hasLivestock && (
                    <Input placeholder="e.g. carabao, cattle, pigs, chickens" value={sectionI.livestockDetails} onChange={(e) => setSectionI({ ...sectionI, livestockDetails: e.target.value })} />
                  )}
                </div>
              </div>

              <div className="flex items-start space-x-3 p-4 border rounded-md bg-secondary/5">
                <Checkbox id="garden" className="mt-1" checked={sectionI.hasBackyardGarden} onCheckedChange={(c) => setSectionI({ ...sectionI, hasBackyardGarden: !!c })} />
                <div className="space-y-2 w-full">
                  <Label htmlFor="garden" className="font-medium cursor-pointer">Household has a backyard / kitchen garden</Label>
                  {sectionI.hasBackyardGarden && (
                    <Input placeholder="Specify vegetables/plants grown..." value={sectionI.gardenDetails} onChange={(e) => setSectionI({ ...sectionI, gardenDetails: e.target.value })} />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Section K: Feedback & Aspirations ───────────────────────────── */}
          {currentStep === 10 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-4">
                <Label className="text-base font-semibold">Top 3 Family Needs / Priorities</Label>
                <Input placeholder="1st Priority Need (e.g. livelihood assistance)" value={sectionK.primaryNeed1} onChange={(e) => setSectionK({ ...sectionK, primaryNeed1: e.target.value })} />
                <Input placeholder="2nd Priority Need" value={sectionK.primaryNeed2} onChange={(e) => setSectionK({ ...sectionK, primaryNeed2: e.target.value })} />
                <Input placeholder="3rd Priority Need" value={sectionK.primaryNeed3} onChange={(e) => setSectionK({ ...sectionK, primaryNeed3: e.target.value })} />

                <Label className="text-base font-semibold mt-4 block">Expectations from the Provincial Government</Label>
                <Textarea placeholder="What programs or services do you expect from the Provincial Government?" value={sectionK.expectations} onChange={(e) => setSectionK({ ...sectionK, expectations: e.target.value })} />

                <div className="flex items-center space-x-2 border p-4 rounded-md mt-4">
                  <Checkbox id="planning" checked={sectionK.includedInPlanning} onCheckedChange={(c) => setSectionK({ ...sectionK, includedInPlanning: !!c })} />
                  <Label htmlFor="planning" className="cursor-pointer">Do you feel your family is included in government planning and programs?</Label>
                </div>
              </div>
            </div>
          )}

          {/* ── Verification Step ────────────────────────────────────────────── */}
          {currentStep === 11 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Dwelling Photo */}
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Household Dwelling Photo</Label>
                  <div className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-secondary/5 transition-colors relative overflow-hidden min-h-[200px]">
                    {dwellingPhoto ? (
                      <>
                        <img src={dwellingPhoto} alt="Dwelling" className="absolute inset-0 w-full h-full object-cover" />
                        {dwellingLocation && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-2 flex items-center justify-center gap-1">
                            <MapPin className="h-3 w-3 text-green-400" />
                            <span>{dwellingLocation.lat.toFixed(6)}, {dwellingLocation.lng.toFixed(6)}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <Button variant="secondary" size="sm" onClick={() => { setDwellingPhoto(null); setDwellingLocation(null); }}>
                            <Trash2 className="mr-2 h-4 w-4" /> Remove
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <Camera className="h-10 w-10 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground mb-4">Take a photo of the house exterior</p>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="relative">
                            <Upload className="mr-2 h-4 w-4" /> Upload
                            <input type="file" accept="image/*" aria-label="Upload dwelling photo" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handlePhotoUpload(e, "dwelling")} />
                          </Button>
                          <Button size="sm" className="relative">
                            <Camera className="mr-2 h-4 w-4" /> Camera
                            <input type="file" accept="image/*" aria-label="Take dwelling photo" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handlePhotoUpload(e, "dwelling")} />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* ID Photo */}
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Respondent's ID / Signature</Label>
                  <div className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-secondary/5 transition-colors relative overflow-hidden min-h-[200px]">
                    {idPhoto ? (
                      <>
                        <img src={idPhoto} alt="ID" className="absolute inset-0 w-full h-full object-cover" />
                        {idLocation && (
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-2 flex items-center justify-center gap-1">
                            <MapPin className="h-3 w-3 text-green-400" />
                            <span>{idLocation.lat.toFixed(6)}, {idLocation.lng.toFixed(6)}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <Button variant="secondary" size="sm" onClick={() => { setIdPhoto(null); setIdLocation(null); }}>
                            <Trash2 className="mr-2 h-4 w-4" /> Remove
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <Camera className="h-10 w-10 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground mb-4">Photo of valid ID or respondent's signature</p>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="relative">
                            <Upload className="mr-2 h-4 w-4" /> Upload
                            <input type="file" accept="image/*" aria-label="Upload ID photo" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handlePhotoUpload(e, "id")} />
                          </Button>
                          <Button size="sm" className="relative">
                            <Camera className="mr-2 h-4 w-4" /> Camera
                            <input type="file" accept="image/*" aria-label="Take ID photo" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handlePhotoUpload(e, "id")} />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Review & Submit ──────────────────────────────────────────────── */}
          {currentStep === 12 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Survey Summary</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="p-3 border rounded-md bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Household ID</p>
                    <p className="font-medium">{sectionA.householdNumber}</p>
                  </div>
                  <div className="p-3 border rounded-md bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Head of Family</p>
                    <p className="font-medium">{sectionB.headName || "—"}</p>
                  </div>
                  <div className="p-3 border rounded-md bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="font-medium">{sectionA.barangay || "—"}, {sectionA.municipality || "—"}</p>
                  </div>
                  <div className="p-3 border rounded-md bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Respondent Email</p>
                    <p className="font-medium">{sectionA.respondentEmail || "—"}</p>
                  </div>
                  <div className="p-3 border rounded-md bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Respondent Contact</p>
                    <p className="font-medium">{sectionA.respondentContactNumber || "—"}</p>
                  </div>
                  <div className="p-3 border rounded-md bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Household Members</p>
                    <p className="font-medium">{members.length + 1} person(s)</p>
                  </div>
                  <div className="p-3 border rounded-md bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Monthly Income</p>
                    <p className="font-medium">₱{parseFloat(sectionG.monthlyIncome || "0").toLocaleString()}</p>
                  </div>
                  <div className="p-3 border rounded-md bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Water Source</p>
                    <p className="font-medium">{sectionC.waterSource || "—"}</p>
                  </div>
                  <div className="p-3 border rounded-md bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Toilet Facility</p>
                    <p className="font-medium">{sectionC.toiletFacility || "—"}</p>
                  </div>
                  <div className="p-3 border rounded-md bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Electricity Source</p>
                    <p className="font-medium">{sectionC.electricitySource || "—"}</p>
                  </div>
                  <div className="p-3 border rounded-md bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Tenure Status</p>
                    <p className="font-medium">{sectionC.tenureStatus || "—"}</p>
                  </div>
                  <div className="p-3 border rounded-md bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Health Insurance</p>
                    <p className="font-medium">{sectionE.hasHealthInsurance === "yes" ? (sectionE.healthInsuranceType || "Yes") : sectionE.hasHealthInsurance === "no" ? "None" : "—"}</p>
                  </div>
                  <div className="p-3 border rounded-md bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Out-of-School Youth (12–15)</p>
                    <p className="font-medium">{sectionF.youthOutOfSchool || "0"} person(s)</p>
                  </div>
                  <div className="p-3 border rounded-md bg-secondary/5">
                    <p className="text-xs text-muted-foreground">Has Evacuation Plan</p>
                    <p className="font-medium">{sectionH.hasEvacuationPlan ? "Yes" : "No"}</p>
                  </div>
                </div>

                <div className="p-4 bg-primary/5 border border-primary/20 rounded-md">
                  <p className="text-sm font-medium text-primary">By submitting this form, you certify that all information provided is true and accurate.</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>

        {/* Navigation */}
        <div className="sticky bottom-0 z-20 md:static flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 sm:p-6 border-t bg-background/95 sm:bg-secondary/5 backdrop-blur md:backdrop-blur-none">
          <Button className="w-full sm:w-auto min-h-11" variant="outline" onClick={handleBack} disabled={currentStep === 1}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <div className="flex w-full sm:w-auto flex-col sm:flex-row gap-2">
            <Button className="w-full sm:w-auto min-h-11" variant="ghost" onClick={() => toast.success("Draft saved!")}>
              <Save className="mr-2 h-4 w-4" /> Save Draft
            </Button>
            <Button className="w-full sm:w-auto min-h-11" onClick={handleNext}>
              {currentStep === steps.length ? (
                <><CheckCircle2 className="mr-2 h-4 w-4" /> Submit Survey</>
              ) : (
                <>Next <ArrowRight className="ml-2 h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
