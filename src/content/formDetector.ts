/**
 * Form detection and monitoring
 */

import { FormField } from '../types';
import { extractFieldContext } from '../utils/fieldContextExtractor';

/**
 * Get XPath for an element
 */
function getXPath(element: Element): string {
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }
  
  if (element === document.body) {
    return '/html/body';
  }
  
  let ix = 0;
  const siblings = element.parentNode?.childNodes || [];
  
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling === element) {
      const tagName = element.tagName.toLowerCase();
      const parent = element.parentNode as Element;
      return `${getXPath(parent)}/${tagName}[${ix + 1}]`;
    }
    if (sibling.nodeType === 1 && (sibling as Element).tagName === element.tagName) {
      ix++;
    }
  }
  
  return '';
}

/**
 * Get label text for an input element
 */
function getLabelForInput(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  // Check aria-labelledby first (Google Forms uses this)
  const ariaLabelledBy = input.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labelIds = ariaLabelledBy.split(' ');
    const labelTexts: string[] = [];
    for (const id of labelIds) {
      const labelElement = document.getElementById(id);
      if (labelElement && labelElement.textContent) {
        labelTexts.push(labelElement.textContent.trim());
      }
    }
    if (labelTexts.length > 0) {
      return labelTexts.join(' ');
    }
  }
  
  // Check for explicit label with for attribute
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) {
      return label.textContent?.trim() || '';
    }
  }
  
  // Check if input is inside a label
  const parentLabel = input.closest('label');
  if (parentLabel) {
    return parentLabel.textContent?.replace(input.value, '').trim() || '';
  }
  
  // Check for adjacent label
  const previousElement = input.previousElementSibling;
  if (previousElement && previousElement.tagName === 'LABEL') {
    return previousElement.textContent?.trim() || '';
  }
  
  // Check parent for label
  const parent = input.parentElement;
  if (parent) {
    const label = parent.querySelector('label');
    if (label) {
      return label.textContent?.trim() || '';
    }
  }
  
  // For Google Forms, try to find the question text from parent containers
  const questionContainer = input.closest('[role="listitem"]') || input.closest('.freebirdFormviewerComponentsQuestionBaseRoot');
  if (questionContainer) {
    const questionTitle = questionContainer.querySelector('[role="heading"]') || 
                         questionContainer.querySelector('.freebirdFormviewerComponentsQuestionBaseTitle');
    if (questionTitle && questionTitle.textContent) {
      return questionTitle.textContent.trim();
    }
  }
  
  return '';
}

/**
 * Extract form field information from an input element
 */
function extractFieldInfo(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): FormField {
  let label = getLabelForInput(element);
  
  // If label is generic (Google Forms), try to get from aria-labelledby
  if (!label || label === 'Your answer') {
    const ariaLabelledBy = element.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelIds = ariaLabelledBy.split(' ');
      const labelTexts: string[] = [];
      for (const id of labelIds) {
        const labelElement = document.getElementById(id);
        if (labelElement && labelElement.textContent) {
          labelTexts.push(labelElement.textContent.trim());
        }
      }
      if (labelTexts.length > 0) {
        label = labelTexts.join(' ');
      }
    }
  }
  
  return {
    element,
    type: element.getAttribute('type') || element.tagName.toLowerCase(),
    name: element.getAttribute('name') || '',
    id: element.id || '',
    placeholder: element.getAttribute('placeholder') || '',
    label: label,
    ariaLabel: element.getAttribute('aria-label') || '',
    value: element.value || '',
    xpath: getXPath(element),
  };
}

/**
 * Extract field information from contenteditable element (Google Forms, etc.)
 */
function extractContentEditableFieldInfo(element: HTMLElement): FormField {
  // Get the question/label text from aria-labelledby first
  let label = '';
  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labelIds = ariaLabelledBy.split(' ');
    const labelTexts: string[] = [];
    for (const id of labelIds) {
      const labelElement = document.getElementById(id);
      if (labelElement && labelElement.textContent) {
        labelTexts.push(labelElement.textContent.trim());
      }
    }
    if (labelTexts.length > 0) {
      label = labelTexts.join(' ');
    }
  }
  
  // Fallback to aria-label
  if (!label) {
    label = element.getAttribute('aria-label') || '';
  }
  
  // Try to find label from parent elements or siblings
  if (!label || label === 'Your answer') {
    const parent = element.closest('[role="listitem"]') || 
                   element.closest('[role="group"]') || 
                   element.closest('.freebirdFormviewerComponentsQuestionBaseRoot');
    if (parent) {
      const labelElement = parent.querySelector('[role="heading"]') || 
                          parent.querySelector('.freebirdFormviewerComponentsQuestionBaseTitle');
      if (labelElement && labelElement.textContent) {
        label = labelElement.textContent.trim();
      }
    }
  }
  
  // Create a pseudo-element that mimics input behavior
  return {
    element: element as any, // Treat as input-like element
    type: element.getAttribute('role') === 'textbox' ? 'text' : 'textarea',
    name: element.getAttribute('data-name') || element.id || '',
    id: element.id || '',
    placeholder: element.getAttribute('placeholder') || element.getAttribute('aria-placeholder') || '',
    label: label,
    ariaLabel: element.getAttribute('aria-label') || '',
    value: element.textContent?.trim() || '',
    xpath: getXPath(element),
  };
}

