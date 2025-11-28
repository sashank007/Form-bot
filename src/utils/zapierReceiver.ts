/**
 * Zapier Data Receiver - Polls for incoming CRM data
 */

import { saveFormData, getAllFormData } from './storage';
import { SavedFormData, ProfileType } from '../types';

const POLL_INTERVAL = 5000; // 5 seconds
const STORAGE_KEY = 'pending_zapier_data';

/**
 * Start polling for incoming Zapier data
 */
export function startZapierPolling(onDataReceived?: (data: any) => void): () => void {
  console.log('🔄 Started polling for Zapier data (every 5s)');
  
  const pollInterval = setInterval(async () => {
    await checkForPendingData(onDataReceived);
  }, POLL_INTERVAL);

  // Initial check
  checkForPendingData(onDataReceived);

  // Return cleanup function
  return () => {
    console.log('🛑 Stopped Zapier polling');
    clearInterval(pollInterval);
  };
}

/**
 * Check for pending Zapier data
 */
async function checkForPendingData(callback?: (data: any) => void): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const pending = result[STORAGE_KEY];

    if (pending && !pending.processed) {
      console.log('📥 New Zapier data received!', pending);
      
      // Mark as processed immediately to avoid double-processing
      await chrome.storage.local.set({
        [STORAGE_KEY]: { ...pending, processed: true }
      });

      // Process the data
      await processCRMData(pending.data);

      // Call callback if provided
      if (callback) {
        callback(pending.data);
      }

      // Clear after processing
      setTimeout(async () => {
        await chrome.storage.local.remove(STORAGE_KEY);
      }, 1000);
    }
  } catch (error) {
    console.error('Error checking for Zapier data:', error);
  }
}

/**
 * Detect if data is from Google Sheets
 */
function isGoogleSheetsData(data: any): boolean {
  // Check for Google Sheets indicators
  const indicators = [
    'spreadsheetId',
    'sheetId',
    'rowNumber',
    'row',
    'googleSheets',
    'sheetName',
    'spreadsheet',
  ];
  
  const keys = Object.keys(data).map(k => k.toLowerCase());
  return indicators.some(indicator => 
    keys.some(key => key.includes(indicator.toLowerCase()))
  ) || data.source === 'google-sheets' || data.source === 'googlesheets';
}

/**
 * Get unique identifier for profile matching
 */
function getSourceId(data: any): string | null {
  // Try common identifier fields
  const idFields = [
    'rowId',
    'rowNumber',
    'row',
    'id',
    'email', // Email is often unique
    'employeeId',
    'employee_id',
    'recordId',
    'record_id',
  ];
  
  for (const field of idFields) {
    if (data[field]) {
      return String(data[field]);
    }
  }
  
  // Fallback: use email if available
  if (data.email) {
    return `email_${data.email}`;
  }
  
  return null;
}

/**
 * Process CRM data and create/update profile
 */
async function processCRMData(data: any): Promise<void> {
  const isGoogleSheets = isGoogleSheetsData(data);
  const profileType: ProfileType = isGoogleSheets ? 'google-sheets' : 'zapier';
  
  console.log(`🏢 Processing ${isGoogleSheets ? 'Google Sheets' : 'CRM'} data...`);
  
  // Flatten the data
  const flattenedData: { [key: string]: string } = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Skip metadata fields
    if (['source', 'spreadsheetId', 'sheetId', 'rowNumber', 'row'].includes(key)) {
      continue;
    }
    
    if (value !== null && value !== undefined && value !== '') {
      if (typeof value === 'object') {
        flattenedData[key] = JSON.stringify(value);
      } else {
        flattenedData[key] = String(value);
      }
    }
  }

  console.log('📊 Flattened data:', flattenedData);
  console.log('📦 Field count:', Object.keys(flattenedData).length);

  // Get source ID for matching existing profiles
  const sourceId = getSourceId(data);
  let existingProfile: SavedFormData | null = null;
  
  if (sourceId) {
    // Check if profile with this sourceId already exists
    const allProfiles = await getAllFormData();
    existingProfile = allProfiles.find(
      p => p.sourceId === sourceId && p.profileType === profileType
    ) || null;
  }

  // Generate profile name
  let profileName: string;
  if (isGoogleSheets) {
    const name = data.name || 
                 `${data.firstName || ''} ${data.lastName || ''}`.trim() ||
                 data.email ||
                 `Row ${data.rowNumber || data.row || 'Unknown'}`;
    profileName = `Google Sheets: ${name}`;
  } else {
    profileName = `From CRM - ${new Date().toLocaleString()}`;
  }

  // Create or update profile
  const profile: SavedFormData = {
    id: existingProfile?.id || `${profileType}_${sourceId || Date.now()}`,
    name: profileName,
    data: flattenedData,
    profileType,
    sourceId: sourceId || undefined,
    createdAt: existingProfile?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  await saveFormData(profile);
  
  const action = existingProfile ? 'updated' : 'created';
  console.log(`✅ Profile ${action} from ${isGoogleSheets ? 'Google Sheets' : 'CRM'} data:`, profile.name);

  // Show notification
  chrome.notifications?.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/formbot_head.png'),
    title: `FormBot: ${isGoogleSheets ? 'Google Sheets' : 'CRM'} Data ${action === 'updated' ? 'Updated' : 'Received'}`,
    message: `${action === 'updated' ? 'Updated' : 'Created'} profile "${profile.name}" with ${Object.keys(flattenedData).length} fields`,
  });
}

/**
 * Manually trigger data check (for testing)
 */
export async function checkNow(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return !!result[STORAGE_KEY];
}

/**
 * Get webhook receiver URL for this extension
 */
export function getWebhookReceiverUrl(): string {
  return chrome.runtime.getURL('webhook-receiver.html');
}

