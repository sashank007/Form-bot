/**
 * Content script - runs on all web pages
 */

import { Message, DetectedField, FormDetectionResult } from '../types';
import { detectFormFields, countForms, observeFormChanges, getElementByXPath, highlightField, removeHighlight, removeAllHighlights } from './formDetector';
import { matchFields, getFillValue } from './fieldMatcher';
import { getPrimaryFormData, saveLastFill, getLastFill, getSettings } from '../utils/storage';
import { setupInlineButtons, removeAllInlineButtons } from './inlineButton';
import { analyzeFieldsWithAI } from '../utils/aiFormAnalyzer';
import { extractProfileFromResume, fillFormFromProfile } from '../utils/resumeExtractor';

let detectedFields: DetectedField[] = [];
let formObserver: MutationObserver | null = null;

/**
 * Initialize content script
 */
function init() {
  console.log('Form Bot: Content script initialized');
  
  // Initial form detection
  detectAndNotify();
  
  // Set up observer for dynamic forms
  let debounceTimer: number;
  formObserver = observeFormChanges(() => {
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      detectAndNotify();
    }, 500);
  });
  
  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    handleMessage(message, sendResponse);
    return true; // Keep channel open for async response
  });
}

/**
 * Detect forms and notify background script
 */
async function detectAndNotify() {
  const fields = detectFormFields();
  const formCount = countForms();
  
  if (fields.length === 0) {
    detectedFields = [];
    return;
  }
  
  // Get saved data and match fields
  const savedData = await getPrimaryFormData();
  detectedFields = matchFields(fields, savedData);
  
  // Use AI to improve low-confidence matches
  const settings = await getSettings();
  if (settings.openAIEnabled && settings.openAIKey) {
    await enhanceWithAI(savedData);
  }
  
  // Setup inline buttons for fields
  if (settings.autoFillEnabled) {
    setupInlineButtons(detectedFields);
  }
  
  // Notify background script
  chrome.runtime.sendMessage({
    type: 'FORM_DETECTED',
    payload: {
      fields: detectedFields,
      formCount,
      url: window.location.href,
    } as FormDetectionResult,
  });
}

/**
 * Enhance field matching with AI for uncertain fields
 */
async function enhanceWithAI(savedData: any) {
  // Find fields with low confidence (<85%)
  const uncertainFields = detectedFields.filter(df => 
    df.confidence > 0 && df.confidence < 85 && df.fieldType !== 'password'
  );
  
  if (uncertainFields.length === 0) {
    console.log('Form Bot: All fields have high confidence, skipping AI');
    return;
  }
  
  console.log(`Form Bot: Analyzing ${uncertainFields.length} uncertain fields with AI...`);
  
  try {
    const aiMappings = await analyzeFieldsWithAI(uncertainFields, savedData);
    
    // Update detectedFields with AI results
    let improved = 0;
    uncertainFields.forEach((uncertainField, idx) => {
      const aiMapping = aiMappings.get(idx);
      if (aiMapping && aiMapping.confidence > uncertainField.confidence) {
        // Find the original field in detectedFields and update it
        const originalIndex = detectedFields.findIndex(df => df === uncertainField);
        if (originalIndex >= 0) {
          detectedFields[originalIndex] = {
            ...detectedFields[originalIndex],
            matchedKey: aiMapping.matchedKey,
            confidence: aiMapping.confidence,
          };
          improved++;
        }
      }
    });
    
    console.log(`Form Bot: AI improved ${improved} field matches`);
  } catch (error) {
    console.error('Form Bot: AI enhancement failed:', error);
  }
}

/**
 * Handle messages from popup/background
 */
async function handleMessage(message: Message, sendResponse: (response?: any) => void) {
  switch (message.type) {
    case 'GET_FORM_DATA':
      sendResponse({
        fields: detectedFields,
        formCount: countForms(),
        url: window.location.href,
      });
      break;
      
    case 'FILL_FORM':
      await fillForm(message.payload);
      sendResponse({ success: true });
      break;
      
    case 'HIGHLIGHT_FIELD':
      highlightSpecificField(message.payload);
      break;
      
    case 'UNDO_FILL':
      await undoFill();
      sendResponse({ success: true });
      break;
      
    case 'FILL_FROM_RESUME':
      await fillFromResume();
      sendResponse({ success: true });
      break;
      
    default:
      sendResponse({ error: 'Unknown message type' });
  }
}

/**
 * Fill form with saved data
 */
