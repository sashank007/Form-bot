import { FormField, DetectedField } from '../types';

export interface DateComponentGroup {
  yearField: FormField | null;
  monthField: FormField | null;
  dayField: FormField | null;
  fullDateField?: FormField | null;
}

export interface ParsedDate {
  year: string;
  month: string;
  day: string;
  monthNumber: string;
}

export function detectDateComponentGroups(fields: FormField[]): DateComponentGroup[] {
  const groups: DateComponentGroup[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < fields.length; i++) {
    if (processed.has(i)) continue;

    const field = fields[i];
    const label = (field.label || field.name || '').toLowerCase();
    const name = (field.name || '').toLowerCase();
    const id = (field.id || '').toLowerCase();
    const fieldType = field.type.toLowerCase();

    const isDateRelated = 
      label.includes('date') || label.includes('birth') || label.includes('dob') ||
      name.includes('date') || name.includes('birth') || name.includes('dob') ||
      id.includes('date') || id.includes('birth') || id.includes('dob') ||
      fieldType === 'date';

    if (!isDateRelated) continue;

    const group: DateComponentGroup = {
      yearField: null,
      monthField: null,
      dayField: null,
      fullDateField: fieldType === 'date' || (fieldType === 'text' && !fieldType.includes('select')) ? field : null,
    };

    const nearbyFields = getNearbyFields(field, fields, i, 5);
    
    for (const nearby of nearbyFields) {
      if (processed.has(fields.indexOf(nearby))) continue;
      
      const nearbyLabel = (nearby.label || nearby.name || '').toLowerCase();
      const nearbyName = (nearby.name || '').toLowerCase();
      const nearbyId = (nearby.id || '').toLowerCase();
      const nearbyType = nearby.type.toLowerCase();

      if (nearbyType === 'select' || nearbyType === 'listbox') {
        if (isYearField(nearbyLabel, nearbyName, nearbyId)) {
          if (!group.yearField) {
            group.yearField = nearby;
            processed.add(fields.indexOf(nearby));
          }
        } else if (isMonthField(nearbyLabel, nearbyName, nearbyId)) {
          if (!group.monthField) {
            group.monthField = nearby;
            processed.add(fields.indexOf(nearby));
          }
        } else if (isDayField(nearbyLabel, nearbyName, nearbyId)) {
          if (!group.dayField) {
            group.dayField = nearby;
            processed.add(fields.indexOf(nearby));
          }
        }
      }
    }

    if (group.yearField || group.monthField || group.dayField || group.fullDateField) {
      groups.push(group);
      processed.add(i);
      console.log(`📅 [DATE] Detected date group: year=${!!group.yearField}, month=${!!group.monthField}, day=${!!group.dayField}, full=${!!group.fullDateField}`);
    }
  }

  return groups;
}

function getNearbyFields(field: FormField, allFields: FormField[], currentIndex: number, maxDistance: number = 5): FormField[] {
  const nearby: FormField[] = [];
  const fieldElement = field.element;
  const fieldRect = fieldElement.getBoundingClientRect();

  for (let i = 0; i < allFields.length; i++) {
    if (i === currentIndex) continue;

    const otherField = allFields[i];
    const otherRect = otherField.element.getBoundingClientRect();

    const verticalDistance = Math.abs(fieldRect.top - otherRect.top);
    const horizontalDistance = Math.abs(fieldRect.left - otherRect.left);
    
    if (verticalDistance < 100 && horizontalDistance < 500) {
      nearby.push(otherField);
    }
  }

  nearby.sort((a, b) => {
    const aRect = a.element.getBoundingClientRect();
    const bRect = b.element.getBoundingClientRect();
    const aDist = Math.abs(fieldRect.left - aRect.left);
    const bDist = Math.abs(fieldRect.left - bRect.left);
    return aDist - bDist;
  });

  return nearby.slice(0, maxDistance);
}

function isYearField(label: string, name: string, id: string): boolean {
  const combined = `${label} ${name} ${id}`;
  return combined.includes('year') || combined.includes('yr');
}

function isMonthField(label: string, name: string, id: string): boolean {
  const combined = `${label} ${name} ${id}`;
  return combined.includes('month') || combined.includes('mon');
}

function isDayField(label: string, name: string, id: string): boolean {
  const combined = `${label} ${name} ${id}`;
  return combined.includes('day') || combined.includes('date');
}