/**
 * Check if an element is visible and interactable
 */
function isElementVisible(element: HTMLElement): boolean {
  // Check offsetWidth and offsetHeight (most reliable for visibility)
  if (element.offsetWidth === 0 || element.offsetHeight === 0) {
    return false; // Element has no dimensions, therefore not visible
  }
  
  // Check offsetParent (null means element or ancestor is display:none)
  if (!element.offsetParent && element.tagName !== 'BODY') {
    return false; // Element is hidden
  }
  
  // Check computed styles
  const style = window.getComputedStyle(element);
  
  if (style.display === 'none') {
    return false;
  }
  
  if (style.visibility === 'hidden') {
    return false;
  }
  
  if (style.opacity === '0') {
    return false;
  }
  
  // Check if element is visually hidden (screen reader only)
  if (style.position === 'absolute' && 
      (style.clip === 'rect(0px, 0px, 0px, 0px)' || style.clip === 'rect(0, 0, 0, 0)')) {
    return false;
  }
  
  // Check if element is moved off-screen
  const rect = element.getBoundingClientRect();
  if (rect.top < -1000 || rect.left < -1000 || rect.bottom > window.innerHeight + 1000) {
    return false;
  }
  
  return true;
}

/**
 * Check if an input should be included (not hidden, not submit button, etc.)
 */
function shouldIncludeInput(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): boolean {
  const type = input.getAttribute('type')?.toLowerCase();
  
  // Exclude certain input types
  const excludedTypes = ['submit', 'button', 'reset', 'image', 'hidden', 'file'];
  if (type && excludedTypes.includes(type)) {
    return false;
  }
  
  // Exclude Form Bot's own elements
  if (input.id && input.id.startsWith('formbot-')) {
    return false;
  }
  
  if (input.closest('#formbot-field-editor') || input.closest('#formbot-loading-overlay')) {
    return false;
  }
  
  // Must be visible
  if (!isElementVisible(input as HTMLElement)) {
    return false;
  }
  
  // Must not be disabled or readonly (we'll still detect readonly but won't auto-fill)
  if (input.disabled) {
    return false;
  }
  
  return true;
}

/**
 * Check if a contenteditable element should be included
 */
function shouldIncludeContentEditable(element: HTMLElement): boolean {
  // Exclude Form Bot's own elements
  if (element.id && element.id.startsWith('formbot-')) {
    return false;
  }
  
  if (element.closest('#formbot-field-editor') || element.closest('#formbot-loading-overlay')) {
    return false;
  }
  
  // Must be visible
  if (!isElementVisible(element)) {
    return false;
  }
  
  // Check if it's a text input role
  const role = element.getAttribute('role');
  if (role && !['textbox', 'input'].includes(role)) {
    // Skip elements with other roles
    return false;
  }
  
  // Exclude if it's just a rich text editor or code editor (too complex)
  const className = element.className || '';
  if (className.includes('CodeMirror') || className.includes('monaco') || className.includes('ace_editor')) {
    return false;
  }
  
  // Must not be read-only
  if (element.getAttribute('aria-readonly') === 'true') {
    return false;
  }
  
  return true;
}

/**
 * Check if a listbox element should be included
 */
function shouldIncludeListbox(element: HTMLElement): boolean {
  // Must be visible
  if (!isElementVisible(element)) {
    return false;
  }
  
  // Must have options
  const options = element.querySelectorAll('[role="option"]');
  if (options.length === 0) {
    return false;
  }
  
  // Skip if read-only
  if (element.getAttribute('aria-readonly') === 'true' || element.getAttribute('aria-disabled') === 'true') {
    return false;
  }
  
  return true;
}

/**
 * Extract field information from listbox element (custom dropdown)
 */
