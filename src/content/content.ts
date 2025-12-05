/**
 * Content script - runs on all web pages
 */

import { Message, DetectedField, FormDetectionResult, FormTemplate, FormField } from '../types';
import { detectFormFields, countForms, observeFormChanges, getElementByXPath, highlightField, removeHighlight, removeAllHighlights } from './formDetector';
import { matchFields, getFillValue } from './fieldMatcher';
import { getPrimaryFormData, saveLastFill, getLastFill, getSettings, getFormDataById, onProfileChange } from '../utils/storage';
import { setupInlineButtons, removeAllInlineButtons } from './inlineButton';
import { analyzeFieldsWithAI } from '../utils/aiFormAnalyzer';
import { extractProfileFromResume, fillFormFromProfile } from '../utils/resumeExtractor';
import { hideFieldEditor } from './fieldEditor';
import { startFormMonitoring, calculateFillPercentage, getCurrentFormValues, getFieldStructure } from './formMonitor';
import { findMatchingTemplates, saveTemplate, incrementTemplateUsage, getTemplateById } from '../utils/templateStorage';
import { getProfileSecrets } from '../utils/secretsStorage';
import { validateFormData } from '../utils/validator';
import { analyzeAllFieldsWithAI, applyAIAnalysisResults } from '../utils/aiComprehensiveAnalyzer';
import { fillFieldWithEvents } from '../utils/eventSimulator';
import { analyzeField } from '../utils/fieldPurposeIdentifier';
import { sendToZapier, extractFilledFormData } from '../utils/zapierIntegration';
import { uploadDocumentToS3 } from '../utils/s3Upload';
import { saveSubmittedDocument, inferDocumentTypeFromFile } from '../utils/documentStorage';
import { findMatchingDocument, fillFileUploadField } from '../utils/documentFiller';
import { getAuth } from '../utils/googleAuth';
import { SubmittedDocument } from '../types';
import { detectDateComponentGroups, parseDate, fillDateComponent } from '../utils/dateFieldHandler';
import { batchMatchAllFields } from '../utils/batchAIMatcher';
import { classifyField } from '../utils/fieldClassifier';

let detectedFields: DetectedField[] = [];
let formObserver: MutationObserver | null = null;
let formMonitorCleanup: (() => void) | null = null;
let saveTemplateNotificationShown = false;
let isMatching = false;
let isFilling = false;

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
    // Don't re-detect while filling (causes unnecessary AI calls)
    if (isFilling || isMatching) return;
    
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      if (!isFilling && !isMatching) {
        detectAndNotify();
      }
    }, 500);
  });
  
  // Listen for profile changes and re-run matching
  onProfileChange(() => {
    // Don't re-match while filling
    if (isFilling) return;
    console.log('🔄 [PROFILE] Profile changed - re-running form detection');
    detectAndNotify();
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
    isMatching = false;
    return;
  }
  
  isMatching = true;
  
  // Get saved data and match fields
  const savedData = await getPrimaryFormData();
  
  const settings = await getSettings();
  
  // Use batch AI matching if enabled (single LLM call for all fields)
  if (settings.openAIEnabled && settings.openAIKey && fields.length > 0) {
    console.log(`🤖 [BATCH] Batch AI matching mode: ${fields.length} fields detected on page`);
    console.log(`📋 [BATCH] Form fields detected:`);
    fields.forEach((field, idx) => {
      console.log(`  Field ${idx}: label="${field.label || ''}", name="${field.name || ''}", type="${field.type || ''}", id="${field.id || ''}"`);
    });
    
    // Log profile data being used
    const profileKeys = Object.keys(savedData);
    console.log(`📋 [BATCH] Profile data has ${profileKeys.length} keys:`, profileKeys.slice(0, 20));
    if (profileKeys.length === 0) {
      console.warn('⚠️ [BATCH] WARNING: Profile data is EMPTY! No keys to match against.');
    }
    
    try {
      const batchResults = await batchMatchAllFields(fields, savedData, window.location.href);
      
      // Convert batch results to DetectedField format
      detectedFields = fields.map((field, index) => {
        const batchMatch = batchResults.get(index);
        
        // Classify field type
        const { fieldType, confidence: typeConfidence } = classifyField(
          field.name,
          field.id,
          field.type,
          field.placeholder,
          field.label,
          field.ariaLabel
        );
        
        if (batchMatch && batchMatch.matchedKey) {
          return {
            field,
            fieldType,
            confidence: batchMatch.confidence,
            matchedKey: batchMatch.matchedKey,
            reasoning: batchMatch.reasoning,
            matchFactors: batchMatch.matchFactors,
            possibleMatches: batchMatch.possibleMatches,
          };
        }
        
        // No batch match - use type-based confidence or 0
        return {
          field,
          fieldType,
          confidence: batchMatch?.confidence || typeConfidence || 0,
          matchedKey: batchMatch?.matchedKey,
          reasoning: batchMatch?.reasoning,
          matchFactors: batchMatch?.matchFactors,
        };
      });
      
      // For fields without batch matches, try individual matching as fallback
      const unmatchedFields = detectedFields
        .map((df, idx) => ({ df, idx }))
        .filter(({ df }) => !df.matchedKey || df.confidence < 50);
      
      if (unmatchedFields.length > 0) {
        console.log(`🔄 [BATCH] Falling back to individual matching for ${unmatchedFields.length} unmatched fields`);
        const fallbackFields = unmatchedFields.map(({ idx }) => fields[idx]);
        const fallbackResults = await matchFields(fallbackFields, savedData);
        
        unmatchedFields.forEach(({ idx }, fallbackIdx) => {
          if (fallbackResults[fallbackIdx] && fallbackResults[fallbackIdx].matchedKey) {
            detectedFields[idx] = fallbackResults[fallbackIdx];
          }
        });
      }
      
      const matchedCount = detectedFields.filter(df => df.matchedKey && df.confidence > 0).length;
      console.log(`✅ [BATCH] Batch matching complete: ${matchedCount}/${fields.length} fields matched`);
    } catch (error) {
      console.error('❌ [BATCH] Batch matching failed, falling back to individual:', error);
      // Fallback to individual matching
      detectedFields = await matchFields(fields, savedData);
    }
  } else if (settings.openAIEnabled && settings.openAIKey) {
    // Use comprehensive AI analysis if enabled (analyzes ALL fields)
    console.log('🧠 AI Comprehensive Mode: Analyzing all fields with full context...');
    
    // First do intelligent matching (includes cache + AI)
    detectedFields = await matchFields(fields, savedData);
    
    // Then enhance ALL fields with AI analysis (for additional context)
    const aiResults = await analyzeAllFieldsWithAI(fields, savedData);
    detectedFields = applyAIAnalysisResults(detectedFields, aiResults);
    
    console.log('✅ AI comprehensive analysis complete');
  } else {
    // Fallback to intelligent matching (cache + fuzzy, no AI)
    console.log('📊 Using intelligent field matching (AI disabled, cache enabled)');
    detectedFields = await matchFields(fields, savedData);
  }
  
  isMatching = false;
  
  // Setup inline buttons for fields
  if (settings.autoFillEnabled) {
    await setupInlineButtons(detectedFields);
  }
  
  // Start monitoring form fill status
  startMonitoringForm(fields);
  
  // Setup form submit interception for validation
  setupSubmitValidation();
  
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
        isMatching,
      });
      break;
      
    case 'REMATCH_FIELDS':
      await rematchWithProfile(message.payload.profileId);
      sendResponse({
        fields: detectedFields,
        formCount: countForms(),
        url: window.location.href,
        isMatching,
      });
      break;
      
    case 'FILL_FORM':
      await fillForm(message.payload);
      sendResponse({ success: true });
      break;
      
    case 'FILL_SINGLE_FIELD':
      await fillSingleFieldFromMessage(message.payload);
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
      
    case 'SAVE_TEMPLATE':
      await saveCurrentFormAsTemplate(message.payload);
      sendResponse({ success: true });
      break;
      
    case 'APPLY_TEMPLATE':
      await applyTemplate(message.payload.templateId);
      sendResponse({ success: true });
      break;
      
    case 'GET_FILL_STATUS':
      const formFields = detectFormFields();
      sendResponse({
        fillPercentage: calculateFillPercentage(formFields),
        currentValues: getCurrentFormValues(formFields),
      });
      break;
      
    case 'EXTRACT_FILLED_DATA':
      const filledData = extractFilledFormData();
      sendResponse({ data: filledData });
      break;
      
    case 'GET_FIELD_VALUES':
      const xpaths = message.payload?.xpaths || [];
      const values: { [key: string]: string } = {};
      for (const xpath of xpaths) {
        const element = getElementByXPath(xpath);
        if (element) {
          if (element.tagName === 'SELECT') {
            const select = element as HTMLSelectElement;
            values[xpath] = select.options[select.selectedIndex]?.text || select.value || '';
          } else if ((element as HTMLInputElement).value !== undefined) {
            values[xpath] = (element as HTMLInputElement).value || '';
          } else if ((element as HTMLElement).textContent) {
            values[xpath] = (element as HTMLElement).textContent?.trim() || '';
          }
        }
      }
      sendResponse({ values });
      break;
      
    default:
      sendResponse({ error: 'Unknown message type' });
  }
}

