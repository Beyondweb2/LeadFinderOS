
# Display Specific Business Categories (e.g., "Web designer")

## Problem
The current implementation shows generic categories like "establishment" instead of specific ones like "Web designer" because the legacy Google Places API only returns generic types.

## Solution
Update the backend to use the **new Google Places API v1** for fetching place details, which provides `primaryTypeDisplayName` - the specific, human-readable business category shown in Google Maps.

## Technical Changes

### File: `supabase/functions/search-leads/index.ts`

**1. Update `getPlaceDetails` function to use the new Places API v1:**

```text
Old endpoint: https://maps.googleapis.com/maps/api/place/details/json
New endpoint: https://places.googleapis.com/v1/places/{PLACE_ID}
```

**2. Request the `primaryTypeDisplayName` field:**

Add `primaryTypeDisplayName` to the FieldMask header:
```text
X-Goog-FieldMask: displayName,formattedAddress,internationalPhoneNumber,...,primaryTypeDisplayName,primaryType
```

**3. Map the new API response fields:**

| Old Field | New Field |
|-----------|-----------|
| `name` | `displayName.text` |
| `formatted_address` | `formattedAddress` |
| `international_phone_number` | `internationalPhoneNumber` |
| `formatted_phone_number` | `nationalPhoneNumber` |
| `rating` | `rating` |
| `user_ratings_total` | `userRatingCount` |
| `website` | `websiteUri` |
| `url` | `googleMapsUri` |
| `business_status` | `businessStatus` |
| `types` | `types` |
| *(new)* | `primaryTypeDisplayName.text` |

**4. Update category extraction logic:**

```typescript
// Use primaryTypeDisplayName for specific category, fall back to types
const category = details.primaryTypeDisplayName?.text 
  || details.primaryType?.replace(/_/g, ' ')
  || details.types?.find((t: string) => !genericTypes.has(t))?.replace(/_/g, ' ');
```

## Result
After this change, leads will display specific categories like:
- "Web designer" instead of "establishment"
- "Restaurant" instead of "food"
- "Hair salon" instead of "store"

This matches exactly what users see in Google Maps.
