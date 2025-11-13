/**
 * Field type detection and classification
 */

import { FieldType, FieldMapping } from '../types';

/**
 * Default field mappings - maps field types to common field identifiers
 */
export const DEFAULT_FIELD_MAPPINGS: FieldMapping = {
  email: ['email', 'e-mail', 'mail', 'user-email', 'user_email', 'contact-email', 'emailaddress', 'email-address'],
  firstName: ['firstname', 'first-name', 'first_name', 'fname', 'given-name', 'givenname'],
  lastName: ['lastname', 'last-name', 'last_name', 'lname', 'surname', 'family-name', 'familyname'],
  fullName: ['name', 'fullname', 'full-name', 'full_name', 'username', 'your-name'],
  phone: ['phone', 'telephone', 'mobile', 'cell', 'phonenumber', 'phone-number', 'phone_number', 'tel'],
  address: ['address', 'street', 'address1', 'address-line1', 'street-address', 'streetaddress'],
  city: ['city', 'town', 'locality'],
  state: ['state', 'province', 'region', 'county'],
  zipCode: ['zip', 'zipcode', 'zip-code', 'zip_code', 'postal', 'postalcode', 'postal-code', 'postal_code', 'postcode'],
  country: ['country', 'nation'],
  company: ['company', 'organization', 'organisation', 'org', 'business', 'employer'],
  jobTitle: ['title', 'job-title', 'job_title', 'jobtitle', 'position', 'role'],
  website: ['website', 'web', 'url', 'site', 'homepage'],
  dateOfBirth: ['dob', 'birthdate', 'birth-date', 'birth_date', 'dateofbirth', 'birthday'],
  gender: ['gender', 'sex'],
  username: ['user', 'login', 'account', 'userid', 'user-id', 'user_id'],
  password: ['password', 'pass', 'pwd'],
  cardNumber: ['card', 'cardnumber', 'card-number', 'card_number', 'ccnumber', 'creditcard'],
  cardExpiry: ['expiry', 'expiration', 'exp', 'expire', 'cardexpiry', 'card-expiry'],
  cardCVV: ['cvv', 'cvc', 'securitycode', 'security-code', 'csc'],
};

// Extended patterns for common variations
export const EXTENDED_FIELD_MAPPINGS: { [key: string]: string[] } = {
  passportNumber: ['passport', 'passportnumber', 'passport-number', 'passport_number', 'travel-document', 'traveldocument', 'document-number'],
  licenseNumber: ['license', 'licensenumber', 'license-number', 'drivers-license', 'driverslicense', 'dl-number'],
  idNumber: ['id', 'idnumber', 'id-number', 'identification', 'govt-id'],
};

/**
 * Normalize a string for comparison
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Check if field is a password field (don't auto-fill passwords)
 */
export function isPasswordField(type: string, name: string, id: string): boolean {
  const normalized = normalizeString(`${type} ${name} ${id}`);
  return type === 'password' || normalized.includes('password') || normalized.includes('pwd');
}

/**
 * Classify field type based on attributes
 */