/**
 * Fill form with saved data
 */
async function fillForm(options: { minConfidence?: number; highlight?: boolean; profileId?: string } = {}) {
  console.log('Content: fillForm called with options:', options);
  console.log('Content: detectedFields count:', detectedFields.length);
  
  // Prevent re-detection during fill
  isFilling = true;
  
  const settings = await getSettings();
  const minConfidence = options.minConfidence ?? settings.minConfidence;
  const shouldHighlight = options.highlight ?? settings.highlightFields;
  
  // Get data from selected profile or primary
  let savedData;
  let profileSecrets: { [key: string]: string } = {};
  
  if (options.profileId) {
    const profile = await getFormDataById(options.profileId);
    savedData = profile?.data || {};
    
    console.log('Content: Using profile:', profile?.name, 'Data keys:', Object.keys(savedData));
    
    // Get encrypted secrets for this profile
    profileSecrets = await getProfileSecrets(options.profileId);
    
    console.log('Content: Profile has', Object.keys(profileSecrets).length, 'secrets');
  } else {
    savedData = await getPrimaryFormData();
    console.log('Content: Using primary data, keys:', Object.keys(savedData));
  }
  
  // Merge secrets with regular data (secrets take priority)
  let mergedData: any = { ...savedData, ...profileSecrets };
  
  // Flatten nested data structures (e.g., Google Sheets rows format)
  if (mergedData.rows && Array.isArray(mergedData.rows) && mergedData.rows.length > 0) {
    const flattened: any = {};
    for (const row of mergedData.rows) {
      if (typeof row === 'object' && row !== null) {
        Object.assign(flattened, row);
      }
    }
    // Also include any top-level keys that aren't 'rows'
    for (const key in mergedData) {
      if (key !== 'rows' && !(key in flattened)) {
        flattened[key] = mergedData[key];
      }
    }
    mergedData = flattened;
  }
  
  const previousValues: Array<{ xpath: string; value: string }> = [];
  
  removeAllHighlights();
  
  let filledCount = 0;
  let skippedCount = 0;
  
  console.log('Content: Starting to fill fields...');
  
  // Calculate actual fillable fields (have matched key AND have data value)
  const fillableFields = detectedFields.filter(df => {
    if (df.confidence < minConfidence) return false;
    if (df.fieldType === 'password') return false;
    if (!df.matchedKey) return false;
    const value = getFillValue(df.field, df.fieldType, df.matchedKey, mergedData);
    return !!value;
  });
  const totalToFill = fillableFields.length;
  
  showProgressIndicator(0, totalToFill);
  
  const allFields = detectedFields.map(df => df.field);
  const dateGroups = detectDateComponentGroups(allFields);
  const processedDateFields = new Set<number>();

  for (const dateGroup of dateGroups) {
    const groupFields = [dateGroup.yearField, dateGroup.monthField, dateGroup.dayField, dateGroup.fullDateField].filter(f => f !== null) as FormField[];
    
    if (groupFields.length === 0) continue;

    let dateValue: string | null = null;
    let matchedKey: string | null = null;

    for (const groupField of groupFields) {
      const detectedField = detectedFields.find(df => df.field === groupField);
      if (detectedField && detectedField.matchedKey && detectedField.confidence >= minConfidence) {
        const value = getFillValue(
          detectedField.field,
          detectedField.fieldType,
          detectedField.matchedKey,
          mergedData
        );
        if (value) {
          dateValue = value;
          matchedKey = detectedField.matchedKey;
          break;
        }
      }
    }

    if (!dateValue || !matchedKey) continue;

    const parsed = parseDate(dateValue);
    if (!parsed) continue;

    console.log(`📅 [DATE] Filling date components for ${matchedKey}: ${parsed.year}-${parsed.monthNumber}-${parsed.day}`);

    if (dateGroup.yearField) {
      const yearFieldIndex = detectedFields.findIndex(df => df.field === dateGroup.yearField);
      if (yearFieldIndex >= 0) {
        processedDateFields.add(yearFieldIndex);
        const success = fillDateComponent(dateGroup.yearField, parsed.year, 'year');
        if (success) {
          filledCount++;
          if (shouldHighlight) {
            highlightField(dateGroup.yearField.element as HTMLElement, 'success');
            setTimeout(() => removeHighlight(dateGroup.yearField!.element as HTMLElement), 2000);
          }
        }
      }
    }

    if (dateGroup.monthField) {
      const monthFieldIndex = detectedFields.findIndex(df => df.field === dateGroup.monthField);
      if (monthFieldIndex >= 0) {
        processedDateFields.add(monthFieldIndex);
        let success = fillDateComponent(dateGroup.monthField, parsed.month, 'month');
        if (!success) {
          success = fillDateComponent(dateGroup.monthField, parsed.monthNumber, 'month');
        }
        if (success) {
          filledCount++;
          if (shouldHighlight) {
            highlightField(dateGroup.monthField.element as HTMLElement, 'success');
            setTimeout(() => removeHighlight(dateGroup.monthField!.element as HTMLElement), 2000);
          }
        }
      }
    }

    if (dateGroup.dayField) {
      const dayFieldIndex = detectedFields.findIndex(df => df.field === dateGroup.dayField);
      if (dayFieldIndex >= 0) {
        processedDateFields.add(dayFieldIndex);
        const success = fillDateComponent(dateGroup.dayField, parsed.day, 'day');
        if (success) {
          filledCount++;
          if (shouldHighlight) {
            highlightField(dateGroup.dayField.element as HTMLElement, 'success');
            setTimeout(() => removeHighlight(dateGroup.dayField!.element as HTMLElement), 2000);
          }
        }
      }
    }

    if (dateGroup.fullDateField) {
      const fullDateFieldIndex = detectedFields.findIndex(df => df.field === dateGroup.fullDateField);
      if (fullDateFieldIndex >= 0) {
        processedDateFields.add(fullDateFieldIndex);
        
        // Actually fill the date input field
        const element = dateGroup.fullDateField.element as HTMLInputElement;
        const formattedDate = `${parsed.year}-${parsed.monthNumber}-${parsed.day}`;
        
        console.log(`📅 [DATE] Filling date input with: ${formattedDate}`);
        fillFieldWithEvents(element, formattedDate);
        filledCount++;
        
        if (shouldHighlight) {
          highlightField(element, 'success');
          setTimeout(() => removeHighlight(element), 2000);
        }
      }
    }
  }

  for (let i = 0; i < detectedFields.length; i++) {
    if (processedDateFields.has(i)) {
      continue;
    }

    const detectedField = detectedFields[i];
    
    // Skip low confidence matches
    if (detectedField.confidence < minConfidence) {
      console.log('Content: Skipping low confidence field:', detectedField.field.label, detectedField.confidence);
      skippedCount++;
      continue;
    }
    
    // Skip password fields
    if (detectedField.fieldType === 'password') {
      console.log('Content: Skipping password field');
      skippedCount++;
      continue;
    }
    
    // Try to get fill value - getFillValue will also check for date components
    const fillValue = getFillValue(
      detectedField.field,
      detectedField.fieldType,
      detectedField.matchedKey,
      mergedData
    );
    
    if (!fillValue) {
      if (detectedField.matchedKey) {
        console.log('Content: No fill value for matched key:', detectedField.matchedKey);
      } else {
        console.log('Content: No match and no date component for:', detectedField.field.label);
      }
      skippedCount++;
      continue;
    }
    
    console.log('Content: Filling field:', detectedField.field.label || detectedField.field.name, 'with key:', detectedField.matchedKey);
    
    const element = detectedField.field.element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;
    
    // Save previous value for undo
    const currentValue = ('value' in element) ? (element as HTMLInputElement).value : element.textContent || '';
    previousValues.push({
      xpath: detectedField.field.xpath,
      value: currentValue,
    });
    
    // Fill with proper event simulation (React/Angular compatible)
    fillFieldWithEvents(element, fillValue);
    
    // Highlight field if enabled
    if (shouldHighlight) {
      const highlightType = detectedField.confidence >= 85 ? 'success' : 'warning';
      highlightField(element, highlightType);
      
      // Remove highlight after 2 seconds
      setTimeout(() => {
        removeHighlight(element);
      }, 2000);
    }
    
    filledCount++;
    
    // Update progress indicator
    updateProgressIndicator(filledCount, totalToFill);
  }
  
  // Auto-fill file upload fields with matching documents
  await autoFillFileUploads(shouldHighlight);
  
  console.log(`Content: Fill complete - ${filledCount} filled, ${skippedCount} skipped`);
  
  // Hide progress indicator after a moment
  setTimeout(() => hideProgressIndicator(), 2000);
  
  // Save state for undo
  await saveLastFill(previousValues);
  
  // Re-enable detection after fill is complete
  setTimeout(() => { isFilling = false; }, 1000);
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
 * Auto-fill file upload fields with matching documents
 */
async function autoFillFileUploads(highlight: boolean = true) {
  const fileInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
  if (fileInputs.length === 0) return;
  
  console.log(`📎 Found ${fileInputs.length} file upload field(s), checking for matching documents...`);
  
  for (const fileInput of fileInputs) {
    // Skip if already has files
    if (fileInput.files && fileInput.files.length > 0) {
      console.log(`  ⏭️ Skipping ${fileInput.name || 'file input'} - already has files`);
      continue;
    }
    
    // Get field label from various sources
    const label = getFileInputLabel(fileInput);
    if (!label) {
      console.log(`  ⏭️ Skipping file input - no label found`);
      continue;
    }
    
    console.log(`  🔍 Looking for document match for: "${label}"`);
    
    const matchedDoc = await findMatchingDocument(label);
    if (matchedDoc) {
      console.log(`  ✅ Found matching document: ${matchedDoc.fileName} (${matchedDoc.documentType})`);
      const success = await fillFileUploadField(fileInput, matchedDoc);
      
      if (success && highlight) {
        highlightField(fileInput, 'success');
        setTimeout(() => removeHighlight(fileInput), 2000);
      }
    } else {
      console.log(`  ❌ No matching document found for: "${label}"`);
    }
  }
}

function getFileInputLabel(input: HTMLInputElement): string {
  // Check aria-label
  const ariaLabel = input.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  
  // Check for explicit label
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label?.textContent) return label.textContent.trim();
  }
  
  // Check parent label
  const parentLabel = input.closest('label');
  if (parentLabel?.textContent) return parentLabel.textContent.trim();
  
  // Check nearby text
  const parent = input.parentElement;
  if (parent) {
    // Look for label sibling
    const prevLabel = input.previousElementSibling;
    if (prevLabel?.tagName === 'LABEL' || prevLabel?.tagName === 'SPAN') {
      return prevLabel.textContent?.trim() || '';
    }
    
    // Look for heading or label text nearby
    const labelEl = parent.querySelector('label, .label, [class*="label"]');
    if (labelEl?.textContent) return labelEl.textContent.trim();
  }
  
  // Check name or placeholder
  if (input.name) return input.name.replace(/[-_]/g, ' ');
  if (input.placeholder) return input.placeholder;
  
  // Check accept attribute for hints
  const accept = input.getAttribute('accept');
  if (accept?.includes('image')) return 'photo document';
  if (accept?.includes('pdf')) return 'pdf document';
  
  return '';
}

