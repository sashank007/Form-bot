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
const PREVIEW_ID_PREFIX = 'formbot-preview-';
const PREVIEW_CLASS = 'formbot-field-preview';

/**
 * Check if field is a large input (textarea or contenteditable)
 */
function isLargeField(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'textarea') {
    return true;
  }
  // Check if it's a contenteditable element that's likely a large field
  if ((element as HTMLElement).isContentEditable) {
    const rect = element.getBoundingClientRect();
    // Consider it large if height > 60px or width > 400px
    return rect.height > 60 || rect.width > 400;
  }
  return false;
}

/**
 * Flatten nested data structures (e.g., {rows: [{key: value}]} -> {key: value})
 */
function flattenDataForPreview(data: any): any {
  // If data has a 'rows' key with an array, flatten it
  if (data.rows && Array.isArray(data.rows) && data.rows.length > 0) {
    // Merge all rows into a single object (later rows override earlier ones)
    const flattened: any = {};
    for (const row of data.rows) {
      if (typeof row === 'object' && row !== null) {
        Object.assign(flattened, row);
      }
    }
    // Also include any top-level keys that aren't 'rows'
    for (const key in data) {
      if (key !== 'rows' && !(key in flattened)) {
        flattened[key] = data[key];
      }
    }
    return flattened;
  }
  
  return data;
}

/**
 * Create preview overlay that appears inside the input field
 */