function extractListboxFieldInfo(element: HTMLElement): FormField {
  // Get label from aria-labelledby
  let label = '';
  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labelIds = ariaLabelledBy.split(' ');
    const labelTexts: string[] = [];
    for (const id of labelIds) {
      const labelElement = document.getElementById(id);
      if (labelElement && labelElement.textContent) {
        labelTexts.push(labelElement.textContent.trim());
      }
    }
    if (labelTexts.length > 0) {
      label = labelTexts.join(' ');
    }
  }
  
  // Get current selected value
  const selectedOption = element.querySelector('[role="option"][aria-selected="true"]');
  const currentValue = selectedOption?.textContent?.trim() || '';
  
  // Get all available options
  const options = element.querySelectorAll('[role="option"]');
  const optionValues = Array.from(options).map(opt => ({
    value: opt.getAttribute('data-value') || opt.textContent?.trim() || '',
    text: opt.textContent?.trim() || '',
  }));
  
  // Store options in element for later use
  (element as any)._formbot_options = optionValues;
  
  return {
    element: element as any,
    type: 'listbox', // Custom type for listboxes
    name: element.getAttribute('jsname') || '',
    id: element.id || '',
    placeholder: '',
    label: label,
    ariaLabel: element.getAttribute('aria-label') || '',
    value: currentValue,
    xpath: getXPath(element),
  };
}

/**
 * Detect all form fields on the page
 */
export function detectFormFields(): FormField[] {
  const fields: FormField[] = [];
  
  // Get all input, textarea, and select elements
  const inputs = document.querySelectorAll<HTMLInputElement>('input');
  const textareas = document.querySelectorAll<HTMLTextAreaElement>('textarea');
  const selects = document.querySelectorAll<HTMLSelectElement>('select');
  
  // Get contenteditable elements (for Google Forms and similar)
  const contentEditables = document.querySelectorAll<HTMLElement>('[contenteditable="true"]');
  
  // Get ARIA listboxes (Google Forms custom dropdowns)
  const listboxes = document.querySelectorAll<HTMLElement>('[role="listbox"]');
  
  const allElements = [...inputs, ...textareas, ...selects];
  
  for (const element of allElements) {
    if (shouldIncludeInput(element)) {
      fields.push(extractFieldInfo(element));
    }
  }
  
  // Process contenteditable elements
  for (const element of contentEditables) {
    if (shouldIncludeContentEditable(element)) {
      fields.push(extractContentEditableFieldInfo(element));
    }
  }
  
  // Process listbox elements (custom dropdowns)
  for (const element of listboxes) {
    if (shouldIncludeListbox(element)) {
      fields.push(extractListboxFieldInfo(element));
    }
  }
  
  // Extract context for all fields
  if (fields.length > 0) {
    for (let i = 0; i < fields.length; i++) {
      fields[i].context = extractFieldContext(fields[i], fields);
    }
  }
  
  return fields;
}

/**
 * Count forms on the page
 */
export function countForms(): number {
  // Count actual form elements
  const formElements = document.querySelectorAll('form').length;
  
  // Also check for form-like structures (divs with multiple inputs)
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"])');
  
  // If we have inputs but no forms, count it as one implicit form
  if (inputs.length > 0 && formElements === 0) {
    return 1;
  }
  
  return formElements;
}

/**
 * Set up mutation observer to detect dynamically added forms
 */
export function observeFormChanges(callback: () => void): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    let hasFormChanges = false;
    
    for (const mutation of mutations) {
      // Check if any added nodes contain forms or inputs
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          if (
            element.matches('form, input, textarea, select') ||
            element.querySelector('form, input, textarea, select')
          ) {
            hasFormChanges = true;
            break;
          }
        }
      }
      
      if (hasFormChanges) break;
    }
    
    if (hasFormChanges) {
      // Debounce callback
      callback();
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  
  return observer;
}

/**
 * Get element by XPath
 */
export function getElementByXPath(xpath: string): Element | null {
  const result = document.evaluate(
    xpath,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  );
  return result.singleNodeValue as Element | null;
}

/**
 * Highlight a form field
 */
export function highlightField(
  element: HTMLElement,
  type: 'default' | 'success' | 'warning' = 'default'
): void {
  element.classList.remove('formbot-highlight', 'formbot-highlight-success', 'formbot-highlight-warning');
  
  switch (type) {
    case 'success':
      element.classList.add('formbot-highlight-success');
      break;
    case 'warning':
      element.classList.add('formbot-highlight-warning');
      break;
    default:
      element.classList.add('formbot-highlight');
  }
}

/**
 * Remove highlight from a field
 */
export function removeHighlight(element: HTMLElement): void {
  element.classList.remove('formbot-highlight', 'formbot-highlight-success', 'formbot-highlight-warning');
}

/**
 * Remove all highlights from the page
 */
export function removeAllHighlights(): void {
  const highlightedElements = document.querySelectorAll(
    '.formbot-highlight, .formbot-highlight-success, .formbot-highlight-warning'
  );
  highlightedElements.forEach(el => {
    el.classList.remove('formbot-highlight', 'formbot-highlight-success', 'formbot-highlight-warning');
  });
}