export function parseDate(dateValue: string): ParsedDate | null {
  if (!dateValue) return null;

  const trimmed = dateValue.trim();
  let date: Date | null = null;

  // Month name mappings
  const monthNames: Record<string, number> = {
    'january': 0, 'jan': 0, 'enero': 0, 'janvier': 0, 'januar': 0,
    'february': 1, 'feb': 1, 'febrero': 1, 'février': 1, 'februar': 1,
    'march': 2, 'mar': 2, 'marzo': 2, 'mars': 2, 'märz': 2,
    'april': 3, 'apr': 3, 'abril': 3, 'avril': 3,
    'may': 4, 'mayo': 4, 'mai': 4,
    'june': 5, 'jun': 5, 'junio': 5, 'juin': 5, 'juni': 5,
    'july': 6, 'jul': 6, 'julio': 6, 'juillet': 6, 'juli': 6,
    'august': 7, 'aug': 7, 'agosto': 7, 'août': 7,
    'september': 8, 'sep': 8, 'sept': 8, 'septiembre': 8, 'septembre': 8,
    'october': 9, 'oct': 9, 'octubre': 9, 'octobre': 9, 'oktober': 9,
    'november': 10, 'nov': 10, 'noviembre': 10, 'novembre': 10,
    'december': 11, 'dec': 11, 'diciembre': 11, 'décembre': 11, 'dezember': 11,
  };

  const parseMonthName = (str: string): number | null => {
    const lower = str.toLowerCase().replace(/[.,]/g, '');
    return monthNames[lower] ?? null;
  };

  const parseYear = (y: string): number => {
    const num = parseInt(y);
    if (y.length === 2) return num < 50 ? 2000 + num : 1900 + num;
    return num;
  };

  // ISO 8601: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T|$|\s)/);
  if (iso) {
    date = new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
  }

  // YYYY/MM/DD or YYYY.MM.DD
  if (!date) {
    const ymd = trimmed.match(/^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})$/);
    if (ymd) {
      date = new Date(parseInt(ymd[1]), parseInt(ymd[2]) - 1, parseInt(ymd[3]));
    }
  }

  // "Month DD, YYYY" or "Month DD YYYY" (e.g., "February 17, 2025")
  if (!date) {
    const monthFirst = trimmed.match(/^([a-zA-Zéûäöü]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{2,4})$/i);
    if (monthFirst) {
      const month = parseMonthName(monthFirst[1]);
      if (month !== null) {
        date = new Date(parseYear(monthFirst[3]), month, parseInt(monthFirst[2]));
      }
    }
  }

  // "DD Month YYYY" or "DD-Month-YYYY" (e.g., "17 February 2025", "17-Feb-2025")
  if (!date) {
    const dayFirst = trimmed.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-]([a-zA-Zéûäöü]+)[\s\-,](\d{2,4})$/i);
    if (dayFirst) {
      const month = parseMonthName(dayFirst[2]);
      if (month !== null) {
        date = new Date(parseYear(dayFirst[3]), month, parseInt(dayFirst[1]));
      }
    }
  }

  // "YYYY Month DD" (e.g., "2025 February 17")
  if (!date) {
    const yearFirst = trimmed.match(/^(\d{4})[\s\-]([a-zA-Zéûäöü]+)[\s\-](\d{1,2})$/i);
    if (yearFirst) {
      const month = parseMonthName(yearFirst[2]);
      if (month !== null) {
        date = new Date(parseInt(yearFirst[1]), month, parseInt(yearFirst[3]));
      }
    }
  }

  // Numeric formats with separators: handle DD/MM/YYYY vs MM/DD/YYYY intelligently
  if (!date) {
    const numeric = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (numeric) {
      const first = parseInt(numeric[1]);
      const second = parseInt(numeric[2]);
      const year = parseYear(numeric[3]);

      // Unambiguous cases
      if (first > 12 && second <= 12) {
        // First must be day (DD/MM/YYYY)
        date = new Date(year, second - 1, first);
      } else if (second > 12 && first <= 12) {
        // Second must be day (MM/DD/YYYY)
        date = new Date(year, first - 1, second);
      } else if (first > 31) {
        // Invalid day, might be YYYY at start? Skip
      } else if (second > 31) {
        // Invalid day
      } else {
        // Ambiguous: both <= 12 - prefer DD/MM/YYYY (more common globally)
        // But validate: if first <= 12 and seems like a valid month, use it
        date = new Date(year, second - 1, first); // DD/MM/YYYY
        if (isNaN(date.getTime())) {
          date = new Date(year, first - 1, second); // Try MM/DD/YYYY
        }
      }
    }
  }

  // YYYYMMDD (compact)
  if (!date) {
    const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) {
      date = new Date(parseInt(compact[1]), parseInt(compact[2]) - 1, parseInt(compact[3]));
    }
  }

  // DDMMYYYY (compact, European)
  if (!date) {
    const compactEU = trimmed.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (compactEU) {
      const day = parseInt(compactEU[1]);
      const month = parseInt(compactEU[2]);
      if (day <= 31 && month <= 12) {
        date = new Date(parseInt(compactEU[3]), month - 1, day);
      }
    }
  }

  // Unix timestamp (milliseconds)
  if (!date) {
    const timestamp = trimmed.match(/^(\d{13})$/);
    if (timestamp) {
      date = new Date(parseInt(timestamp[1]));
    }
  }

  // Unix timestamp (seconds)
  if (!date) {
    const timestampSec = trimmed.match(/^(\d{10})$/);
    if (timestampSec) {
      date = new Date(parseInt(timestampSec[1]) * 1000);
    }
  }

  // Fallback: let JavaScript try to parse it
  if (!date || isNaN(date.getTime())) {
    date = new Date(trimmed);
    if (isNaN(date.getTime())) {
      return null;
    }
  }

  // Validate the date is reasonable (year between 1900-2100)
  if (date.getFullYear() < 1900 || date.getFullYear() > 2100) {
    return null;
  }

  const year = date.getFullYear().toString();
  const monthNumber = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  const monthNamesList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const month = monthNamesList[date.getMonth()];

  return {
    year,
    month,
    day,
    monthNumber,
  };
}

