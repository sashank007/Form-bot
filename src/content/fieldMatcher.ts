/**
 * Smart field matching algorithm
 */

import { FormField, DetectedField, FormData, FieldType } from '../types';
import { classifyField, getConfidenceLevel, normalizeString } from '../utils/fieldClassifier';

/**
 * Match form fields with saved data
 */
export function matchFields(
  fields: FormField[],
  savedData: FormData
): DetectedField[] {
  const detectedFields: DetectedField[] = [];
  const availableKeys = Object.keys(savedData);

  for (const field of fields) {
    // Skip password fields
    if (field.type === 'password') {
      detectedFields.push({
        field,
        fieldType: 'password',
        confidence: 0,
      });
      continue;
    }

    // Classify the field
    const { fieldType, confidence } = classifyField(
      field.name,
      field.id,
      field.type,
      field.placeholder,
      field.label,
      field.ariaLabel
    );

    // Try to find matching data
    const matchResult = findMatchingData(
      field,
      fieldType,
      availableKeys,
      savedData
    );

    detectedFields.push({
      field,
      fieldType,
      confidence: matchResult.confidence,
      matchedKey: matchResult.matchedKey,
    });
  }

  return detectedFields;
}

/**
 * Find matching data for a field
 */
function findMatchingData(
  field: FormField,
  fieldType: FieldType,
  availableKeys: string[],
  savedData: FormData
): { matchedKey?: string; confidence: number } {
  // Strategy 1: Exact key match
  const exactMatch = findExactMatch(field, availableKeys);
  if (exactMatch) {
    return { matchedKey: exactMatch, confidence: 100 };
  }

  // Strategy 2: Field type match
  const typeMatch = findTypeMatch(fieldType, availableKeys, savedData);
  if (typeMatch) {
    return typeMatch;
  }

  // Strategy 3: Fuzzy match
  const fuzzyMatch = findFuzzyMatch(field, availableKeys, savedData);
  if (fuzzyMatch) {
    return fuzzyMatch;
  }

  return { confidence: 0 };
}

/**
 * Find exact key match in saved data
 */
function findExactMatch(field: FormField, availableKeys: string[]): string | null {
  const normalizedName = normalizeString(field.name);
  const normalizedId = normalizeString(field.id);
  const normalizedLabel = normalizeString(field.label);
  const normalizedPlaceholder = normalizeString(field.placeholder);
  const normalizedAriaLabel = normalizeString(field.ariaLabel);

  for (const key of availableKeys) {
    const normalizedKey = normalizeString(key);
    
    // Check against all field identifiers
    if (normalizedKey === normalizedName || 
        normalizedKey === normalizedId ||
        normalizedKey === normalizedLabel ||
        normalizedKey === normalizedPlaceholder ||
        normalizedKey === normalizedAriaLabel) {
      return key;
    }
  }

  return null;
}

/**
 * Find match based on field type
 */
function findTypeMatch(
  fieldType: FieldType,
  availableKeys: string[],
  savedData: FormData
): { matchedKey: string; confidence: number } | null {
  if (fieldType === 'unknown') {
    return null;
  }

  // Look for a key that matches the field type
  const matches: Array<{ key: string; confidence: number }> = [];
  
  for (const key of availableKeys) {
    const normalizedKey = normalizeString(key);
    const typeString = normalizeString(fieldType);
    
    if (normalizedKey.includes(typeString) || typeString.includes(normalizedKey)) {
      // Prefer shorter, more specific matches
      const specificity = calculateSpecificity(key, typeString);
      matches.push({ key, confidence: 90 - (10 * (1 - specificity)) });
    }
  }

  // Return the best match (highest confidence)
  if (matches.length > 0) {
    const best = matches.sort((a, b) => b.confidence - a.confidence)[0];
    return { matchedKey: best.key, confidence: best.confidence };
  }

  // Special handling for common field types
  const typeBasedKey = getKeyForFieldType(fieldType, availableKeys);
  if (typeBasedKey) {
    return { matchedKey: typeBasedKey, confidence: 85 };
  }

  return null;
}

