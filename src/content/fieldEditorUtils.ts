/**
 * Utility functions for field editor data formatting
 */

/**
 * Format parsed JSON data into readable text
 */
export function formatParsedData(data: any): string {
  if (Array.isArray(data)) {
    return formatArray(data);
  } else if (typeof data === 'object' && data !== null) {
    return formatObject(data);
  } else {
    return String(data);
  }
}

/**
 * Format an array to readable text
 */
function formatArray(arr: any[]): string {
  return arr.map((item, idx) => {
    if (typeof item === 'object' && item !== null) {
      return formatObject(item, idx + 1);
    } else {
      return String(item);
    }
  }).join('\n\n');
}

/**
 * Format an object to readable text
 */
function formatObject(obj: any, index?: number): string {
  const lines: string[] = [];
  
  if (index) {
    lines.push(`${index}.`);
  }
  
  // Common patterns for resume/project data
  if (obj.title || obj.name) {
    lines.push(obj.title || obj.name);
  }
  
  if (obj.company || obj.organization) {
    lines.push(`Company: ${obj.company || obj.organization}`);
  }
  
  if (obj.role || obj.position) {
    lines.push(`Role: ${obj.role || obj.position}`);
  }
  
  if (obj.year || obj.date || obj.duration) {
    lines.push(`Year: ${obj.year || obj.date || obj.duration}`);
  }
  
  if (obj.description || obj.details) {
    lines.push(obj.description || obj.details);
  }
  
  if (obj.technologies || obj.skills || obj.tech) {
    lines.push(`Technologies: ${obj.technologies || obj.skills || obj.tech}`);
  }
  
  if (obj.link || obj.url || obj.website) {
    lines.push(`Link: ${obj.link || obj.url || obj.website}`);
  }
  
  // If none of the common patterns matched, just stringify all properties
  if (lines.length === (index ? 1 : 0)) {
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined && value !== '') {
        lines.push(`${key}: ${formatValue(value)}`);
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * Format a value (handle nested objects/arrays)
 */
function formatValue(value: any): string {
  if (Array.isArray(value)) {
    return value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
  } else if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  } else {
    return String(value);
  }
}

