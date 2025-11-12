/**
 * AI-Powered Validation and Error Detection
 */

import { FormData } from '../types';
import { getSettings } from './storage';

export interface ValidationIssue {
  field: string;
  severity: 'error' | 'warning' | 'security';
  message: string;
  suggestion?: string;
  autoFix?: string;
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  securityWarnings: ValidationIssue[];
}

/**
 * Validate form data before filling
 */
export async function validateFormData(
  formData: FormData,
  fieldTypes: { [key: string]: string },
  currentUrl: string
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const securityWarnings: ValidationIssue[] = [];

  // Local validation first (fast)
  const localIssues = performLocalValidation(formData, fieldTypes);
  issues.push(...localIssues);

  // Security checks
  const securityIssues = performSecurityChecks(formData, fieldTypes, currentUrl);
  securityWarnings.push(...securityIssues);

  // AI validation for complex checks
  const settings = await getSettings();
  if (settings.openAIEnabled && settings.openAIKey) {
    const aiIssues = await performAIValidation(formData, fieldTypes);
    issues.push(...aiIssues);
  }

  const hasErrors = issues.some(i => i.severity === 'error') || securityWarnings.length > 0;

  return {
    isValid: !hasErrors,
    issues,
    securityWarnings,
  };
}

/**
 * Local validation rules (instant, no API calls)
 */
function performLocalValidation(formData: FormData, fieldTypes: { [key: string]: string }): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [key, value] of Object.entries(formData)) {
    if (!value || !value.trim()) continue;

    const fieldType = (fieldTypes[key] || '').toLowerCase();
    const keyLower = key.toLowerCase();

    // Email validation
    if (fieldType.includes('email') || keyLower.includes('email') || keyLower.includes('mail')) {
      if (!isValidEmail(value)) {
        const emailHints = getEmailValidationHints(value);
        issues.push({
          field: key,
          severity: 'error',
          message: `Email format invalid: "${value}"`,
          suggestion: emailHints,
        });
      }
    }

    // Phone validation - check more variations
    if (fieldType.includes('phone') || 
        fieldType.includes('tel') || 
        fieldType.includes('mobile') ||
        keyLower.includes('phone') || 
        keyLower.includes('tel') || 
        keyLower.includes('mobile') ||
        keyLower.includes('cell')) {
      const phoneIssue = validatePhone(value);
      if (phoneIssue) {
        issues.push({
          field: key,
          severity: phoneIssue.severity,
          message: phoneIssue.message,
          suggestion: phoneIssue.suggestion,
          autoFix: phoneIssue.autoFix,
        });
      }
    }

    // Zip code validation
    if (fieldType.includes('zip') || key.toLowerCase().includes('zip') || key.toLowerCase().includes('postal')) {
      if (!isValidZipCode(value)) {
        issues.push({
          field: key,
          severity: 'warning',
          message: `Zip code format may be invalid: "${value}"`,
          suggestion: 'US zip codes should be 5 or 9 digits',
        });
      }
    }

    // URL validation
    if (fieldType.includes('url') || key.toLowerCase().includes('website')) {
      if (!isValidUrl(value)) {
        issues.push({
          field: key,
          severity: 'warning',
          message: `URL format may be invalid: "${value}"`,
          suggestion: 'URLs should start with http:// or https://',
        });
      }
    }
  }

  // Cross-field validation
  const crossFieldIssues = validateCrossFields(formData);
  issues.push(...crossFieldIssues);

  return issues;
}

/**
 * Security checks for suspicious requests
 */
function performSecurityChecks(
  formData: FormData,
  fieldTypes: { [key: string]: string },
  currentUrl: string
): ValidationIssue[] {
  const warnings: ValidationIssue[] = [];
  const url = new URL(currentUrl);
  const isHttps = url.protocol === 'https:';

  // Check for SSN requests
  const hasSsn = Object.keys(formData).some(key => 
    key.toLowerCase().includes('ssn') || 
    key.toLowerCase().includes('social') ||
    key.toLowerCase().includes('socialsecurity')
  );

  if (hasSsn) {
    const isTrustedDomain = isTrustedSite(url.hostname);
    if (!isTrustedDomain) {
      warnings.push({
        field: 'SSN',
        severity: 'security',
        message: '🚨 This site is requesting your Social Security Number',
        suggestion: 'Verify this is a legitimate site before providing SSN. This is unusual for most forms.',
      });
    }
  }

  // Check for password on non-HTTPS
  if (!isHttps) {
    const hasPassword = Object.keys(fieldTypes).some(key => 
      fieldTypes[key] === 'password'
    );
    
    if (hasPassword) {
      warnings.push({
        field: 'Password',
        severity: 'security',
        message: '🚨 Password field on non-secure (HTTP) site',
        suggestion: 'This site is not using HTTPS. Your password may be transmitted insecurely.',
      });
    }
  }

  // Check for credit card on suspicious domains
  const hasCreditCard = Object.keys(formData).some(key =>
    key.toLowerCase().includes('card') ||
    key.toLowerCase().includes('cvv') ||
    key.toLowerCase().includes('credit')
  );

  if (hasCreditCard && !isHttps) {
    warnings.push({
      field: 'Credit Card',
      severity: 'security',
      message: '🚨 Credit card information on non-secure site',
      suggestion: 'Never enter credit card details on HTTP sites. Look for HTTPS and padlock icon.',
    });
  }

  return warnings;
}

/**
 * AI-powered validation for complex checks
 */
