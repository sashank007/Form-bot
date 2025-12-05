/**
 * Event Simulator - Simulates real user typing for framework compatibility
 * Works with React, Angular, Vue, Svelte, and vanilla JS
 */

/**
 * Simulate real user typing with all necessary events
 */
export function simulateTyping(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement,
  value: string
): void {
  console.log('Event Simulator: Simulating typing for', element.tagName, 'type:', element.getAttribute('type'), 'role:', element.getAttribute('role'));

  if ('focus' in element && typeof element.focus === 'function') {
    element.focus();
  }

  element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

  if ((element as HTMLElement).isContentEditable) {
    simulateContentEditableTyping(element as HTMLElement, value);
    return;
  }

  if (element.getAttribute('role') === 'listbox' || element.getAttribute('role') === 'combobox') {
    simulateListboxSelect(element as HTMLElement, value);
    return;
  }

  if (element.tagName === 'SELECT') {
    simulateSelectChange(element as HTMLSelectElement, value);
    return;
  }

  if ('value' in element) {
    simulateInputTyping(element as HTMLInputElement | HTMLTextAreaElement, value);
  }
}

/**
 * Convert various date formats to YYYY-MM-DD for HTML date inputs
 */
function formatDateForInput(value: string): string {
  if (!value) return '';
  
  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  
  // Handle formats like DD/MM/YYYY or MM/DD/YYYY
  const slashOrDash = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slashOrDash) {
    const first = parseInt(slashOrDash[1]);
    const second = parseInt(slashOrDash[2]);
    const year = slashOrDash[3];
    
    let month: number, day: number;
    
    // Intelligently detect DD/MM vs MM/DD
    if (first > 12 && second <= 12) {
      // First is definitely day (DD/MM/YYYY)
      day = first;
      month = second;
    } else if (second > 12 && first <= 12) {
      // Second is definitely day (MM/DD/YYYY)
      month = first;
      day = second;
    } else {
      // Ambiguous - prefer DD/MM/YYYY (more common globally)
      day = first;
      month = second;
    }
    
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  
  // Handle YYYY/MM/DD or YYYY.MM.DD
  const yearFirst = value.match(/^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})$/);
  if (yearFirst) {
    const year = yearFirst[1];
    const month = yearFirst[2].padStart(2, '0');
    const day = yearFirst[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Try parsing with Date object as fallback
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  return value;
}

/**
 * Simulate typing for input/textarea elements
 */
function simulateInputTyping(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  // Store original value for comparison
  const originalValue = element.value;
  
  // Handle date/time inputs specially
  const inputType = (element as HTMLInputElement).type?.toLowerCase();
  if (inputType === 'date' || inputType === 'datetime-local' || inputType === 'month') {
    let formattedValue = value;
    
    if (inputType === 'date') {
      formattedValue = formatDateForInput(value);
    } else if (inputType === 'datetime-local') {
      const dateStr = formatDateForInput(value);
      formattedValue = dateStr ? `${dateStr}T00:00` : value;
    } else if (inputType === 'month') {
      const dateStr = formatDateForInput(value);
      formattedValue = dateStr ? dateStr.substring(0, 7) : value; // YYYY-MM
    }
    
    console.log('Event Simulator: Formatting', inputType, 'input:', value, '->', formattedValue);
    
    element.value = formattedValue;
    
    // For date inputs, also try valueAsDate for better compatibility
    if (inputType === 'date') {
      try {
        const dateObj = new Date(formattedValue + 'T00:00:00');
        if (!isNaN(dateObj.getTime())) {
          (element as HTMLInputElement).valueAsDate = dateObj;
        }
      } catch (e) {
        console.log('Event Simulator: valueAsDate failed, using string value');
      }
    }
    
    // Trigger events
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    
    console.log('Event Simulator:', inputType, 'input filled:', element.value);
    return;
  }

  // Clear existing value first
  element.value = '';

  // Trigger keydown for first character (signals start of input)
  element.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: value[0] || '',
  }));

  // Set the value (this is what actually changes the field)
  element.value = value;

  // Create and dispatch native input event (React listens to this)
  const nativeInputEvent = new Event('input', {
    bubbles: true,
    cancelable: true,
  });
  
  // Set native event properties for React
  Object.defineProperty(nativeInputEvent, 'target', { value: element, enumerable: true });
  Object.defineProperty(nativeInputEvent, 'currentTarget', { value: element, enumerable: true });
  
  element.dispatchEvent(nativeInputEvent);

  // Dispatch InputEvent (modern browsers)
  const inputEvent = new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    data: value,
    inputType: 'insertText',
  });
  element.dispatchEvent(inputEvent);

  // Trigger keyup (signals end of input)
  element.dispatchEvent(new KeyboardEvent('keyup', {
    bubbles: true,
    cancelable: true,
    key: value[value.length - 1] || '',
  }));

  // Trigger change event (important for form validation)
  const changeEvent = new Event('change', {
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(changeEvent);

  // Trigger blur event (completes the interaction)
  element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

  console.log('Event Simulator: Triggered events:', {
    from: originalValue,
    to: value,
    events: ['focus', 'keydown', 'input', 'InputEvent', 'keyup', 'change', 'blur'],
  });
}

/**
 * Simulate typing for contenteditable elements (Google Forms, etc.)
 */
function simulateContentEditableTyping(element: HTMLElement, value: string): void {
  // Clear existing content
  element.textContent = '';

  // Trigger keydown
  element.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: value[0] || '',
  }));

  // Set content
  element.textContent = value;

  // Trigger input events
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertText',
    data: value,
  }));

  // Trigger keyboard events
  element.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

  // Trigger change and blur
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

  console.log('Event Simulator: ContentEditable events triggered');
}

/**
 * Simulate select dropdown change
 */
