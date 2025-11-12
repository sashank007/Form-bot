/**
 * Inline field editor for complex/long form data
 */

import { formatParsedData } from './fieldEditorUtils';

export interface FieldEditorOptions {
  fieldElement: HTMLElement;
  suggestedValue: string;
  fieldLabel: string;
  onConfirm: (editedValue: string) => void;
  onCancel: () => void;
}

const EDITOR_ID = 'formbot-field-editor';

/**
 * Show editable text box next to a field
 */
export function showFieldEditor(options: FieldEditorOptions) {
  // Remove any existing editor
  hideFieldEditor();

  const editor = createEditorElement(options);
  document.body.appendChild(editor);
  
  // Position it
  positionEditor(editor, options.fieldElement);
  
  // Focus the textarea
  setTimeout(() => {
    const textarea = editor.querySelector('textarea');
    if (textarea) {
      textarea.focus();
      textarea.select();
    }
  }, 100);
  
  // Reposition on scroll/resize
  const repositionHandler = () => positionEditor(editor, options.fieldElement);
  window.addEventListener('scroll', repositionHandler, { passive: true });
  window.addEventListener('resize', repositionHandler, { passive: true });
  
  // Store handlers for cleanup
  (editor as any)._repositionHandler = repositionHandler;
}

/**
 * Create editor UI element
 */
function createEditorElement(options: FieldEditorOptions): HTMLElement {
  const container = document.createElement('div');
  container.id = EDITOR_ID;
  container.style.cssText = `
    position: absolute;
    z-index: 9999999;
    background: white;
    border: 2px solid #8B5CF6;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(139, 92, 246, 0.3);
    padding: 16px;
    min-width: 400px;
    max-width: 600px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // Clean the suggested value (remove quotes, parse JSON if needed)
  let cleanValue = options.suggestedValue;
  
  // First, check if it's already showing [object Object]
  if (cleanValue.includes('[object Object]')) {
    console.log('Form Bot: Detected [object Object] in value');
    cleanValue = 'Data format error - please edit in your profile settings';
  } else {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(cleanValue);
      cleanValue = formatParsedData(parsed);
      console.log('Form Bot: Successfully formatted data');
    } catch (e) {
      // Not valid JSON, might be already a string
      console.log('Form Bot: Not JSON, using as plain text');
      
      // Remove surrounding quotes if present
      cleanValue = cleanValue.replace(/^["']|["']$/g, '');
      
      // If still contains [object Object], show error message
      if (cleanValue.includes('[object Object]')) {
        cleanValue = 'Error: Data not properly formatted. Please edit this field in your profile (Data Management → Edit Profile)';
      }
    }
  }

  container.innerHTML = `
    <div style="margin-bottom: 8px;">
      <strong style="color: #333; font-size: 14px; display: block; margin-bottom: 4px;">
        ✏️ Edit Response
      </strong>
      <span style="color: #666; font-size: 12px;">
        ${options.fieldLabel || 'Field'}
      </span>
    </div>
    
    <textarea 
      id="formbot-editor-textarea"
      style="
        width: 100%;
        min-height: 150px;
        padding: 12px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 14px;
        font-family: inherit;
        line-height: 1.5;
        resize: vertical;
        margin-bottom: 12px;
      "
    >${cleanValue}</textarea>
    
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button 
        id="formbot-editor-cancel"
        style="
          padding: 8px 16px;
          background: #f3f4f6;
          border: none;
          border-radius: 6px;
          color: #374151;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        "
      >
        Cancel
      </button>
      <button 
        id="formbot-editor-confirm"
        style="
          padding: 8px 16px;
          background: linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%);
          border: none;
          border-radius: 6px;
          color: white;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s;
        "
      >
        ✓ Fill Field
      </button>
    </div>
    
    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 11px; margin: 0;">
        💡 Tip: Edit the text to customize your response, then click "Fill Field"
      </p>
    </div>
  `;

  // Add event listeners
  const confirmBtn = container.querySelector('#formbot-editor-confirm') as HTMLButtonElement;
  const cancelBtn = container.querySelector('#formbot-editor-cancel') as HTMLButtonElement;
  const textarea = container.querySelector('#formbot-editor-textarea') as HTMLTextAreaElement;

  confirmBtn.addEventListener('click', () => {
    const editedValue = textarea.value.trim();
    if (editedValue) {
      options.onConfirm(editedValue);
    }
    hideFieldEditor();
  });

  cancelBtn.addEventListener('click', () => {
    options.onCancel();
    hideFieldEditor();
  });

  // Keyboard shortcuts
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      options.onCancel();
      hideFieldEditor();
    }
    if (e.ctrlKey && e.key === 'Enter') {
      const editedValue = textarea.value.trim();
      if (editedValue) {
        options.onConfirm(editedValue);
      }
      hideFieldEditor();
    }
  });

  // Hover effects
  confirmBtn.addEventListener('mouseenter', () => {
    confirmBtn.style.transform = 'scale(1.05)';
  });
  confirmBtn.addEventListener('mouseleave', () => {
    confirmBtn.style.transform = 'scale(1)';
  });

  cancelBtn.addEventListener('mouseenter', () => {
    cancelBtn.style.background = '#e5e7eb';
  });
  cancelBtn.addEventListener('mouseleave', () => {
    cancelBtn.style.background = '#f3f4f6';
  });

  return container;
}

/**
 * Position editor near the field
 */
function positionEditor(editor: HTMLElement, fieldElement: HTMLElement) {
  const fieldRect = fieldElement.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  
  // Try to position to the right of the field
  let top = fieldRect.top + scrollTop;
  let left = fieldRect.right + scrollLeft + 16;
  
  // If not enough space on right, position below
  if (left + 400 > window.innerWidth) {
    left = fieldRect.left + scrollLeft;
    top = fieldRect.bottom + scrollTop + 8;
  }
  
  // If not enough space below, position above
  if (top + 300 > window.innerHeight + scrollTop) {
    top = fieldRect.top + scrollTop - 308;
  }
  
  editor.style.top = `${top}px`;
  editor.style.left = `${left}px`;
}

/**
 * Hide and remove the editor
 */
export function hideFieldEditor() {
  const editor = document.getElementById(EDITOR_ID);
  if (editor) {
    // Remove event listeners
    const repositionHandler = (editor as any)._repositionHandler;
    if (repositionHandler) {
      window.removeEventListener('scroll', repositionHandler);
      window.removeEventListener('resize', repositionHandler);
    }
    editor.remove();
  }
}

/**
 * Check if value is complex and needs editing UI
 */
export function isComplexValue(value: string): boolean {
  // Check if it's JSON
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object') {
      return true;
    }
  } catch (e) {
    // Not JSON
  }
  
  // Check if it's very long (>200 chars suggests it needs editing)
  if (value.length > 200) {
    return true;
  }
  
  return false;
}

