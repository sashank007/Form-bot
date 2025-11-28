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

  let date: Date | null = null;

  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // MM/DD/YYYY
    /^(\d{2})\/(\d{2})\/(\d{2})$/, // MM/DD/YY
    /^(\d{4})\/(\d{2})\/(\d{2})$/, // YYYY/MM/DD
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // M/D/YYYY
  ];

  for (const format of formats) {
    const match = dateValue.match(format);
    if (match) {
      if (format === formats[0]) {
        date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      } else if (format === formats[1] || format === formats[4]) {
        date = new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
      } else if (format === formats[2]) {
        const year = parseInt(match[3]) < 50 ? 2000 + parseInt(match[3]) : 1900 + parseInt(match[3]);
        date = new Date(year, parseInt(match[1]) - 1, parseInt(match[2]));
      } else if (format === formats[3]) {
        date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      }
      break;
    }
  }

  if (!date || isNaN(date.getTime())) {
    date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      return null;
    }
  }

  const year = date.getFullYear().toString();
  const monthNumber = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const month = monthNames[date.getMonth()];

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

