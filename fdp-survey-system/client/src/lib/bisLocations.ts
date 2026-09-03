// BIS master location reference (mirrors BIS's registered tenants — see
// BIS frontend src/data/locations.js and the Barangays & Cities admin page).
// Shared by Settings.tsx (surveyor picks their own city/barangay once) and
// SurveyForm.tsx (auto-fills Section A from that saved choice).

export type BisLocationConfig = {
  province: string;
  barangays: string[];
};

export const BIS_MASTER_LOCATIONS: Record<string, BisLocationConfig> = {
  "Parañaque": {
    province: "Metro Manila",
    barangays: [
      "Baclaran",
      "BF Homes",
      "Don Bosco",
      "Don Galo",
      "La Huerta",
      "Marcelo Green",
      "Merville",
      "Moonwalk",
      "San Dionisio",
      "San Isidro",
      "San Antonio",
      "San Martin de Porres",
      "Santo Niño",
      "Sun Valley",
      "Tambo",
      "Vitalez",
    ],
  },
};

export const BIS_MASTER_MUNICIPALITIES = Object.keys(BIS_MASTER_LOCATIONS);

export const BIS_MASTER_PROVINCES = Array.from(
  new Set(Object.values(BIS_MASTER_LOCATIONS).map((config) => config.province)),
);

export function getProvinceForMunicipality(municipality: string | null | undefined): string {
  if (!municipality) return "";
  return BIS_MASTER_LOCATIONS[municipality]?.province ?? "";
}

/** Cities/municipalities that belong to a given province — step 2 of the
 * Province → City → Barangay cascade used at account setup (Settings) and
 * mirrored read-only in the survey's Identification section. */
export function getMunicipalitiesForProvince(province: string | null | undefined): string[] {
  if (!province) return [];
  return BIS_MASTER_MUNICIPALITIES.filter((m) => BIS_MASTER_LOCATIONS[m].province === province);
}
