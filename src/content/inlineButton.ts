/**
 * Inline auto-fill button functionality
 */

import { DetectedField } from '../types';
import { getFillValue } from './fieldMatcher';
import { getPrimaryFormData } from '../utils/storage';

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
  
  // Add icon
  button.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
    </svg>
  `;
  
  // Style the button
  Object.assign(button.style, {
    position: 'absolute',
    zIndex: '999999',
    width: '28px',
    height: '28px',
    padding: '4px',
    background: 'linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'none',
    boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
    transition: 'all 0.2s ease',
    outline: 'none',
  });
  
  // Hover effect
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.1)';
    button.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.5)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '0 2px 8px rgba(139, 92, 246, 0.3)';
  });
  
  // Click handler
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await fillSingleField(detectedField, button);
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
  if (!detectedField.matchedKey) {
    return;
  }
  
  const savedData = await getPrimaryFormData();
  const fillValue = getFillValue(
    detectedField.field,
    detectedField.fieldType,
    detectedField.matchedKey,
    savedData
  );
  
  if (!fillValue) {
    return;
  }
  
  const element = detectedField.field.element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;
  
  // Fill the field
  if ('value' in element) {
    (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = fillValue;
  } else if ((element as HTMLElement).isContentEditable) {
    (element as HTMLElement).textContent = fillValue;
  }
  
  // Trigger events
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  
  if ((element as HTMLElement).isContentEditable) {
    element.dispatchEvent(new Event('keyup', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  
  // Visual feedback
  showFillSuccess(button);
  
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
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

