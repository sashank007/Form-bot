/**
 * Inline auto-fill button functionality
 */

import { DetectedField } from '../types';
import { getFillValue } from './fieldMatcher';
import { getPrimaryFormData } from '../utils/storage';
import { showFieldEditor, isComplexValue } from './fieldEditor';
import { fillFieldWithEvents } from '../utils/eventSimulator';

const BUTTON_ID_PREFIX = 'formbot-inline-btn-';
const BUTTON_CLASS = 'formbot-inline-button';

/**
 * Create inline fill button for a field
 */
export function createInlineButton(detectedField: DetectedField, index: number): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = `${BUTTON_ID_PREFIX}${index}`;
  button.className = BUTTON_CLASS;
  button.setAttribute('type', 'button');
  button.setAttribute('aria-label', 'Auto-fill this field');
  button.title = `Fill with saved data (${detectedField.confidence}% confidence)`;
  
  // Add beaver icon
  const beaverIconUrl = chrome.runtime.getURL('icons/beaver_head.png');
  button.innerHTML = `
    <img src="${beaverIconUrl}" alt="Fill" style="width: 24px; height: 24px; object-fit: contain; display: block;" />
  `;
  
  // Style the button
  Object.assign(button.style, {
    position: 'absolute',
    zIndex: '999999',
    width: '32px',
    height: '32px',
    padding: '4px',
    background: 'white',
    border: '2px solid #000000',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'none',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
    transition: 'all 0.2s ease',
    outline: 'none',
  });
  
  // Hover effect
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.15)';
    button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25)';
    button.style.borderColor = '#8B5CF6';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
    button.style.borderColor = '#000000';
  });
  
  // Click handler
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Inline button clicked for field:', detectedField.field.label || detectedField.field.name);
    console.log('Matched key:', detectedField.matchedKey, 'Confidence:', detectedField.confidence);
    try {
      await fillSingleField(detectedField, button);
    } catch (error) {
      console.error('Inline button fill failed:', error);
    }
  });
  
  return button;
}

/**
 * Position button next to field
 */
export function positionButton(button: HTMLButtonElement, field: HTMLElement) {
  const rect = field.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  
  // Position to the right of the field
  const top = rect.top + scrollTop + (rect.height - 28) / 2;
  const left = rect.right + scrollLeft + 8;
  
  button.style.top = `${top}px`;
  button.style.left = `${left}px`;
  button.style.display = 'block';
}

/**
 * Show button when field is focused or hovered
 */
export function attachButtonListeners(detectedField: DetectedField, button: HTMLButtonElement) {
  const field = detectedField.field.element as HTMLElement;
  
  const showButton = () => {
    if (detectedField.confidence >= 50) { // Only show if we have some confidence
      positionButton(button, field);
    }
  };
  
  const hideButton = () => {
    button.style.display = 'none';
  };
  
  // Show on focus
  field.addEventListener('focus', showButton);
  
  // Show on hover
  field.addEventListener('mouseenter', showButton);
  
  // Hide when mouse leaves both field and button
  let hideTimeout: number;
  
  field.addEventListener('mouseleave', () => {
    hideTimeout = window.setTimeout(() => {
      if (!button.matches(':hover')) {
        hideButton();
      }
    }, 300);
  });
  
  button.addEventListener('mouseenter', () => {
    clearTimeout(hideTimeout);
  });
  
  button.addEventListener('mouseleave', () => {
    if (!field.matches(':focus, :hover')) {
      hideButton();
    }
  });
  
  // Hide on blur
  field.addEventListener('blur', (e) => {
    setTimeout(() => {
      if (!button.matches(':hover') && !field.matches(':hover')) {
        hideButton();
      }
    }, 200);
  });
  
  // Reposition on scroll
  window.addEventListener('scroll', () => {
    if (button.style.display === 'block') {
      positionButton(button, field);
    }
  }, { passive: true });
  
  // Reposition on resize
  window.addEventListener('resize', () => {
    if (button.style.display === 'block') {
      positionButton(button, field);
    }
  }, { passive: true });
}

/**
 * Fill a single field
 */
async function fillSingleField(detectedField: DetectedField, button: HTMLButtonElement) {
  console.log('fillSingleField called');
  
  if (!detectedField.matchedKey) {
    console.error('No matched key for field');
    return;
  }
  
  console.log('Getting data for key:', detectedField.matchedKey);
  const savedData = await getPrimaryFormData();
  console.log('Primary data keys:', Object.keys(savedData));
  
  const fillValue = getFillValue(
    detectedField.field,
    detectedField.fieldType,
    detectedField.matchedKey,
    savedData
  );
  
  if (!fillValue) {
    console.error('No fill value found for key:', detectedField.matchedKey);
    return;
  }
  
  console.log('Fill value found, length:', fillValue.length, 'Complex:', isComplexValue(fillValue));
  
  const element = detectedField.field.element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;
  
  // Check if value is complex (needs editing)
  if (isComplexValue(fillValue)) {
    console.log('Showing field editor for complex value');
    // Show editor for user to customize
    showFieldEditor({
      fieldElement: element,
      suggestedValue: fillValue,
      fieldLabel: detectedField.field.label || detectedField.field.name || 'Field',
      onConfirm: (editedValue) => {
        console.log('Editor confirmed, filling with edited value');
        performFill(element, editedValue);
        showFillSuccess(button);
      },
      onCancel: () => {
        console.log('Editor cancelled');
      },
    });
    return;
  }
  
  // Simple value - fill directly
  console.log('Filling directly (simple value)');
  performFill(element, fillValue);
  showFillSuccess(button);
}

/**
 * Perform the actual fill operation
 */
function performFill(element: HTMLElement, value: string) {
  // Fill with proper event simulation (React/Angular compatible)
  fillFieldWithEvents(element as any, value);
  
  // Add highlight to field
  element.classList.add('formbot-highlight-success');
  setTimeout(() => {
    element.classList.remove('formbot-highlight-success');
  }, 1500);
}

/**
 * Show success animation on button
 */
function showFillSuccess(button: HTMLButtonElement) {
  const originalBg = button.style.background;
  const originalHTML = button.innerHTML;
  
  // Change to checkmark
  button.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
  `;
  button.style.background = '#10B981';
  
  // Reset after animation
  setTimeout(() => {
    button.innerHTML = originalHTML;
    button.style.background = originalBg;
  }, 1500);
}

/**
 * Remove all inline buttons
 */
export function removeAllInlineButtons() {
  const buttons = document.querySelectorAll(`.${BUTTON_CLASS}`);
  buttons.forEach(btn => btn.remove());
}

/**
 * Setup inline buttons for all detected fields
 */
export function setupInlineButtons(detectedFields: DetectedField[]) {
  // Remove existing buttons first
  removeAllInlineButtons();
  
  detectedFields.forEach((detectedField, index) => {
    // Skip password fields and very low confidence
    if (detectedField.fieldType === 'password' || detectedField.confidence < 50) {
      return;
    }
    
    const button = createInlineButton(detectedField, index);
    document.body.appendChild(button);
    attachButtonListeners(detectedField, button);
  });
}