async function fillForm(options: { minConfidence?: number; highlight?: boolean } = {}) {
  const settings = await getSettings();
  const minConfidence = options.minConfidence ?? settings.minConfidence;
  const shouldHighlight = options.highlight ?? settings.highlightFields;
  
  const savedData = await getPrimaryFormData();
  const previousValues: Array<{ xpath: string; value: string }> = [];
  
  removeAllHighlights();
  
  for (const detectedField of detectedFields) {
    // Skip low confidence matches
    if (detectedField.confidence < minConfidence) {
      continue;
    }
    
    // Skip password fields
    if (detectedField.fieldType === 'password') {
      continue;
    }
    
    if (!detectedField.matchedKey) {
      continue;
    }
    
    const fillValue = getFillValue(
      detectedField.field,
      detectedField.fieldType,
      detectedField.matchedKey,
      savedData
    );
    
    if (!fillValue) {
      continue;
    }
    
    const element = detectedField.field.element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;
    
    // Save previous value for undo
    const currentValue = ('value' in element) ? (element as HTMLInputElement).value : element.textContent || '';
    previousValues.push({
      xpath: detectedField.field.xpath,
      value: currentValue,
    });
    
    // Fill the field (handle both regular inputs and contenteditable)
    if ('value' in element) {
      (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = fillValue;
    } else if ((element as HTMLElement).isContentEditable) {
      // For contenteditable elements (Google Forms)
      (element as HTMLElement).textContent = fillValue;
    }
    
    // Trigger events to notify the page of the change
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    // For contenteditable, also trigger keyup and blur events
    if ((element as HTMLElement).isContentEditable) {
      element.dispatchEvent(new Event('keyup', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    
    // Highlight field if enabled
    if (shouldHighlight) {
      const highlightType = detectedField.confidence >= 85 ? 'success' : 'warning';
      highlightField(element, highlightType);
      
      // Remove highlight after 2 seconds
      setTimeout(() => {
        removeHighlight(element);
      }, 2000);
    }
  }
  
  // Save state for undo
  await saveLastFill(previousValues);
}

/**
 * Undo last fill
 */
async function undoFill() {
  const lastFill = await getLastFill();
  
  if (!lastFill) {
    return;
  }
  
  for (const { xpath, value } of lastFill) {
    const element = getElementByXPath(xpath) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement | null;
    
    if (element) {
      if ('value' in element) {
        (element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = value;
      } else if ((element as HTMLElement).isContentEditable) {
        (element as HTMLElement).textContent = value;
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

/**
 * Highlight a specific field
 */
function highlightSpecificField(xpath: string) {
  removeAllHighlights();
  
  const element = getElementByXPath(xpath) as HTMLElement;
  if (element) {
    highlightField(element);
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/**
 * Fill form from resume/master profile
 */
async function fillFromResume() {
  const settings = await getSettings();
  
  if (!settings.openAIEnabled || !settings.openAIKey) {
    alert('Form Bot: Please enable AI and add your OpenAI API key in settings to use Resume Fill.');
    return;
  }
  
  if (!settings.masterProfile || settings.masterProfile.trim().length < 50) {
    alert('Form Bot: Please add your resume/profile in settings first.\n\nGo to: Form Bot Settings → Resume Profile tab');
    return;
  }

  // Show loading indicator
  showLoadingOverlay('Analyzing your resume and form fields...');

  try {
    // Extract structured data from resume
    console.log('Form Bot: Extracting data from resume...');
    const extractedData = await extractProfileFromResume(settings.masterProfile);
    
    if (!extractedData) {
      throw new Error('Failed to extract data from resume');
    }

    console.log('Form Bot: Extracted profile data:', extractedData);
    
    // Get current form fields
    const fields = detectFormFields();
    
    if (fields.length === 0) {
      hideLoadingOverlay();
      alert('No form fields detected on this page.');
      return;
    }

    updateLoadingOverlay('Mapping data to form fields...');

    // Use AI to intelligently map profile data to form fields
    const fieldInfos = fields.map(f => ({
      label: f.label,
      name: f.name,
      type: f.type,
      placeholder: f.placeholder,
      ariaLabel: f.ariaLabel,
    }));

    const fillMappings = await fillFormFromProfile(fieldInfos, extractedData);

    updateLoadingOverlay('Filling form...');

    // Fill the fields
    const previousValues: Array<{ xpath: string; value: string }> = [];
    let filledCount = 0;

    fields.forEach((field, index) => {
      const fillValue = fillMappings.get(index);
      
      if (!fillValue) {
        return;
      }

      const element = field.element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;
      
      // Save previous value
      const currentValue = ('value' in element) ? (element as HTMLInputElement).value : element.textContent || '';
      previousValues.push({
        xpath: field.xpath,
        value: currentValue,
      });

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

      // Highlight
      element.classList.add('formbot-highlight-success');
      setTimeout(() => {
        element.classList.remove('formbot-highlight-success');
      }, 2000);

      filledCount++;
    });

    // Save for undo
    await saveLastFill(previousValues);

    hideLoadingOverlay();
    
    // Show success message
    showSuccessMessage(`✓ Filled ${filledCount} fields from your resume!`);
  } catch (error) {
    hideLoadingOverlay();
    console.error('Form Bot: Resume fill failed:', error);
    alert(`Failed to fill from resume: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Show loading overlay
 */
function showLoadingOverlay(message: string) {
  let overlay = document.getElementById('formbot-loading-overlay');
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'formbot-loading-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 9999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    overlay.innerHTML = `
      <div style="background: linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%); padding: 30px 40px; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.4); text-align: center; max-width: 400px;">
        <div style="width: 48px; height: 48px; border: 4px solid white; border-top-color: transparent; border-radius: 50%; margin: 0 auto 20px; animation: spin 1s linear infinite;"></div>
        <p id="formbot-loading-message" style="color: white; font-size: 16px; margin: 0;"></p>
      </div>
    `;
    
    // Add spin animation
    const style = document.createElement('style');
    style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    overlay.appendChild(style);
    
    document.body.appendChild(overlay);
  }
  
  const messageEl = document.getElementById('formbot-loading-message');
  if (messageEl) {
    messageEl.textContent = message;
  }
  
  overlay.style.display = 'flex';
}

/**
 * Update loading overlay message
 */
function updateLoadingOverlay(message: string) {
  const messageEl = document.getElementById('formbot-loading-message');
  if (messageEl) {
    messageEl.textContent = message;
  }
}

/**
 * Hide loading overlay
 */
function hideLoadingOverlay() {
  const overlay = document.getElementById('formbot-loading-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/**
 * Show success message
 */
function showSuccessMessage(message: string) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #10B981 0%, #059669 100%);
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
    z-index: 9999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    animation: slideInRight 0.3s ease-out;
  `;
  
  toast.textContent = message;
  
  const style = document.createElement('style');
  style.textContent = '@keyframes slideInRight { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }';
  toast.appendChild(style);
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.3s ease-out reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  removeAllInlineButtons();
  if (formObserver) {
    formObserver.disconnect();
  }
});