export function findMatchingOption(
  select: HTMLSelectElement | HTMLElement,
  targetValue: string,
  matchType: 'exact' | 'contains' | 'fuzzy' = 'contains'
): HTMLOptionElement | HTMLElement | null {
  if (select.tagName === 'SELECT') {
    const htmlSelect = select as HTMLSelectElement;
    const options = Array.from(htmlSelect.options);

    for (const option of options) {
      const optionValue = option.value.toLowerCase().trim();
      const optionText = option.text.toLowerCase().trim();
      const target = targetValue.toLowerCase().trim();

      if (matchType === 'exact') {
        if (optionValue === target || optionText === target) {
          return option;
        }
      } else if (matchType === 'contains') {
        if (optionValue.includes(target) || optionText.includes(target) ||
            target.includes(optionValue) || target.includes(optionText)) {
          return option;
        }
      } else {
        if (optionValue === target || optionText === target ||
            optionValue.includes(target) || optionText.includes(target)) {
          return option;
        }
      }
    }
  } else {
    const options = select.querySelectorAll('[role="option"]');
    for (const option of options) {
      const optionText = option.textContent?.toLowerCase().trim() || '';
      const optionValue = option.getAttribute('data-value')?.toLowerCase().trim() || '';
      const target = targetValue.toLowerCase().trim();

      if (matchType === 'exact') {
        if (optionValue === target || optionText === target) {
          return option as HTMLElement;
        }
      } else if (matchType === 'contains') {
        if (optionValue.includes(target) || optionText.includes(target) ||
            target.includes(optionValue) || target.includes(optionText)) {
          return option as HTMLElement;
        }
      } else {
        if (optionValue === target || optionText === target ||
            optionValue.includes(target) || optionText.includes(target)) {
          return option as HTMLElement;
        }
      }
    }
  }

  return null;
}