async function createFieldPreview(detectedField: DetectedField, index: number): Promise<{ preview: HTMLElement; insertBtn: HTMLElement }> {
  const element = detectedField.field.element as HTMLElement;
  
  // Get fill value
  const savedData = await getPrimaryFormData();
  // Flatten nested data structures for preview
  const flattenedData = flattenDataForPreview(savedData);
  const fillValue = detectedField.matchedKey 
    ? getFillValue(
        detectedField.field,
        detectedField.fieldType,
        detectedField.matchedKey,
        flattenedData
      )
    : '';
  
  if (!fillValue) {
    return { preview: document.createElement('div'), insertBtn: document.createElement('button') };
  }
  
  const isLarge = isLargeField(element);
  
  // Create preview overlay that sits inside the input
  const preview = document.createElement('div');
  preview.id = `${PREVIEW_ID_PREFIX}${index}`;
  preview.className = PREVIEW_CLASS;
  if (isLarge) {
    preview.setAttribute('data-large', 'true');
  }
  
  // Create insert button
  const insertBtn = document.createElement('button');
  insertBtn.className = 'formbot-preview-insert-btn';
  insertBtn.textContent = isLarge ? '<textarea>' : 'Insert';
  insertBtn.setAttribute('type', 'button');
  
  // Create text overlay
  const textOverlay = document.createElement('div');
  textOverlay.className = 'formbot-preview-text-overlay';
  textOverlay.textContent = fillValue;
  
  preview.appendChild(textOverlay);
  preview.appendChild(insertBtn);
  
  // Add CSS styles if not already added
  if (!document.getElementById('formbot-preview-styles')) {
    const style = document.createElement('style');
    style.id = 'formbot-preview-styles';
    style.textContent = `
      .formbot-field-preview {
        position: absolute !important;
        pointer-events: none !important;
        z-index: 999999 !important;
        display: none !important;
        width: 100% !important;
        height: 100% !important;
        top: 0 !important;
        left: 0 !important;
        overflow: hidden !important;
      }
      .formbot-preview-text-overlay {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        padding: inherit !important;
        margin: 0 !important;
        border: none !important;
        background: transparent !important;
        color: rgba(139, 92, 246, 0.65) !important;
        font-family: inherit !important;
        font-size: inherit !important;
        font-weight: inherit !important;
        line-height: inherit !important;
        text-align: inherit !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        pointer-events: none !important;
        animation: formbot-matrix-glitch 2s ease-in-out infinite !important;
        text-shadow: 
          0 0 2px rgba(139, 92, 246, 0.6),
          0 0 4px rgba(139, 92, 246, 0.4),
          0 0 8px rgba(139, 92, 246, 0.2),
          0 0 12px rgba(139, 92, 246, 0.1) !important;
        filter: blur(0.4px) brightness(1.1) !important;
        box-sizing: border-box !important;
      }
      .formbot-preview-insert-btn {
        position: absolute !important;
        right: 4px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        padding: 4px 8px !important;
        background: rgba(139, 92, 246, 0.9) !important;
        color: white !important;
        border: none !important;
        border-radius: 4px !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        pointer-events: auto !important;
        z-index: 1000000 !important;
        font-family: 'Courier New', monospace !important;
        box-shadow: 0 2px 8px rgba(139, 92, 246, 0.4) !important;
        transition: all 0.2s ease !important;
        opacity: 0.9 !important;
      }
      .formbot-preview-insert-btn:hover {
        background: rgba(124, 58, 237, 0.95) !important;
        opacity: 1 !important;
        transform: translateY(-50%) scale(1.05) !important;
        box-shadow: 0 4px 12px rgba(139, 92, 246, 0.6) !important;
      }
      @keyframes formbot-matrix-glitch {
        0%, 100% {
          opacity: 0.6;
          filter: blur(0.3px) brightness(1);
          transform: translateX(0);
        }
        25% {
          opacity: 0.7;
          filter: blur(0.2px) brightness(1.1);
          transform: translateX(0.5px);
        }
        50% {
          opacity: 0.65;
          filter: blur(0.4px) brightness(0.95);
          transform: translateX(-0.5px);
        }
        75% {
          opacity: 0.7;
          filter: blur(0.2px) brightness(1.05);
          transform: translateX(0.3px);
        }
      }
      textarea + .formbot-field-preview,
      [contenteditable="true"] + .formbot-field-preview {
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
      }
      textarea ~ .formbot-field-preview .formbot-preview-text-overlay,
      [contenteditable="true"] ~ .formbot-field-preview .formbot-preview-text-overlay {
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
      }
      .formbot-field-preview[data-large="true"] .formbot-preview-text-overlay {
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }
  
  return { preview, insertBtn };
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Position preview overlay inside the input field
 */
function positionPreview(preview: HTMLElement, field: HTMLElement) {
  const fieldRect = field.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  
  // Position preview exactly over the input field
  preview.style.top = `${fieldRect.top + scrollTop}px`;
  preview.style.left = `${fieldRect.left + scrollLeft}px`;
  preview.style.width = `${fieldRect.width}px`;
  preview.style.height = `${fieldRect.height}px`;
  
  // Match padding and styling of the input
  const computedStyle = window.getComputedStyle(field);
  const paddingTop = computedStyle.paddingTop;
  const paddingLeft = computedStyle.paddingLeft;
  const paddingRight = computedStyle.paddingRight;
  const paddingBottom = computedStyle.paddingBottom;
  const fontSize = computedStyle.fontSize;
  const fontFamily = computedStyle.fontFamily;
  const lineHeight = computedStyle.lineHeight;
  const textAlign = computedStyle.textAlign;
  
  const textOverlay = preview.querySelector('.formbot-preview-text-overlay') as HTMLElement;
  if (textOverlay) {
    textOverlay.style.paddingTop = paddingTop;
    textOverlay.style.paddingLeft = paddingLeft;
    textOverlay.style.paddingRight = paddingRight;
    textOverlay.style.paddingBottom = paddingBottom;
    textOverlay.style.fontSize = fontSize;
    textOverlay.style.fontFamily = fontFamily;
    textOverlay.style.lineHeight = lineHeight;
    textOverlay.style.textAlign = textAlign;
    
    // For large fields, allow wrapping
    if (preview.getAttribute('data-large') === 'true') {
      textOverlay.style.whiteSpace = 'pre-wrap';
      textOverlay.style.wordWrap = 'break-word';
      textOverlay.style.overflowY = 'auto';
    }
  }
}

/**
 * Create inline fill button for a field
 */
export async function createInlineButton(detectedField: DetectedField, index: number): Promise<{ button: HTMLButtonElement; preview: HTMLElement }> {
  const button = document.createElement('button');
  button.id = `${BUTTON_ID_PREFIX}${index}`;
  button.className = BUTTON_CLASS;
  button.setAttribute('type', 'button');
  button.setAttribute('aria-label', 'Auto-fill this field');
  button.title = `Fill with saved data (${detectedField.confidence}% confidence)`;
  
  // Add beaver icon
  const beaverIconUrl = chrome.runtime.getURL('icons/formbot_head.png');
  button.innerHTML = `
    <img src="${beaverIconUrl}" alt="Fill" style="width: 36px; height: 36px; object-fit: contain; display: block;" />
  `;
  
  // Style the button
  Object.assign(button.style, {
    position: 'absolute',
    zIndex: '999999',
    width: '44px',
    height: '44px',
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
  
  // Create preview overlay
  const { preview, insertBtn } = await createFieldPreview(detectedField, index);
  
  // Set up insert button handler
  insertBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    preview.style.display = 'none';
    await fillSingleField(detectedField, button);
  });
  
  // Show preview when field or button is hovered/focused
  const showPreview = () => {
    if (preview && preview.querySelector('.formbot-preview-text-overlay')?.textContent) {
      positionPreview(preview, detectedField.field.element as HTMLElement);
      preview.style.display = 'block';
    }
  };
  
  const hidePreview = () => {
    if (preview) {
      preview.style.display = 'none';
    }
  };
  
  // Hover effect on button
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.15)';
    button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25)';
    button.style.borderColor = '#8B5CF6';
    showPreview();
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
    button.style.borderColor = '#000000';
    // Hide preview with delay
    setTimeout(() => {
      if (!preview.matches(':hover')) {
        hidePreview();
      }
    }, 100);
  });
  
  // Keep preview visible when hovering over it
  preview.addEventListener('mouseenter', () => {
    showPreview();
  });
  
  preview.addEventListener('mouseleave', () => {
    setTimeout(() => {
      if (!button.matches(':hover')) {
        hidePreview();
      }
    }, 100);
  });
  
  // Click handler
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Inline button clicked for field:', detectedField.field.label || detectedField.field.name);
    console.log('Matched key:', detectedField.matchedKey, 'Confidence:', detectedField.confidence);
    try {
      await fillSingleField(detectedField, button);
      preview.style.display = 'none';
    } catch (error) {
      console.error('Inline button fill failed:', error);
    }
  });
  
  return { button, preview };
}

/**
 * Position button next to field
 */
export function positionButton(button: HTMLButtonElement, field: HTMLElement) {
  const rect = field.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  
  // Position to the right of the field
  const top = rect.top + scrollTop + (rect.height - 44) / 2;
  const left = rect.right + scrollLeft + 8;
  
  button.style.top = `${top}px`;
  button.style.left = `${left}px`;
  button.style.display = 'block';
}

/**
 * Show button when field is focused or hovered
 */
export function attachButtonListeners(detectedField: DetectedField, button: HTMLButtonElement, preview: HTMLElement) {
  const field = detectedField.field.element as HTMLElement;
  
  const showButton = () => {
    if (detectedField.confidence >= 50) { // Only show if we have some confidence
      positionButton(button, field);
      // Show preview overlay inside the field
      if (preview.querySelector('.formbot-preview-text-overlay')?.textContent) {
        positionPreview(preview, field);
        preview.style.display = 'block';
      }
    }
  };
  
  const hideButton = () => {
    button.style.display = 'none';
    preview.style.display = 'none';
  };
  
  // Show on focus
  field.addEventListener('focus', showButton);
  
  // Show on hover
  field.addEventListener('mouseenter', showButton);
  
  // Hide when mouse leaves both field and button
  let hideTimeout: number;
  
  field.addEventListener('mouseleave', () => {
    hideTimeout = window.setTimeout(() => {
      if (!button.matches(':hover') && !preview.matches(':hover')) {
        hideButton();
      }
    }, 300);
  });
  
  button.addEventListener('mouseenter', () => {
    clearTimeout(hideTimeout);
    showButton();
  });
  
  preview.addEventListener('mouseenter', () => {
    clearTimeout(hideTimeout);
  });
  
  button.addEventListener('mouseleave', () => {
    if (!field.matches(':focus, :hover') && !preview.matches(':hover')) {
      hideButton();
    }
  });
  
  preview.addEventListener('mouseleave', () => {
    if (!field.matches(':focus, :hover') && !button.matches(':hover')) {
      hideButton();
    }
  });
  
  // Hide on blur
  field.addEventListener('blur', (e) => {
    setTimeout(() => {
      if (!button.matches(':hover') && !preview.matches(':hover') && !field.matches(':hover')) {
        hideButton();
      }
    }, 200);
  });
  
  // Reposition on scroll
  window.addEventListener('scroll', () => {
    if (button.style.display === 'block') {
      positionButton(button, field);
      if (preview.style.display === 'block') {
        positionPreview(preview, field);
      }
    }
  }, { passive: true });
  
  // Reposition on resize
  window.addEventListener('resize', () => {
    if (button.style.display === 'block') {
      positionButton(button, field);
      if (preview.style.display === 'block') {
        positionPreview(preview, field);
      }
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
  
  // Flatten nested data structures (e.g., Google Sheets rows format)
  const flattenedData = flattenDataForPreview(savedData);
  console.log('Flattened data keys:', Object.keys(flattenedData));
  
  const fillValue = getFillValue(
    detectedField.field,
    detectedField.fieldType,
    detectedField.matchedKey,
    flattenedData
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
 * Remove all inline buttons and previews
 */
export function removeAllInlineButtons() {
  const buttons = document.querySelectorAll(`.${BUTTON_CLASS}`);
  buttons.forEach(btn => btn.remove());
  
  const previews = document.querySelectorAll(`.${PREVIEW_CLASS}`);
  previews.forEach(preview => preview.remove());
}

/**
 * Setup inline buttons for all detected fields
 */
export async function setupInlineButtons(detectedFields: DetectedField[]) {
  // Remove existing buttons first
  removeAllInlineButtons();
  
  for (let index = 0; index < detectedFields.length; index++) {
    const detectedField = detectedFields[index];
    
    // Skip password fields and very low confidence
    if (detectedField.fieldType === 'password' || detectedField.confidence < 50) {
      continue;
    }
    
    const { button, preview } = await createInlineButton(detectedField, index);
    document.body.appendChild(button);
    document.body.appendChild(preview);
    attachButtonListeners(detectedField, button, preview);
  }
}