/**
 * Get the appropriate key for a field type from available keys
 */
function getKeyForFieldType(fieldType: FieldType, availableKeys: string[]): string | null {
  const typeMap: { [key in FieldType]?: string[] } = {
    email: ['email', 'emailAddress', 'userEmail'],
    firstName: ['firstName', 'fname', 'givenName', 'name'], // name as fallback
    lastName: ['lastName', 'lname', 'surname', 'familyName'],
    fullName: ['fullName', 'userName', 'name'], // name as fallback
    phone: ['phone', 'phoneNumber', 'mobile', 'telephone'],
    address: ['address', 'streetAddress', 'address1'],
    city: ['city', 'town'],
    state: ['state', 'province', 'region'],
    zipCode: ['zipCode', 'postalCode', 'zip'],
    country: ['country'],
    company: ['company', 'organization', 'organizationName'],
    jobTitle: ['jobTitle', 'title', 'position'],
    website: ['website', 'url'],
    dateOfBirth: ['dateOfBirth', 'dob', 'birthDate'],
    gender: ['gender'],
    username: ['username', 'user'],
  };

  const possibleKeys = typeMap[fieldType] || [];
  
  // Try exact matches first (in order of preference)
  for (const possibleKey of possibleKeys) {
    const normalizedPossible = normalizeString(possibleKey);
    for (const key of availableKeys) {
      if (normalizeString(key) === normalizedPossible) {
        return key;
      }
    }
  }

  return null;
}

/**
 * Find fuzzy match based on similarity
 */
function findFuzzyMatch(
  field: FormField,
  availableKeys: string[],
  savedData: FormData
): { matchedKey: string; confidence: number } | null {
  const fieldTexts = [
    normalizeString(field.name),
    normalizeString(field.id),
    normalizeString(field.label),
    normalizeString(field.placeholder),
    normalizeString(field.ariaLabel),
  ].filter(text => text.length > 0);
  
  const matches: Array<{ key: string; score: number; specificity: number }> = [];

  for (const key of availableKeys) {
    const normalizedKey = normalizeString(key);
    
    // Check each field text for similarity
    for (const fieldText of fieldTexts) {
      // Skip if key contains exclusionary terms for generic field
      if (shouldSkipMatch(fieldText, normalizedKey)) {
        continue;
      }
      
      // Check if key is contained in field text or vice versa
      if (fieldText.includes(normalizedKey) || normalizedKey.includes(fieldText)) {
        const score = Math.max(
          normalizedKey.length / fieldText.length,
          fieldText.length / normalizedKey.length
        );
        
        // Only consider if there's substantial overlap
        if (score > 0.5) {
          const specificity = calculateSpecificity(normalizedKey, fieldText);
          matches.push({ key, score, specificity });
        }
      }
      
      // STRICT character similarity - only very high similarity
      const similarity = calculateSimilarity(fieldText, normalizedKey);
      if (similarity > 0.7) { // Much stricter threshold (was 0.4)
        const specificity = calculateSpecificity(normalizedKey, fieldText);
        matches.push({ key, score: similarity, specificity });
      }
    }
  }

  if (matches.length > 0) {
    // Sort by specificity first, then score
    const sorted = matches.sort((a, b) => {
      if (Math.abs(a.specificity - b.specificity) > 0.2) {
        return b.specificity - a.specificity; // Prefer more specific matches
      }
      return b.score - a.score; // Then by score
    });
    
    const bestMatch = sorted[0];
    
    // Require minimum score to return a match
    if (bestMatch.score < 0.6) {
      return null;
    }
    
    const confidence = Math.min(Math.floor(bestMatch.score * 85), 80);
    return { matchedKey: bestMatch.key, confidence };
  }

  return null;
}

/**
 * Check if a match should be skipped due to conflicting terms
 */