/**
 * Re-match fields with a different profile
 */
async function rematchWithProfile(profileId: string) {
  if (!profileId) return;
  
  isMatching = true;
  
  // Get the selected profile data
  const profile = await getFormDataById(profileId);
  
  if (!profile) {
    isMatching = false;
    return;
  }
  
  // Flatten nested data structures (e.g., Google Sheets rows format)
  let savedData = profile.data;
  if (savedData.rows && Array.isArray(savedData.rows) && savedData.rows.length > 0) {
    const flattened: any = {};
    for (const row of savedData.rows) {
      if (typeof row === 'object' && row !== null) {
        Object.assign(flattened, row);
      }
    }
    for (const key in savedData) {
      if (key !== 'rows' && !(key in flattened)) {
        flattened[key] = savedData[key];
      }
    }
    savedData = flattened;
  }
  
  console.log(`📋 [REMATCH] Profile "${profile.name}" has ${Object.keys(savedData).length} keys:`, Object.keys(savedData).slice(0, 10));
  
  // Get current form fields
  const fields = detectFormFields();
  
  const settings = await getSettings();
  
  // Use batch AI matching if enabled
  if (settings.openAIEnabled && settings.openAIKey && fields.length > 0) {
    console.log(`🤖 [REMATCH] Batch AI matching for profile "${profile.name}"`);
    try {
      const batchResults = await batchMatchAllFields(fields, savedData, window.location.href);
      
      detectedFields = fields.map((field, index) => {
        const batchMatch = batchResults.get(index);
        const { fieldType, confidence: typeConfidence } = classifyField(
          field.name, field.id, field.type, field.placeholder, field.label, field.ariaLabel
        );
        
        if (batchMatch && batchMatch.matchedKey) {
          return {
            field,
            fieldType,
            confidence: batchMatch.confidence,
            matchedKey: batchMatch.matchedKey,
            reasoning: batchMatch.reasoning,
            matchFactors: batchMatch.matchFactors,
            possibleMatches: batchMatch.possibleMatches,
          };
        }
        
        return {
          field,
          fieldType,
          confidence: batchMatch?.confidence || typeConfidence || 0,
          matchedKey: batchMatch?.matchedKey,
          reasoning: batchMatch?.reasoning,
          matchFactors: batchMatch?.matchFactors,
        };
      });
      
      console.log(`✅ [REMATCH] Batch matching complete for "${profile.name}"`);
    } catch (error) {
      console.error('❌ [REMATCH] Batch matching failed, falling back:', error);
      detectedFields = await matchFields(fields, savedData);
    }
  } else {
    detectedFields = await matchFields(fields, savedData);
  }
  
  isMatching = false;
  
  // Update inline buttons
  if (settings.autoFillEnabled) {
    await setupInlineButtons(detectedFields);
  }
  
  console.log(`Form Bot: Re-matched fields with profile "${profile.name}"`);
}