export function fillDateComponent(
  field: FormField,
  value: string,
  componentType: 'year' | 'month' | 'day'
): boolean {
  const element = field.element as HTMLSelectElement | HTMLElement;

  if (element.tagName === 'SELECT') {
    const select = element as HTMLSelectElement;
    if (!select) return false;

    const options = Array.from(select.options);
    const normalizedValue = value.toLowerCase().trim();
    
    // First try exact match
    let bestMatch: HTMLOptionElement | null = null;
    
    if (componentType === 'year') {
      bestMatch = options.find(opt => 
        opt.value === value || opt.text === value ||
        opt.value.toLowerCase().trim() === normalizedValue ||
        opt.text.toLowerCase().trim() === normalizedValue
      ) || null;
    } else if (componentType === 'month') {
      const monthNum = parseInt(value);
      if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                          'july', 'august', 'september', 'october', 'november', 'december'];
        const monthName = monthNames[monthNum - 1];
        const monthAbbr = monthName.substring(0, 3);
        const monthNumStr = monthNum.toString();
        const monthNumPadded = monthNumStr.padStart(2, '0');

        bestMatch = options.find(opt => {
          const optValue = opt.value.toLowerCase().trim();
          const optText = opt.text.toLowerCase().trim();
          return optValue === monthName || optText === monthName ||
                 optText.includes(monthName) || optText.includes(monthAbbr) ||
                 optValue === monthNumStr || optValue === monthNumPadded ||
                 optText === monthNumStr || optText === monthNumPadded ||
                 optText === normalizedValue || optValue === normalizedValue;
        }) || null;
      } else {
        bestMatch = options.find(opt => 
          opt.value === value || opt.text === value ||
          opt.value.toLowerCase().trim() === normalizedValue ||
          opt.text.toLowerCase().trim() === normalizedValue ||
          opt.text.toLowerCase().includes(normalizedValue) ||
          opt.value.toLowerCase().includes(normalizedValue)
        ) || null;
      }
    } else if (componentType === 'day') {
      const dayNum = parseInt(value);
      if (!isNaN(dayNum)) {
        const dayStr = dayNum.toString();
        const dayPadded = dayStr.padStart(2, '0');
        
        bestMatch = options.find(opt => 
          opt.value === dayStr || opt.value === dayPadded ||
          opt.text === dayStr || opt.text === dayPadded ||
          opt.value === value || opt.text === value
        ) || null;
      } else {
        bestMatch = options.find(opt => 
          opt.value === value || opt.text === value ||
          opt.value.toLowerCase().trim() === normalizedValue ||
          opt.text.toLowerCase().trim() === normalizedValue
        ) || null;
      }
    }

    if (bestMatch) {
      // Set the value directly
      select.value = bestMatch.value;
      
      // Also set selectedIndex to ensure it's properly selected (important for Angular Material)
      select.selectedIndex = Array.from(select.options).indexOf(bestMatch);
      
      // Trigger events for Angular Material compatibility
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('input', { bubbles: true }));
      
      // For Angular Material, also trigger focus/blur
      select.dispatchEvent(new Event('focus', { bubbles: true }));
      select.dispatchEvent(new Event('blur', { bubbles: true }));
      
      console.log(`✅ [DATE] Filled ${componentType} dropdown: value="${bestMatch.value}", text="${bestMatch.text}"`);
      return true;
    } else {
      console.log(`⚠️ [DATE] No match found for ${componentType}: "${value}". Available options:`, 
        Array.from(select.options).slice(0, 5).map(o => `value="${o.value}" text="${o.text}"`).join(', '));
    }
  } else {
    const listbox = element as HTMLElement;
    const options = listbox.querySelectorAll('[role="option"]');
    const normalizedValue = value.toLowerCase().trim();
    
    for (const option of options) {
      const optionText = option.textContent?.toLowerCase().trim() || '';
      const optionValue = option.getAttribute('data-value')?.toLowerCase().trim() || '';
      
      let matches = false;
      
      if (componentType === 'year') {
        matches = optionValue === normalizedValue || optionText === normalizedValue ||
                  optionValue.includes(normalizedValue) || normalizedValue.includes(optionValue);
      } else if (componentType === 'month') {
        const monthNum = parseInt(value);
        if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                            'july', 'august', 'september', 'october', 'november', 'december'];
          const monthName = monthNames[monthNum - 1];
          matches = optionText.includes(monthName) || optionValue === monthNum.toString() ||
                    optionText === monthNum.toString() || optionText.includes(normalizedValue);
        } else {
          matches = optionText.includes(normalizedValue) || optionValue.includes(normalizedValue);
        }
      } else if (componentType === 'day') {
        const dayNum = parseInt(value);
        if (!isNaN(dayNum)) {
          matches = optionValue === dayNum.toString() || optionText === dayNum.toString() ||
                    optionValue === dayNum.toString().padStart(2, '0');
        } else {
          matches = optionText.includes(normalizedValue) || optionValue.includes(normalizedValue);
        }
      }

      if (matches) {
        listbox.click();
        setTimeout(() => {
          (option as HTMLElement).click();
          option.setAttribute('aria-selected', 'true');
          listbox.dispatchEvent(new Event('change', { bubbles: true }));
          listbox.dispatchEvent(new Event('input', { bubbles: true }));
        }, 50);
        
        console.log(`✅ [DATE] Filled ${componentType} listbox: ${optionText}`);
        return true;
      }
    }
  }

  console.log(`⚠️ [DATE] Could not find matching option for ${componentType}: ${value}`);
  return false;
}