export function classifyField(
  name: string,
  id: string,
  type: string,
  placeholder: string,
  label: string,
  ariaLabel: string
): { fieldType: FieldType; confidence: number } {
  // Don't classify password fields
  if (isPasswordField(type, name, id)) {
    return { fieldType: 'password', confidence: 100 };
  }

  // Combine all text attributes for analysis
  const combinedText = normalizeString(`${name} ${id} ${placeholder} ${label} ${ariaLabel}`);
  
  // Check extended patterns for passport, license, etc.
  for (const [fieldType, patterns] of Object.entries(EXTENDED_FIELD_MAPPINGS)) {
    for (const pattern of patterns) {
      if (combinedText.includes(normalizeString(pattern))) {
        return { fieldType: fieldType as FieldType, confidence: 90 };
      }
    }
  }
  
  // Special case: email input type
  if (type === 'email') {
    return { fieldType: 'email', confidence: 100 };
  }
  
  // Special case: tel input type
  if (type === 'tel') {
    return { fieldType: 'phone', confidence: 95 };
  }

  let bestMatch: FieldType = 'unknown';
  let highestScore = 0;

  // Check against all field mappings
  for (const [fieldType, patterns] of Object.entries(DEFAULT_FIELD_MAPPINGS)) {
    for (const pattern of patterns) {
      const normalizedPattern = normalizeString(pattern);
      
      // Exact match
      if (combinedText === normalizedPattern) {
        return { fieldType: fieldType as FieldType, confidence: 100 };
      }
      
      // Contains match
      if (combinedText.includes(normalizedPattern)) {
        const score = calculateMatchScore(combinedText, normalizedPattern, name, id, label);
        if (score > highestScore) {
          highestScore = score;
          bestMatch = fieldType as FieldType;
        }
      }
    }
  }

  // Pattern-based detection for specific formats
  const patternMatch = detectByPattern(combinedText, placeholder, type);
  if (patternMatch.confidence > highestScore) {
    return patternMatch;
  }

  return { fieldType: bestMatch, confidence: highestScore };
}

/**
 * Calculate match score based on where the pattern appears
 */
function calculateMatchScore(
  combinedText: string,
  pattern: string,
  name: string,
  id: string,
  label: string
): number {
  let score = 60; // Base score for containing the pattern
  
  const normalizedName = normalizeString(name);
  const normalizedId = normalizeString(id);
  const normalizedLabel = normalizeString(label);
  
  // Higher score if pattern is in name or id
  if (normalizedName.includes(pattern)) {
    score += 20;
  }
  if (normalizedId.includes(pattern)) {
    score += 15;
  }
  if (normalizedLabel.includes(pattern)) {
    score += 10;
  }
  
  // Bonus for exact match in any field
  if (normalizedName === pattern || normalizedId === pattern) {
    score = 95;
  }
  
  return Math.min(score, 99);
}

/**
 * Detect field type by pattern matching
 */
function detectByPattern(
  combinedText: string,
  placeholder: string,
  type: string
): { fieldType: FieldType; confidence: number } {
  // Email pattern
  if (/email|@|mail/.test(combinedText)) {
    return { fieldType: 'email', confidence: 85 };
  }
  
  // Phone pattern
  if (/phone|tel|mobile|cell|\d{3}[-.]?\d{3}/.test(combinedText)) {
    return { fieldType: 'phone', confidence: 80 };
  }
  
  // Zip code pattern
  if (/zip|postal|postcode|\d{5}/.test(combinedText)) {
    return { fieldType: 'zipCode', confidence: 80 };
  }
  
  // Date pattern
  if (/date|dob|birth|mm\/dd\/yyyy/.test(combinedText)) {
    return { fieldType: 'dateOfBirth', confidence: 75 };
  }
  
  // Credit card patterns
  if (/card|credit|debit|\d{4}.*\d{4}.*\d{4}.*\d{4}/.test(combinedText)) {
    return { fieldType: 'cardNumber', confidence: 85 };
  }
  
  if (/cvv|cvc|security/.test(combinedText)) {
    return { fieldType: 'cardCVV', confidence: 90 };
  }
  
  if (/expir|exp/.test(combinedText) && /date|month|year|mm|yy/.test(combinedText)) {
    return { fieldType: 'cardExpiry', confidence: 85 };
  }

  return { fieldType: 'unknown', confidence: 0 };
}

/**
 * Get confidence level category
 */
export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 85) return 'high';
  if (confidence >= 60) return 'medium';
  return 'low';
}

/**
 * Check if two field types are compatible
 */
export function areFieldTypesCompatible(type1: FieldType, type2: FieldType): boolean {
  if (type1 === type2) return true;
  
  // firstName, lastName can be used for fullName
  if (type1 === 'fullName' && (type2 === 'firstName' || type2 === 'lastName')) return true;
  if (type2 === 'fullName' && (type1 === 'firstName' || type1 === 'lastName')) return true;
  
  return false;
}