/**
 * Fill a single field from popup click
 */
async function fillSingleFieldFromMessage(payload: any) {
  console.log('Content: fillSingleFieldFromMessage called with:', payload);
  
  const { xpath, matchedKey, fieldType, profileId } = payload;
  
  if (!matchedKey) {
    console.error('Content: No matchedKey provided');
    return;
  }
  
  // Get data from selected profile (including secrets)
  let savedData;
  let profileSecrets: { [key: string]: string } = {};
  
  if (profileId) {
    const profile = await getFormDataById(profileId);
    savedData = profile?.data || {};
    
    console.log('Content: Profile data:', Object.keys(savedData));
    
    // Get encrypted secrets
    profileSecrets = await getProfileSecrets(profileId);
    
    console.log('Content: Profile secrets:', Object.keys(profileSecrets));
  } else {
    savedData = await getPrimaryFormData();
  }
  
  // Merge secrets with regular data (secrets take priority)
  let mergedData = { ...savedData, ...profileSecrets };
  
  // Flatten nested data structures (e.g., Google Sheets rows format)
  if (mergedData.rows && Array.isArray(mergedData.rows) && mergedData.rows.length > 0) {
    const flattened: any = {};
    for (const row of mergedData.rows) {
      if (typeof row === 'object' && row !== null) {
        Object.assign(flattened, row);
      }
    }
    // Also include any top-level keys that aren't 'rows'
    for (const key in mergedData) {
      if (key !== 'rows' && !(key in flattened)) {
        flattened[key] = mergedData[key];
      }
    }
    mergedData = flattened;
  }
  
  const fillValue = mergedData[matchedKey];
  
  if (!fillValue) {
    console.error('Content: No value found for key:', matchedKey, 'Available keys:', Object.keys(mergedData));
    return;
  }
  
  console.log('Content: Found fill value for', matchedKey, '- length:', typeof fillValue === 'string' ? fillValue.length : String(fillValue).length);
  
  const element = getElementByXPath(xpath) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement | null;
  
  if (!element) {
    console.error('Content: Element not found for xpath:', xpath);
    return;
  }
  
  console.log('Content: Filling element:', element.tagName, element.id || element.getAttribute('name'));
  
  // Fill with proper event simulation (React/Angular compatible)
  fillFieldWithEvents(element as any, fillValue);
  
  // Visual feedback
  element.classList.add('formbot-highlight-success');
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  setTimeout(() => {
    element.classList.remove('formbot-highlight-success');
  }, 2000);
  
  console.log('Content: Field filled successfully');
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
 * Start monitoring form for fill completion
 */
function startMonitoringForm(fields: any[]) {
  // Clean up previous monitor
  if (formMonitorCleanup) {
    formMonitorCleanup();
  }
  
  saveTemplateNotificationShown = false;
  
  formMonitorCleanup = startFormMonitoring(fields, async (percentage) => {
    console.log(`Form Bot: Form ${Math.floor(percentage)}% filled`);
    
    // Notify popup that form is ready to be saved as template
    chrome.runtime.sendMessage({
      type: 'FORM_FILL_THRESHOLD_REACHED',
      payload: { percentage },
    }).catch(() => {
      // Popup might not be open, that's okay
    });
    
    saveTemplateNotificationShown = true;
  }, 60); // 60% threshold
}

/**
 * Save current form as a template
 */
async function saveCurrentFormAsTemplate(payload: { name: string; profileId: string }) {
  const fields = detectFormFields();
  
  if (fields.length === 0) {
    throw new Error('No fields detected');
  }
  
  const savedData = await getPrimaryFormData();
  const matchedFields = await matchFields(fields, savedData);
  
  // Create field mappings
  const fieldMappings = matchedFields
    .filter(df => df.matchedKey && df.confidence >= 50)
    .map(df => ({
      fieldName: df.field.name || df.field.id || '',
      fieldLabel: df.field.label || '',
      dataKey: df.matchedKey!,
      customValue: undefined,
    }));
  
  const template: FormTemplate = {
    id: `template_${Date.now()}`,
    name: payload.name,
    urlPattern: window.location.href.split('?')[0], // Remove query params
    linkedProfileId: payload.profileId,
    fieldMappings,
    fieldStructure: getFieldStructure(fields),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    usageCount: 0,
  };
  
  await saveTemplate(template);
  
  console.log('Form Bot: Template saved:', template.name);
}

/**
 * Apply a saved template to current form
 */
async function applyTemplate(templateId: string) {
  const template = await getTemplateById(templateId);
  
  if (!template) {
    alert('Template not found');
    return;
  }
  
  showLoadingOverlay(`Applying template "${template.name}"...`);
  
  try {
    // Get profile data
    const profile = await getFormDataById(template.linkedProfileId);
    
    if (!profile) {
      throw new Error('Linked profile not found');
    }
    
    const fields = detectFormFields();
    const previousValues: Array<{ xpath: string; value: string }> = [];
    let filledCount = 0;
    
    // Fill fields based on template mappings
    for (const mapping of template.fieldMappings) {
      // Find matching field on current form
      const field = fields.find(f => 
        f.name === mapping.fieldName || 
        f.label === mapping.fieldLabel
      );
      
      if (!field) continue;
      
      const fillValue = mapping.customValue || profile.data[mapping.dataKey];
      if (!fillValue) continue;
      
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
      setTimeout(() => element.classList.remove('formbot-highlight-success'), 2000);
      
      filledCount++;
    }
    
    // Save for undo
    await saveLastFill(previousValues);
    
    // Increment usage count
    await incrementTemplateUsage(templateId);
    
    hideLoadingOverlay();
    showSuccessMessage(`✓ Applied template "${template.name}" - ${filledCount} fields filled!`);
  } catch (error) {
    hideLoadingOverlay();
    alert(`Failed to apply template: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Setup form submit validation
 */
function setupSubmitValidation() {
  console.log('━━━ SETTING UP SUBMIT VALIDATION ━━━');
  
  // Find all forms on the page
  const forms = document.querySelectorAll('form');
  console.log(`Found ${forms.length} form element(s) on page`);
  
  forms.forEach((form, index) => {
    console.log(`  Attaching submit listener to form ${index + 1}:`, form);
    // Remove any existing listener
    form.removeEventListener('submit', handleFormSubmit);
    // Add new listener
    form.addEventListener('submit', handleFormSubmit);
  });
  
  // Also catch submit buttons directly (backup method)
  const submitButtons = document.querySelectorAll('button[type="submit"], input[type="submit"]');
  console.log(`Found ${submitButtons.length} submit button(s)`);
  
  submitButtons.forEach((button, index) => {
    console.log(`  Attaching click listener to submit button ${index + 1}:`, button);
    button.addEventListener('click', (e) => {
      console.log('🔘 SUBMIT BUTTON CLICKED:', button);
      // The form submit event should fire, but log just in case
    });
  });
  
  // Listen for any button clicks that might submit (Google Forms uses custom buttons)
  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const text = target.textContent?.toLowerCase() || '';
    const ariaLabel = target.getAttribute('aria-label')?.toLowerCase() || '';
    
    // Check if it's a submit-like button
    if (text.includes('submit') || text.includes('next') || text.includes('continue') || 
        ariaLabel.includes('submit') || ariaLabel.includes('next')) {
      console.log('🔘 Possible submit button clicked:', target);
      console.log('  Text:', text);
      console.log('  Aria-label:', ariaLabel);
      console.log('  Calling handlePossibleFormSubmit NOW...');
      
      // Call immediately (don't wait)
      await handlePossibleFormSubmit();
      
      // Also try after a delay in case data isn't ready yet
      setTimeout(async () => {
        console.log('🔄 Delayed Zapier check (500ms after click)...');
        await handlePossibleFormSubmit();
      }, 500);
    }
  }, true);
  
  console.log(`Form Bot: Monitoring ${forms.length} form(s) for submit validation`);
}

/**
 * Handle possible form submit (for pages without form elements)
 */
async function handlePossibleFormSubmit() {
  console.log('━━━ handlePossibleFormSubmit CALLED ━━━');
  
  const settings = await getSettings();
  
  console.log('Settings check:', {
    enterpriseMode: settings.enterpriseMode,
    sendToZapierOnSubmit: settings.sendToZapierOnSubmit,
    webhookUrl: settings.zapierWebhookUrl ? 'SET' : 'NOT SET',
  });
  
  if (settings.enterpriseMode && settings.sendToZapierOnSubmit && settings.zapierWebhookUrl) {
    console.log('💡 Zapier is configured - extracting current page data...');
    const formData = extractFilledFormData();
    
    if (Object.keys(formData).length > 0) {
      console.log(`✅ Found ${Object.keys(formData).length} fields - sending to Zapier!`);
      await sendToZapier(formData);
    } else {
      console.log('⚠️ No form data found to send (fields might be empty)');
    }
  } else {
    console.log('❌ Zapier NOT configured:');
    if (!settings.enterpriseMode) console.log('  - Enterprise mode is OFF');
    if (!settings.sendToZapierOnSubmit) console.log('  - Send to Zapier on submit is OFF');
    if (!settings.zapierWebhookUrl) console.log('  - Webhook URL is empty');
    console.log('  Go to Settings → Enterprise to configure');
  }
}

/**
 * Handle form submit - validate before allowing submission AND send to Zapier
 */
async function handleFormSubmit(event: Event) {
  const form = event.target as HTMLFormElement;
  
  console.log('━━━━━ FORM SUBMIT DETECTED ━━━━━');
  console.log('Form:', form);
  
  // Check if Zapier integration is enabled
  const settings = await getSettings();
  console.log('Zapier Settings:', {
    enterpriseMode: settings.enterpriseMode,
    sendToZapierOnSubmit: settings.sendToZapierOnSubmit,
    hasWebhookUrl: !!settings.zapierWebhookUrl,
    webhookUrl: settings.zapierWebhookUrl ? settings.zapierWebhookUrl.substring(0, 50) + '...' : 'NOT SET',
  });
  
  if (settings.enterpriseMode && settings.sendToZapierOnSubmit && settings.zapierWebhookUrl) {
    console.log('🚀 Zapier integration is ENABLED - extracting form data...');
    
    // Extract and send form data to Zapier (non-blocking)
    const formData = extractFilledFormData();
    console.log('📊 Extracted form data:', formData);
    console.log('📦 Field count:', Object.keys(formData).length);
    
    sendToZapier(formData).then(success => {
      if (success) {
        console.log('✅✅✅ Form data successfully sent to Zapier!');
        showSuccessMessage('📤 Data sent to Zapier!');
      } else {
        console.log('❌ Failed to send to Zapier');
      }
    }).catch(err => {
      console.error('❌ Zapier send error:', err);
    });
  } else {
    console.log('⏭️ Zapier integration NOT enabled or not configured');
    if (!settings.enterpriseMode) console.log('  Reason: Enterprise mode is OFF');
    if (!settings.sendToZapierOnSubmit) console.log('  Reason: Send to Zapier on submit is OFF');
    if (!settings.zapierWebhookUrl) console.log('  Reason: Webhook URL not configured');
  }
  
  // Extract and upload file inputs before submission
  const fileInputs = form.querySelectorAll<HTMLInputElement>('input[type="file"]');
  const uploadedDocuments: SubmittedDocument[] = [];
  
  if (fileInputs.length > 0) {
    console.log(`📎 Found ${fileInputs.length} file input(s), uploading documents...`);
    const auth = await getAuth();
    
    for (const fileInput of fileInputs) {
      if (fileInput.files && fileInput.files.length > 0) {
        for (let i = 0; i < fileInput.files.length; i++) {
          const file = fileInput.files[i];
          const fieldLabel = detectedFields.find(df => df.field.name === fileInput.name)?.field.label || fileInput.getAttribute('aria-label') || fileInput.name;
          const documentType = inferDocumentTypeFromFile(file, fieldLabel);
          
          try {
            console.log(`📤 Uploading file: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);
            const uploadResult = await uploadDocumentToS3(file, documentType);
            
            const submittedDoc: SubmittedDocument = {
              id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              userId: auth?.userId || 'anonymous',
              s3Url: uploadResult.s3Url,
              s3Key: uploadResult.s3Key,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              documentType,
              formUrl: window.location.href,
              formFieldName: fileInput.name || 'file',
              formFieldLabel: fieldLabel,
              submittedAt: Date.now(),
            };
            
            await saveSubmittedDocument(submittedDoc);
            uploadedDocuments.push(submittedDoc);
            console.log(`✅ Document uploaded: ${file.name} → ${uploadResult.s3Url}`);
          } catch (error) {
            console.error(`❌ Failed to upload document ${file.name}:`, error);
          }
        }
      }
    }
    
    if (uploadedDocuments.length > 0) {
      console.log(`✅ Uploaded ${uploadedDocuments.length} document(s) to S3`);
    }
  }
  
  // Get all filled field values from the form
  const formData = new FormData(form);
  const filledData: { [key: string]: string } = {};
  const fieldTypes: { [key: string]: string } = {};
  
  formData.forEach((value, key) => {
    if (value && String(value).trim()) {
      filledData[key] = String(value);
    }
  });
  
  // Also check contenteditable fields
  const contentEditables = form.querySelectorAll('[contenteditable="true"]');
  contentEditables.forEach(el => {
    const text = (el as HTMLElement).textContent?.trim();
    if (text) {
      const label = (el as HTMLElement).getAttribute('aria-label') || 'field';
      filledData[label] = text;
    }
  });
  
  // Get field types from our detected fields
  detectedFields.forEach(df => {
    if (df.field.name) {
      fieldTypes[df.field.name] = df.fieldType;
    }
  });
  
  // If form has no data, allow submission
  if (Object.keys(filledData).length === 0 && uploadedDocuments.length === 0) {
    return;
  }
  
  // Validate the form data
  const validation = await validateFormData(filledData, fieldTypes, window.location.href);
  
  if (!validation.isValid) {
    // Block submission
    event.preventDefault();
    event.stopPropagation();
    
    // Show validation modal
    showValidationModal(validation, form);
  }
}

