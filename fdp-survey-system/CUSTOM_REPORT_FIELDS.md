# Custom Report Builder - Available Fields

The Custom Report Builder now includes **89 data fields** organized into **17 categories**, covering all sections of the comprehensive FDP survey form.

## Field Categories and Count

| Category | Fields | Description |
|----------|--------|-------------|
| **Basic Info** | 6 | Core household information (name, age, civil status, occupation, education, income) |
| **Location** | 5 | Geographic data (barangay, municipality, province, GPS coordinates) |
| **Programs** | 5 | Program membership status (4Ps, TUPAD, Senior Citizen, PWD, Indigenous People) |
| **Metadata** | 4 | Survey tracking (status, survey date, review date, return reason) |
| **Section A: Identification** | 4 | Household number, interview date, enumerator, supervisor |
| **Section B: Household Roster** | 1 | Number of household members |
| **Section C: Housing** | 6 | House type, roof/wall materials, water source, toilet, electricity |
| **Section D: Income & Livelihood** | 4 | Primary/secondary income sources, livelihood programs |
| **Section E: Health** | 4 | Health insurance, chronic illness details |
| **Section F: Education** | 3 | Children in/out of school, reasons for non-attendance |
| **Section G: Social Protection** | 3 | 4Ps, TUPAD, and other program enrollment |
| **Section H: Disaster Preparedness** | 3 | Emergency kit, evacuation plan, disaster experience |
| **Section I: Agriculture** | 4 | Agricultural land, land area, crops, livestock |
| **Section J: Access to Services** | 4 | Distance to health center, school, market, transportation mode |
| **Section K: Needs & Priorities** | 3 | Primary needs, priority programs, additional comments |

## Usage

Users can now:

1. **Select specific fields** from any survey section to include in custom reports
2. **Mix and match** fields across categories (e.g., combine housing characteristics with income data)
3. **Apply filters** to narrow down data by location, status, income ranges, age ranges, and program enrollment
4. **Save templates** with custom field selections for reuse
5. **Export reports** to PDF or CSV with only the selected fields

## Example Use Cases

### Housing Quality Report
Select fields from Section C (Housing) + Basic Info to analyze housing conditions by income level:
- House Type, Roof Material, Wall Material, Water Source, Toilet Facility
- Monthly Income, Barangay, 4Ps Beneficiary

### Health & Social Protection Report
Combine Section E (Health) + Section G (Social Protection) to assess healthcare coverage:
- Has Health Insurance, Health Insurance Type, Chronic Illness Details
- 4Ps Beneficiary, TUPAD Beneficiary, Monthly Income

### Agricultural Household Analysis
Use Section I (Agriculture) + Section D (Income) to study farming households:
- Has Agricultural Land, Land Area, Crops Planted, Has Livestock
- Primary Income Source, Monthly Income, Has Livelihood Program

### Service Accessibility Report
Analyze Section J (Access to Services) + Location data:
- Distance to Health Center, Distance to School, Distance to Market
- Transportation Mode, Barangay, Municipality

## Technical Implementation

- All 89 fields are defined in `client/src/components/CustomReportBuilder.tsx`
- Fields are organized by category with "Select All" buttons for each category
- Field selection state is persisted in report templates
- Export functions handle nested field paths (e.g., `sectionA.householdNumber`)
- Live preview shows matching records based on selected fields and filters
