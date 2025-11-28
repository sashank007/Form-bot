# AI Matching Flow Explained

## Overview
The AI matching system intelligently matches form fields on web pages to profile data keys using semantic understanding, not just exact text matching.

## How It Works

### 1. **Field Detection**
When you visit a page with a form, the extension:
- Detects all form fields (inputs, textareas, selects)
- Extracts field information: label, name, placeholder, aria-label, type
- Example: Field detected as `{ label: "Name *", name: "fullName", type: "text" }`

### 2. **Profile Data Preparation**
- Loads your saved profile data
- Flattens nested structures (e.g., Google Sheets rows)
- Gets list of available keys: `["firstName", "lastName", "email", "phone", "address", ...]`

### 3. **Matching Strategy (Multi-Layered)**

The system tries matching in this order:

#### Strategy 1: Exact Match (Fastest)
- Checks if field name/label exactly matches a profile key
- Example: Field name "email" → Profile key "email" ✅
- Confidence: 100%

#### Strategy 2: Intelligent AI Matching (When needed)
Used when fuzzy match confidence would be low (< 80%)

**Step 2a: Check Cache**
- Checks Redis cache (backend) and local cache
- If previously matched, returns cached result instantly
- No API call needed

**Step 2b: AI Semantic Matching**
If cache miss, calls OpenAI API with:
- **Field context**: label, name, placeholder, aria-label
- **Available profile keys**: All keys from your profile
- **AI prompt**: "Which profile key semantically matches this field?"

**AI Returns:**
```json
{
  "matchedKey": "fullName",           // Best single match
  "confidence": 85,
  "possibleMatches": [                 // ALL possible matches
    { "key": "fullName", "confidence": 85 },
    { "key": "name", "confidence": 80 },
    { "key": "firstName", "confidence": 60 },
    { "key": "lastName", "confidence": 60 }
  ]
}
```

**Key Features:**
- **Semantic Understanding**: "Name" field understands it could match firstName, lastName, fullName, or name
- **Multiple Options**: Returns ALL possible matches, not just one
- **Confidence Scores**: Each match has a confidence level
- **Exact Key Matching**: AI returns exact keys from your profile (normalized if needed)

#### Strategy 3: Field Type Matching
- Matches based on field type classification
- Example: Email field type → looks for "email", "emailAddress" keys
- Confidence: 70-80%

#### Strategy 4: Fuzzy Match (Fallback)
- String similarity matching
- Only used if AI matching fails
- Confidence: 50-70%

### 4. **Result Storage**
- Best match stored in cache for future use
- Possible matches stored for user selection
- Mapping saved globally for similar forms

## Example Flow

**Form Field:** `{ label: "Name *", name: "fullName", type: "text" }`

**Profile Keys:** `["firstName", "lastName", "fullName", "email", "phone"]`

**AI Analysis:**
1. Understands "Name" semantically
2. Identifies multiple matches:
   - `fullName` (85% confidence) - Best match
   - `name` (80% confidence) - Good alternative
   - `firstName` (60% confidence) - Possible
   - `lastName` (60% confidence) - Possible

**Result:**
- Primary match: `fullName` (85%)
- Alternative options shown to user
- User can choose different match if needed

## Benefits

1. **Semantic Understanding**: "personal projects" matches "projects", not just exact text
2. **Multiple Options**: Shows all possible matches, not just one
3. **Context Aware**: Considers field type, surrounding context, common patterns
4. **Cached Results**: Fast matching for previously seen fields
5. **Flexible**: Handles variations like "email address" → "email", "phone number" → "phone"

## Configuration

AI matching requires:
- OpenAI API key set in settings
- OpenAI enabled toggle ON
- Profile data loaded

If AI is disabled, falls back to fuzzy matching (less accurate but still works).