/**
 * Show validation modal on page
 */
function showValidationModal(validation: any, form: HTMLFormElement) {
  // Remove any existing modal
  const existing = document.getElementById('formbot-validation-modal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = 'formbot-validation-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    z-index: 99999999;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: fadeIn 0.2s;
  `;
  
  const hasSecurityWarnings = validation.securityWarnings.length > 0;
  const hasErrors = validation.issues.some((i: any) => i.severity === 'error');
  
  let issuesHTML = '';
  
  // Security warnings
  validation.securityWarnings.forEach((warning: any) => {
    issuesHTML += `
      <div style="background: #FEE2E2; border: 2px solid #EF4444; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
        <div style="display: flex; align-items-start;">
          <span style="font-size: 24px; margin-right: 12px;">🚨</span>
          <div>
            <p style="font-weight: bold; color: #991B1B; margin: 0 0 8px 0;">
              Security Alert: ${warning.field}
            </p>
            <p style="color: #7F1D1D; margin: 0; font-size: 14px;">
              ${warning.message}
            </p>
            ${warning.suggestion ? `
              <p style="color: #991B1B; margin: 8px 0 0 0; font-size: 13px;">
                💡 ${warning.suggestion}
              </p>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  });
  
  // Validation issues
  validation.issues.forEach((issue: any) => {
    const bgColor = issue.severity === 'error' ? '#FEE2E2' : '#FEF3C7';
    const borderColor = issue.severity === 'error' ? '#EF4444' : '#F59E0B';
    const textColor = issue.severity === 'error' ? '#991B1B' : '#92400E';
    const icon = issue.severity === 'error' ? '❌' : '⚠️';
    
    issuesHTML += `
      <div style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
        <p style="font-weight: 600; color: ${textColor}; margin: 0 0 4px 0; font-size: 14px;">
          ${icon} ${issue.field}
        </p>
        <p style="color: ${textColor}; margin: 0; font-size: 13px;">
          ${issue.message}
        </p>
        ${issue.suggestion ? `
          <p style="color: ${textColor}; margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">
            💡 ${issue.suggestion}
          </p>
        ` : ''}
      </div>
    `;
  });
  
  modal.innerHTML = `
    <div style="background: white; border-radius: 16px; padding: 24px; max-width: 500px; max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.4);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 20px; font-weight: bold; color: #111;">
          ${hasSecurityWarnings ? '🚨 Security & Validation Issues' : hasErrors ? '❌ Validation Errors' : '⚠️ Validation Warnings'}
        </h2>
        <button id="formbot-validation-close" style="background: none; border: none; font-size: 24px; color: #666; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px;">
          ×
        </button>
      </div>
      
      <div style="margin-bottom: 20px;">
        ${issuesHTML}
      </div>
      
      <div style="display: flex; gap: 12px;">
        ${hasSecurityWarnings || hasErrors ? `
          <button id="formbot-validation-cancel" style="flex: 1; padding: 12px; background: #EF4444; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
            🛑 Don't Submit
          </button>
        ` : ''}
        ${!hasErrors ? `
          <button id="formbot-validation-submit" style="flex: 1; padding: 12px; background: ${hasSecurityWarnings ? '#F59E0B' : '#8B5CF6'}; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
            ${hasSecurityWarnings ? '⚠️ Submit Anyway' : '✓ Submit Form'}
          </button>
        ` : `
          <div style="flex: 1; text-align: center; padding: 12px; background: #FEE2E2; border-radius: 8px;">
            <p style="margin: 0; color: #991B1B; font-weight: 600; font-size: 14px;">
              Please fix errors before submitting
            </p>
          </div>
        `}
      </div>
      
      <p style="margin: 16px 0 0 0; text-align: center; font-size: 11px; color: #666;">
        Form Bot is protecting your data
      </p>
    </div>
  `;
  
  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    #formbot-validation-close:hover {
      background: #f3f4f6;
    }
    #formbot-validation-cancel:hover {
      background: #DC2626;
    }
    #formbot-validation-submit:hover {
      background: ${hasSecurityWarnings ? '#D97706' : '#7C3AED'};
    }
  `;
  modal.appendChild(style);
  
  document.body.appendChild(modal);
  
  // Event listeners
  const closeBtn = modal.querySelector('#formbot-validation-close');
  const cancelBtn = modal.querySelector('#formbot-validation-cancel');
  const submitBtn = modal.querySelector('#formbot-validation-submit');
  
  closeBtn?.addEventListener('click', () => modal.remove());
  cancelBtn?.addEventListener('click', () => modal.remove());
  submitBtn?.addEventListener('click', () => {
    modal.remove();
    // Allow form submission
    form.submit();
  });
  
  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
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

    const fieldInfos = fields.map(f => {
      const fieldInfo: any = {
        label: f.label,
        name: f.name,
        type: f.type,
        placeholder: f.placeholder,
        ariaLabel: f.ariaLabel,
      };

      if (f.element.tagName === 'SELECT') {
        const selectEl = f.element as HTMLSelectElement;
        fieldInfo.options = Array.from(selectEl.options).map(opt => ({
          value: opt.value,
          text: opt.text,
        }));
      } else if (f.element.getAttribute('role') === 'listbox') {
        fieldInfo.options = (f.element as any)._formbot_options || [];
      }

      return fieldInfo;
    });

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
      
      const currentValue = ('value' in element) ? (element as HTMLInputElement).value : element.textContent || '';
      previousValues.push({
        xpath: field.xpath,
        value: currentValue,
      });

      fillFieldWithEvents(element, fillValue);

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
 * Show progress indicator
 */
function showProgressIndicator(current: number, total: number) {
  let indicator = document.getElementById('formbot-progress-indicator');
  
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'formbot-progress-indicator';
    indicator.className = 'formbot-filling-progress';
    document.body.appendChild(indicator);
  }
  
  // Progress bar percentage
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  
  indicator.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 22px; height: 22px; border: 2.5px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite;"></div>
        <span style="font-size: 15px;">Filling ${current}/${total} fields...</span>
      </div>
      <div style="height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; overflow: hidden;">
        <div style="height: 100%; width: ${percent}%; background: white; border-radius: 2px; transition: width 0.2s ease-out;"></div>
      </div>
    </div>
  `;
  
  const style = document.createElement('style');
  style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  if (!indicator.querySelector('style')) {
    indicator.appendChild(style);
  }
}

/**
 * Update progress indicator
 */
function updateProgressIndicator(current: number, total: number) {
  const indicator = document.getElementById('formbot-progress-indicator');
  if (!indicator) return;
  
  // Collect field categories for breakdown
  const categories = collectFilledFieldCategories();
  
  indicator.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <svg style="width: 24px; height: 24px; flex-shrink: 0;" fill="none" stroke="white" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span style="font-size: 15px; font-weight: 600;">${current} Field${current !== 1 ? 's' : ''} Filled</span>
      </div>
      ${categories.length > 0 ? `
        <div style="display: flex; flex-direction: column; gap: 4px; padding-left: 34px; font-size: 12px; opacity: 0.9;">
          ${categories.map(cat => `
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 10px;">•</span>
              <span>${cat.count} ${cat.label}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
  
  indicator.style.background = 'linear-gradient(135deg, #10B981 0%, #059669 100%)';
  indicator.style.minWidth = '200px';
}

/**
 * Collect categories of filled fields for the success breakdown
 */
function collectFilledFieldCategories(): Array<{ label: string; count: number }> {
  const categories: { [key: string]: number } = {};
  
  // Categorize by field type
  for (const field of detectedFields) {
    if (!field.matchedKey) continue;
    
    const key = field.matchedKey.toLowerCase();
    let category = 'Other fields';
    
    if (key.includes('name') || key.includes('first') || key.includes('last')) {
      category = 'Personal info';
    } else if (key.includes('email') || key.includes('phone') || key.includes('tel')) {
      category = 'Contact info';
    } else if (key.includes('address') || key.includes('city') || key.includes('state') || key.includes('zip') || key.includes('country')) {
      category = 'Address fields';
    } else if (key.includes('company') || key.includes('job') || key.includes('title') || key.includes('work')) {
      category = 'Professional info';
    } else if (key.includes('date') || key.includes('birth') || key.includes('dob')) {
      category = 'Date fields';
    } else if (key.includes('education') || key.includes('degree') || key.includes('school') || key.includes('university')) {
      category = 'Education info';
    }
    
    categories[category] = (categories[category] || 0) + 1;
  }
  
  // Convert to array and sort by count
  return Object.entries(categories)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4); // Max 4 categories
}

/**
 * Hide progress indicator
 */
function hideProgressIndicator() {
  const indicator = document.getElementById('formbot-progress-indicator');
  if (indicator) {
    indicator.style.animation = 'formbot-slide-in 0.3s ease-out reverse';
    setTimeout(() => indicator.remove(), 300);
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
  hideFieldEditor();
  if (formObserver) {
    formObserver.disconnect();
  }
});