function shouldSkipMatch(fieldText: string, keyText: string): boolean {
  // If field is just "name", don't match with organization/company
  if (fieldText === 'name' && 
      (keyText.includes('organization') || 
       keyText.includes('company') || 
       keyText.includes('business'))) {
    return true;
  }
  
  // If field is "organization" or "company", don't match with just "name"
  if ((fieldText.includes('organization') || 
       fieldText.includes('company') || 
       fieldText.includes('business')) && 
      keyText === 'name') {
    return true;
  }
  
  // Don't match completely unrelated fields
  const unrelatablePatterns = [
    { field: 'name', skipKeys: ['patent', 'project', 'skill', 'education', 'experience', 'certification'] },
    { field: 'email', skipKeys: ['patent', 'project', 'name', 'skill', 'education'] },
    { field: 'phone', skipKeys: ['patent', 'project', 'email', 'skill', 'education'] },
    { field: 'address', skipKeys: ['patent', 'project', 'email', 'phone', 'skill'] },
  ];
  
  for (const pattern of unrelatablePatterns) {
    if (fieldText.includes(pattern.field)) {
      for (const skipKey of pattern.skipKeys) {
        if (keyText.includes(skipKey)) {
          return true;
        }
      }
    }
  }
  
  return false;
}

/**
 * Calculate specificity score (prefer shorter, more specific matches)
 */
function calculateSpecificity(keyText: string, fieldText: string): number {
  // Prefer keys that are shorter and more specific
  const lengthRatio = Math.min(keyText.length, fieldText.length) / Math.max(keyText.length, fieldText.length);
  
  // Penalize keys with extra qualifiers when field is simple
  const fieldWords = fieldText.split(/(?=[A-Z])|\s|_|-/).filter(w => w.length > 0);
  const keyWords = keyText.split(/(?=[A-Z])|\s|_|-/).filter(w => w.length > 0);
  
  if (fieldWords.length === 1 && keyWords.length > 1) {
    // Field is simple (e.g., "name"), key is complex (e.g., "organizationName")
    // Check if the simple word is in the key
    if (keyText.includes(fieldText)) {
      // Penalize based on how much extra the key has
      return lengthRatio * 0.5; // Lower specificity for complex keys
    }
  }
  
  return lengthRatio;
}

/**
 * Calculate similarity between two strings (0-1)
 */
function calculateSimilarity(str1: string, str2: string): number {
  // Simple substring matching score
  const shorter = str1.length < str2.length ? str1 : str2;
  const longer = str1.length < str2.length ? str2 : str1;
  
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  
  // Calculate common substring ratio
  let commonChars = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) {
      commonChars++;
    }
  }
  
  return commonChars / longer.length;
}

/**
 * Get fill value for a field with smart formatting
 */
export function getFillValue(
  field: FormField,
  fieldType: FieldType,
  matchedKey: string | undefined,
  savedData: FormData
): string {
  if (!matchedKey || !savedData[matchedKey]) {
    return '';
  }

  let value = savedData[matchedKey];

  // Format based on field type
  switch (fieldType) {
    case 'phone':
      value = formatPhoneNumber(value, field.placeholder);
      break;
    case 'zipCode':
      value = formatZipCode(value);
      break;
    case 'cardNumber':
      value = formatCardNumber(value);
      break;
  }

  return value;
}

/**
 * Format phone number based on placeholder hint
 */
function formatPhoneNumber(phone: string, placeholder: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Try to match placeholder format
  if (placeholder.includes('(') && placeholder.includes(')')) {
    // Format: (123) 456-7890
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
  }
  
  // Default format
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  
  return phone;
}

/**
 * Format zip code
 */
function formatZipCode(zip: string): string {
  const digits = zip.replace(/\D/g, '');
  
  if (digits.length === 9) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  
  return digits.slice(0, 5);
}

/**
 * Format credit card number
 */
function formatCardNumber(card: string): string {
  const digits = card.replace(/\D/g, '');
  const parts = [];
  
  for (let i = 0; i < digits.length; i += 4) {
    parts.push(digits.slice(i, i + 4));
  }
  
  return parts.join(' ');
}


