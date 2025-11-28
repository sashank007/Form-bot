/**
 * Extract contextual information around form fields to help disambiguate ambiguous fields
 */

import { FormField } from '../types';

export interface FieldContext {
  sectionHeader?: string;
  nearbyFields?: Array<{ label: string; name: string }>;
  formPurpose?: string;
  formType?: string;
}

/**
 * Extract section header by traversing DOM upward
 */
export function extractSectionHeader(element: HTMLElement): string | undefined {
  let current: HTMLElement | null = element.parentElement;
  let depth = 0;
  const maxDepth = 10;

  while (current && depth < maxDepth) {
    const heading = current.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
    if (heading && heading.textContent) {
      const text = heading.textContent.trim();
      if (text.length > 0 && text.length < 100) {
        return text;
      }
    }

    const legend = current.querySelector('legend');
    if (legend && legend.textContent) {
      const text = legend.textContent.trim();
      if (text.length > 0 && text.length < 100) {
        return text;
      }
    }

    const fieldset = current.closest('fieldset');
    if (fieldset) {
      const legend = fieldset.querySelector('legend');
      if (legend && legend.textContent) {
        const text = legend.textContent.trim();
        if (text.length > 0 && text.length < 100) {
          return text;
        }
      }
    }

    const sectionClass = current.className?.toString().toLowerCase() || '';
    const sectionId = current.id?.toLowerCase() || '';
    
    const sectionKeywords = ['section', 'group', 'panel', 'block', 'card', 'form-group', 'form-section'];
    for (const keyword of sectionKeywords) {
      if (sectionClass.includes(keyword) || sectionId.includes(keyword)) {
        const label = current.querySelector('label, .label, [class*="label"], [class*="title"], [class*="header"]');
        if (label && label.textContent) {
          const text = label.textContent.trim();
          if (text.length > 0 && text.length < 100) {
            return text;
          }
        }
        
        const ariaLabel = current.getAttribute('aria-label');
        if (ariaLabel && ariaLabel.length < 100) {
          return ariaLabel.trim();
        }
      }
    }

    current = current.parentElement;
    depth++;
  }

  return undefined;
}

/**
 * Extract nearby fields from the same container
 */
export function extractNearbyFields(
  element: HTMLElement,
  allFields: FormField[]
): Array<{ label: string; name: string }> {
  const nearbyFields: Array<{ label: string; name: string }> = [];
  
  const container = element.closest('form, fieldset, [role="group"], [class*="form"], [class*="section"]') || element.parentElement;
  if (!container) return nearbyFields;

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  
  const maxDistance = 500;
  
  for (const field of allFields) {
    if (field.element === element) continue;
    
    const fieldElement = field.element as HTMLElement;
    const fieldRect = fieldElement.getBoundingClientRect();
    
    const verticalDistance = Math.abs(fieldRect.top - elementRect.top);
    const horizontalDistance = Math.abs(fieldRect.left - elementRect.left);
    const distance = Math.sqrt(verticalDistance ** 2 + horizontalDistance ** 2);
    
    if (distance < maxDistance && container.contains(fieldElement)) {
      const label = field.label || field.name || '';
      if (label.length > 0) {
        nearbyFields.push({
          label: label,
          name: field.name || ''
        });
      }
    }
  }

  return nearbyFields.slice(0, 5);
}

/**
 * Infer form purpose from all fields combined
 */
export function inferFormPurpose(fields: FormField[]): { purpose?: string; type?: string } {
  const fieldLabels = fields.map(f => f.label || f.name || '').filter(l => l.length > 0).join(' ').toLowerCase();
  
  const formTypePatterns: Array<{ type: string; keywords: string[] }> = [
    { type: 'Job Application', keywords: ['resume', 'cv', 'cover letter', 'work experience', 'employment', 'position', 'salary', 'references'] },
    { type: 'Pet Registration', keywords: ['pet', 'dog', 'cat', 'breed', 'animal', 'veterinary', 'vaccination'] },
    { type: 'Personal Information', keywords: ['name', 'email', 'phone', 'address', 'date of birth', 'gender'] },
    { type: 'Contact Form', keywords: ['message', 'subject', 'inquiry', 'contact', 'feedback'] },
    { type: 'Registration', keywords: ['sign up', 'register', 'create account', 'username', 'password'] },
    { type: 'Survey', keywords: ['survey', 'question', 'rating', 'feedback', 'opinion'] },
    { type: 'Order Form', keywords: ['order', 'product', 'quantity', 'shipping', 'payment', 'billing'] },
    { type: 'Event Registration', keywords: ['event', 'ticket', 'attendee', 'conference', 'workshop'] },
  ];

  for (const pattern of formTypePatterns) {
    const matchCount = pattern.keywords.filter(keyword => fieldLabels.includes(keyword)).length;
    if (matchCount >= 2) {
      return {
        purpose: pattern.type,
        type: pattern.type.toLowerCase().replace(/\s+/g, '-')
      };
    }
  }

  const pageTitle = document.title.toLowerCase();
  for (const pattern of formTypePatterns) {
    if (pattern.keywords.some(keyword => pageTitle.includes(keyword))) {
      return {
        purpose: pattern.type,
        type: pattern.type.toLowerCase().replace(/\s+/g, '-')
      };
    }
  }

  return {};
}

/**
 * Extract comprehensive context for a field
 */
export function extractFieldContext(
  field: FormField,
  allFields: FormField[]
): FieldContext {
  const element = field.element as HTMLElement;
  
  const sectionHeader = extractSectionHeader(element);
  const nearbyFields = extractNearbyFields(element, allFields);
  const formInfo = inferFormPurpose(allFields);

  return {
    sectionHeader,
    nearbyFields: nearbyFields.length > 0 ? nearbyFields : undefined,
    formPurpose: formInfo.purpose,
    formType: formInfo.type,
  };
}

/**
 * Extract form-wide context
 */
export function extractFormWideContext(fields: FormField[]): { purpose?: string; type?: string; pageTitle?: string } {
  const formInfo = inferFormPurpose(fields);
  const pageTitle = document.title;

  return {
    purpose: formInfo.purpose,
    type: formInfo.type,
    pageTitle: pageTitle || undefined,
  };
}

