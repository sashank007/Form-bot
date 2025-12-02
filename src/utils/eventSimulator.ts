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
 * Simulate typing for input/textarea elements
 */
function simulateInputTyping(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  // Store original value for comparison
  const originalValue = element.value;

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
  const matchingOption = options.find(opt => 
    opt.value === value || 
    opt.text === value ||
    opt.value.toLowerCase() === value.toLowerCase() ||
    opt.text.toLowerCase() === value.toLowerCase() ||
    opt.text.toLowerCase().includes(value.toLowerCase()) ||
    value.toLowerCase().includes(opt.text.toLowerCase())
  );

  if (matchingOption) {
    element.selectedIndex = matchingOption.index;
    element.value = matchingOption.value;
    matchingOption.selected = true;
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event('focus', { bubbles: true }));
  
  element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  
  element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

  console.log('Event Simulator: Select change events triggered for:', matchingOption?.text || value);
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