function simulateSelectChange(element: HTMLSelectElement, value: string): void {
  const options = Array.from(element.options);
  const normalizedValue = value.toLowerCase().trim();
  
  // Month name mappings for flexible matching
  const monthMappings: Record<string, string[]> = {
    'january': ['jan', '01', '1'],
    'february': ['feb', '02', '2'],
    'march': ['mar', '03', '3'],
    'april': ['apr', '04', '4'],
    'may': ['may', '05', '5'],
    'june': ['jun', '06', '6'],
    'july': ['jul', '07', '7'],
    'august': ['aug', '08', '8'],
    'september': ['sep', 'sept', '09', '9'],
    'october': ['oct', '10'],
    'november': ['nov', '11'],
    'december': ['dec', '12'],
  };
  
  // Find all possible matches for months
  let searchValues = [normalizedValue];
  for (const [month, aliases] of Object.entries(monthMappings)) {
    if (normalizedValue === month || aliases.includes(normalizedValue)) {
      searchValues = [month, ...aliases, normalizedValue];
      break;
    }
  }
  
  // Try to find matching option
  let matchingOption = options.find(opt => {
    const optValue = opt.value.toLowerCase().trim();
    const optText = opt.text.toLowerCase().trim();
    
    return searchValues.some(sv => 
      optValue === sv || optText === sv ||
      optValue.includes(sv) || optText.includes(sv) ||
      sv.includes(optText)
    );
  });
  
  // If no match, try partial matching
  if (!matchingOption) {
    matchingOption = options.find(opt => 
      opt.value === value || 
      opt.text === value ||
      opt.value.toLowerCase() === normalizedValue ||
      opt.text.toLowerCase() === normalizedValue ||
      opt.text.toLowerCase().includes(normalizedValue) ||
      normalizedValue.includes(opt.text.toLowerCase())
    );
  }

  if (matchingOption) {
    element.selectedIndex = matchingOption.index;
    element.value = matchingOption.value;
    matchingOption.selected = true;
    console.log('Event Simulator: Matched dropdown option:', matchingOption.text, 'for value:', value);
  } else {
    element.value = value;
    console.log('Event Simulator: No exact match, setting value directly:', value);
  }

  element.dispatchEvent(new Event('focus', { bubbles: true }));
  element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

/**
 * Set native value (for React compatibility)
 * React uses a custom setter that our normal .value assignment might not trigger
 */
export function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value')?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (valueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter?.call(element, value);
  } else {
    valueSetter?.call(element, value);
  }
}

/**
 * Simulate selecting an option in ARIA listbox (Google Forms dropdowns)
 */
function simulateListboxSelect(element: HTMLElement, value: string): void {
  console.log('Event Simulator: Handling ARIA listbox/combobox');
  
  const options = (element as any)._formbot_options || [];
  
  const normalizedValue = value.toLowerCase().trim();
  const matchingOption = options.find((opt: any) => 
    opt.value.toLowerCase() === normalizedValue ||
    opt.text.toLowerCase() === normalizedValue ||
    opt.text.toLowerCase().includes(normalizedValue) ||
    normalizedValue.includes(opt.text.toLowerCase())
  );
  
  if (!matchingOption) {
    console.log('Event Simulator: No matching option found for:', value);
    tryDirectTextUpdate(element, value);
    return;
  }
  
  console.log('Event Simulator: Found matching option:', matchingOption.text);
  
  const optionElements = element.querySelectorAll('[role="option"]');
  const targetOption = Array.from(optionElements).find(opt => 
    opt.textContent?.trim() === matchingOption.text ||
    opt.getAttribute('data-value') === matchingOption.value
  );
  
  if (!targetOption) {
    console.log('Event Simulator: Option element not found, trying direct update');
    tryDirectTextUpdate(element, matchingOption.text);
    return;
  }
  
  element.focus();
  element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  
  element.click();
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  
  setTimeout(() => {
    (targetOption as HTMLElement).focus();
    (targetOption as HTMLElement).click();
    targetOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    targetOption.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    targetOption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    
    optionElements.forEach(opt => opt.setAttribute('aria-selected', 'false'));
    targetOption.setAttribute('aria-selected', 'true');
    
    tryDirectTextUpdate(element, matchingOption.text);
    
    element.setAttribute('aria-activedescendant', targetOption.id || '');
    
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: matchingOption.text }));
    element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    
    console.log('Event Simulator: Listbox option selected and UI updated');
  }, 150);
}

function tryDirectTextUpdate(element: HTMLElement, text: string): void {
  const possibleDisplays = [
    element.querySelector('[class*="selected"]'),
    element.querySelector('[class*="value"]'),
    element.querySelector('[class*="display"]'),
    element.querySelector('[class*="placeholder"]'),
    element.querySelector('input[type="hidden"]'),
    element.querySelector('input'),
    element.querySelector('span'),
    element.querySelector('div[data-value]'),
  ];
  
  for (const display of possibleDisplays) {
    if (display) {
      if (display.tagName === 'INPUT') {
        (display as HTMLInputElement).value = text;
        display.dispatchEvent(new Event('input', { bubbles: true }));
        display.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        display.textContent = text;
      }
      console.log('Event Simulator: Updated display element with text:', text);
      break;
    }
  }
}

/**
 * Enhanced fill with React/Angular support
 */
export function fillFieldWithEvents(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement,
  value: string
): void {
  // Try native value setter for React first
  if ('value' in element && element.tagName !== 'SELECT') {
    try {
      setNativeValue(element as HTMLInputElement | HTMLTextAreaElement, value);
    } catch (e) {
      // Fallback to normal assignment
      (element as HTMLInputElement | HTMLTextAreaElement).value = value;
    }
  }

  // Then simulate all typing events
  simulateTyping(element, value);
}

