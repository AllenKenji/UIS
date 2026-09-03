# Custom Report Builder - Search Functionality

The Custom Report Builder now includes a powerful search box that allows users to quickly find specific data fields by name or category.

## Features

### Real-time Filtering
- **Instant results**: Fields are filtered as you type, with no delay
- **Smart matching**: Searches both field labels and category names
- **Match counter**: Shows how many fields match your search query (e.g., "5 matching fields")

### Search Capabilities
- **Field name search**: Type any part of a field name (e.g., "health" finds "Has Health Insurance", "Health Insurance Type", "Distance to Health Center")
- **Category search**: Search by section name (e.g., "housing" shows all Section C fields, "education" shows Section F fields)
- **Case-insensitive**: Works regardless of capitalization

### User Experience
- **Clear button**: Click the X icon to instantly clear the search and show all fields
- **Empty state**: When no fields match, displays a helpful "No fields found" message
- **Visual feedback**: Search icon on the left, clear button appears on the right when typing

## Example Searches

| Search Query | Results | Use Case |
|--------------|---------|----------|
| `health` | 5 fields | Find all health-related fields (insurance, chronic illness, health center distance) |
| `income` | 3 fields | Locate income-related fields across different sections |
| `4ps` | 2 fields | Find 4Ps beneficiary fields (basic info + survey section) |
| `housing` | 6 fields | Show all housing characteristic fields |
| `distance` | 3 fields | Find accessibility/distance fields |
| `section c` | 6 fields | Show all fields from Section C (Housing) |
| `agriculture` | 4 fields | Display all agricultural activity fields |

## Technical Implementation

### Search Logic
```typescript
const filteredFields = searchQuery.trim()
  ? availableFields.filter(field => 
      field.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      field.category.toLowerCase().includes(searchQuery.toLowerCase())
    )
  : availableFields;
```

### Dynamic Category Display
- Only categories with matching fields are shown
- "Select All" buttons work within filtered results
- Field selection state is preserved when searching

### Performance
- No API calls required - filtering happens client-side
- Instant response even with 89 fields
- Smooth user experience with no lag

## Benefits

1. **Saves Time**: No need to scroll through 17 categories to find a specific field
2. **Improves Accuracy**: Quickly locate the exact field you need
3. **Enhances Usability**: Especially helpful for users unfamiliar with the survey structure
4. **Reduces Errors**: Less chance of selecting the wrong field when you can search directly

## Demo Test Case

**Search Query**: "health"

**Results**: 5 matching fields across 2 categories
- Section E: Health
  - Has Health Insurance
  - Health Insurance Type
  - Has Chronic Illness
  - Chronic Illness Details
- Section J: Access to Services
  - Distance to Health Center (km)

This demonstrates the search's ability to find fields across multiple categories based on a single keyword.
