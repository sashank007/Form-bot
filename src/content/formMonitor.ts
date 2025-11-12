/**
 * Monitor form fill status to detect when form is almost complete
 */

import { FormField } from '../types';

/**
 * Calculate form fill percentage
 */
export function calculateFillPercentage(fields: FormField[]): number {
  if (fields.length === 0) return 0;

  const fillableFields = fields.filter(f => {
    const type = f.type.toLowerCase();
    return type !== 'submit' && type !== 'button' && type !== 'reset' && type !== 'hidden';
  });

  if (fillableFields.length === 0) return 0;

  const filledFields = fillableFields.filter(f => {
    if ('value' in f.element) {
      return (f.element as HTMLInputElement).value.trim().length > 0;
    } else if ((f.element as HTMLElement).isContentEditable) {
      return (f.element as HTMLElement).textContent?.trim().length || 0 > 0;
    }
    return false;
  });

  return (filledFields.length / fillableFields.length) * 100;
}

/**
 * Get current form field values
 */
export function getCurrentFormValues(fields: FormField[]): { [key: string]: string } {
  const values: { [key: string]: string } = {};

  fields.forEach(field => {
    const key = field.name || field.id || field.label || `field_${field.xpath}`;
    let value = '';

    if ('value' in field.element) {
      value = (field.element as HTMLInputElement).value;
    } else if ((field.element as HTMLElement).isContentEditable) {
      value = (field.element as HTMLElement).textContent || '';
    }

    if (value.trim()) {
      values[key] = value.trim();
    }
  });

  return values;
}

/**
 * Get field structure for template matching
 */
export function getFieldStructure(fields: FormField[]): string[] {
  return fields.map(f => {
    if (f.label) return f.label;
    if (f.placeholder) return f.placeholder;
    if (f.name) return f.name;
    if (f.id) return f.id;
    return f.type;
  }).filter(s => s && s.length > 0);
}

/**
 * Monitor form for changes and check fill status
 */
export function startFormMonitoring(
  fields: FormField[],
  onFillThresholdReached: (percentage: number) => void,
  threshold: number = 60
): () => void {
  let lastPercentage = 0;
  let thresholdReached = false;

  const checkFillStatus = () => {
    const percentage = calculateFillPercentage(fields);

    if (percentage >= threshold && !thresholdReached && percentage !== lastPercentage) {
      thresholdReached = true;
      onFillThresholdReached(percentage);
    }

    lastPercentage = percentage;
  };

  // Check on each input change
  const handleInput = () => {
    setTimeout(checkFillStatus, 300); // Debounce
  };

  fields.forEach(field => {
    field.element.addEventListener('input', handleInput);
    field.element.addEventListener('change', handleInput);
  });

  // Initial check
  checkFillStatus();

  // Return cleanup function
  return () => {
    fields.forEach(field => {
      field.element.removeEventListener('input', handleInput);
      field.element.removeEventListener('change', handleInput);
    });
  };
}