async function performAIValidation(formData: FormData, fieldTypes: { [key: string]: string }): Promise<ValidationIssue[]> {
  const settings = await getSettings();
  
  if (!settings.openAIEnabled || !settings.openAIKey) {
    return [];
  }

  try {
    const systemPrompt = `You are a form validation expert. Analyze form data for errors, inconsistencies, and logical issues.

Check for:
- Format errors (email, phone, dates)
- Logical inconsistencies (age vs birth year, experience vs dates)
- Missing or suspicious data
- Data that doesn't make sense together

Return ONLY valid JSON array.`;

    const userPrompt = `Validate this form data for errors and inconsistencies:

${JSON.stringify(formData, null, 2)}

Field types:
${JSON.stringify(fieldTypes, null, 2)}

Return JSON array of issues found:
[
  {
    "field": "age",
    "severity": "error",
    "message": "Age 30 doesn't match birth year 2000",
    "suggestion": "Age should be 24, not 30",
    "autoFix": "24"
  }
]

If no issues, return empty array: []`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.openAIKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('AI validation failed:', response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content);
    const issues = Array.isArray(parsed) ? parsed : (parsed.issues || []);

    return issues;
  } catch (error) {
    console.error('AI validation error:', error);
    return [];
  }
}

/**
 * Validate cross-field logic
 */
function validateCrossFields(formData: FormData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Age vs birth year
  const age = formData.age || formData.Age;
  const birthYear = formData.birthYear || formData.dateOfBirth;
  
  if (age && birthYear) {
    const ageNum = parseInt(age);
    const yearMatch = birthYear.match(/\d{4}/);
    
    if (yearMatch && !isNaN(ageNum)) {
      const birthYearNum = parseInt(yearMatch[0]);
      const currentYear = new Date().getFullYear();
      const calculatedAge = currentYear - birthYearNum;
      
      if (Math.abs(calculatedAge - ageNum) > 1) {
        issues.push({
          field: 'age',
          severity: 'error',
          message: `Age ${ageNum} doesn't match birth year ${birthYearNum}`,
          suggestion: `Age should be approximately ${calculatedAge}`,
          autoFix: calculatedAge.toString(),
        });
      }
    }
  }

  return issues;
}

/**
 * Email validation (RFC 5322 simplified but strict)
 */
function isValidEmail(email: string): boolean {
  // More strict email validation
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  // Additional checks
  if (!emailRegex.test(email)) {
    return false;
  }
  
  // Check for common mistakes
  if (email.includes('..')) return false; // Double dots
  if (email.startsWith('.')) return false;
  if (email.endsWith('.')) return false;
  if (email.includes('@.')) return false;
  if (email.includes('.@')) return false;
  
  // Check domain has valid TLD
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  
  const domain = parts[1];
  if (!domain.includes('.')) return false;
  
  const tld = domain.split('.').pop();
  if (!tld || tld.length < 2) return false;
  
  return true;
}

/**
 * Get specific email validation hints
 */
function getEmailValidationHints(email: string): string {
  if (!email.includes('@')) {
    return 'Missing @ symbol - emails must have username@domain.com format';
  }
  
  const parts = email.split('@');
  if (parts.length > 2) {
    return 'Multiple @ symbols found - email should have only one @';
  }
  
  if (parts.length === 2) {
    if (!parts[0]) {
      return 'Missing username before @ symbol';
    }
    if (!parts[1]) {
      return 'Missing domain after @ symbol';
    }
    if (!parts[1].includes('.')) {
      return 'Domain must include a dot (e.g., @example.com)';
    }
    
    const domain = parts[1];
    const domainParts = domain.split('.');
    const tld = domainParts[domainParts.length - 1];
    
    if (tld.length < 2) {
      return 'Top-level domain (TLD) too short - use .com, .org, .net, etc.';
    }
  }
  
  if (email.includes('..')) {
    return 'Double dots (..) are not allowed in email addresses';
  }
  
  if (email.includes(' ')) {
    return 'Spaces are not allowed in email addresses';
  }
  
  return 'Email format invalid - should be: username@domain.com';
}

/**
 * Phone validation
 */
function validatePhone(phone: string): { severity: 'error' | 'warning'; message: string; suggestion: string; autoFix?: string } | null {
  const digits = phone.replace(/\D/g, '');
  
  if (digits.length < 10) {
    return {
      severity: 'error',
      message: `Phone number too short: "${phone}" (${digits.length} digit${digits.length !== 1 ? 's' : ''})`,
      suggestion: 'US phone numbers need exactly 10 digits',
    };
  }
  
  if (digits.length > 11) {
    return {
      severity: 'error',
      message: `Phone number too long: "${phone}" (${digits.length} digits)`,
      suggestion: 'Check for extra digits - should be 10 digits',
    };
  }
  
  // 11 digits with country code
  if (digits.length === 11 && digits[0] === '1') {
    return {
      severity: 'warning',
      message: 'Phone has country code +1',
      suggestion: 'Some forms expect 10 digits without country code',
      autoFix: digits.slice(1), // Remove the leading 1
    };
  }
  
  // Suggest proper formatting if not formatted
  if (digits.length === 10 && !phone.includes('(') && !phone.includes('-')) {
    return {
      severity: 'warning',
      message: 'Phone number could be formatted better',
      suggestion: 'Standard format: (555) 123-4567',
      autoFix: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
    };
  }
  
  return null;
}

/**
 * Zip code validation
 */
function isValidZipCode(zip: string): boolean {
  const digits = zip.replace(/\D/g, '');
  return digits.length === 5 || digits.length === 9;
}

/**
 * URL validation
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check if domain is trusted for sensitive data
 */
function isTrustedSite(hostname: string): boolean {
  const trustedDomains = [
    'irs.gov',
    'ssa.gov',
    'healthcare.gov',
    'usajobs.gov',
    // Add more trusted domains
  ];

  return trustedDomains.some(domain => hostname.endsWith(domain));
}

