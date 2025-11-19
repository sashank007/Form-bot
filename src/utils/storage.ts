/**
 * Storage wrapper for form data
 * DynamoDB is the single source of truth
 * Local storage is only used as cache for offline access
 */

import { SavedFormData, FormData, Settings } from '../types';
import { pushProfileToDynamoDB, getAllProfilesFromCloud } from './dynamodbSync';
import { getAuth } from './googleAuth';

const STORAGE_KEYS = {
  FORM_DATA: 'formbot_data',
  SETTINGS: 'formbot_settings',
  LAST_FILL: 'formbot_last_fill',
  SELECTED_PROFILE: 'formbot_selected_profile',
};

const DEFAULT_SETTINGS: Settings = {
  autoFillEnabled: true,
  openAIEnabled: false,
  openAIKey: '',
  minConfidence: 70,
  highlightFields: true,
  darkMode: false,
  masterProfile: '',
  linkedInUrl: '',
  enterpriseMode: false,
  zapierWebhookUrl: '',
  sendToZapierOnSubmit: false,
  autoSyncEnabled: true, // Auto-sync from CRM by default
};

/**
 * Save form data
 */
export async function saveFormData(data: SavedFormData): Promise<void> {
  try {
    const allData = await getAllFormData();
    const existingIndex = allData.findIndex(d => d.id === data.id);
    
    if (existingIndex >= 0) {
      allData[existingIndex] = data;
    } else {
      allData.push(data);
    }
    
    await chrome.storage.local.set({ [STORAGE_KEYS.FORM_DATA]: allData });
    
    // Auto-sync to DynamoDB if user is signed in and auto-sync is enabled
    try {
      const settings = await getSettings();
      const auth = await getAuth();
      
      console.log('📊 Sync check - Auth:', auth ? `✓ Signed in as ${auth.email}` : '✗ Not signed in');
      console.log('📊 Sync check - AutoSync:', settings.autoSyncEnabled ? '✓ Enabled' : '✗ Disabled');
      
      if (!auth) {
        console.log('⏭️ Skipping cloud sync: Not signed in with Google');
        return;
      }
      
      if (!settings.autoSyncEnabled) {
        console.log('⏭️ Skipping cloud sync: Auto-sync disabled in settings');
        return;
      }
      
      console.log('🔄 Auto-syncing profile to DynamoDB...');
      await pushProfileToDynamoDB(data);
      console.log('✅ Profile synced to cloud');
    } catch (syncError) {
      // Don't fail the save if sync fails - just log it
      console.warn('⚠️ Cloud sync failed (profile saved locally):', syncError);
    }
  } catch (error) {
    console.error('Failed to save form data:', error);
    throw error;
  }
}

/**
 * Get all saved form data
 * PRIMARY: Fetch from DynamoDB (single source of truth)
 * FALLBACK: Use local cache if offline or not signed in
 */
export async function getAllFormData(): Promise<SavedFormData[]> {
  try {
    const auth = await getAuth();
    
    // If signed in, fetch from DynamoDB (single source of truth)
    if (auth) {
      console.log('📥 Fetching profiles from DynamoDB (single source of truth)...');
      try {
        const cloudProfiles = await getAllProfilesFromCloud();
        
        // Update local cache
        await chrome.storage.local.set({ [STORAGE_KEYS.FORM_DATA]: cloudProfiles });
        
        console.log(`✅ Loaded ${cloudProfiles.length} profile(s) from cloud`);
        return cloudProfiles;
      } catch (cloudError) {
        console.warn('⚠️ Failed to fetch from cloud, using local cache:', cloudError);
        // Fall through to local cache
      }
    } else {
      console.log('ℹ️ Not signed in, using local cache');
    }
    
    // Fallback: Use local cache (offline mode or not signed in)
    const result = await chrome.storage.local.get(STORAGE_KEYS.FORM_DATA);
    const data = result[STORAGE_KEYS.FORM_DATA];
    
    if (!data) {
      return [];
    }
    
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Failed to get form data:', error);
    return [];
  }
}

/**
 * Get a single form data by ID
 */
export async function getFormDataById(id: string): Promise<SavedFormData | null> {
  const allData = await getAllFormData();
  return allData.find(d => d.id === id) || null;
}

/**
 * Delete form data by ID
 */
export async function deleteFormData(id: string): Promise<void> {
  const allData = await getAllFormData();
  const filtered = allData.filter(d => d.id !== id);
  
  await chrome.storage.local.set({ [STORAGE_KEYS.FORM_DATA]: filtered });
}

/**
 * Get the primary/default form data
 */
export async function getPrimaryFormData(): Promise<FormData> {
  const allData = await getAllFormData();
  
  if (allData.length === 0) {
    return {};
  }
  
  // Return the most recently updated
  const sorted = allData.sort((a, b) => b.updatedAt - a.updatedAt);
  return sorted[0].data;
}

/**
 * Save settings
 */
export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

/**
 * Get settings
 */
export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return result[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS;
}

/**
 * Save last fill state (for undo functionality)
 */
export async function saveLastFill(fields: Array<{ xpath: string; value: string }>): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_FILL]: fields });
}

/**
 * Get last fill state
 */
export async function getLastFill(): Promise<Array<{ xpath: string; value: string }> | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_FILL);
  return result[STORAGE_KEYS.LAST_FILL] || null;
}

/**
 * Clear last fill state
 */
export async function clearLastFill(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.LAST_FILL);
}

/**
 * Save selected profile ID
 */
export async function saveSelectedProfile(profileId: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SELECTED_PROFILE]: profileId });
}

/**
 * Get selected profile ID
 */
export async function getSelectedProfile(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SELECTED_PROFILE);
  return result[STORAGE_KEYS.SELECTED_PROFILE] || null;
}

/**
 * Export all data as JSON
 */
export async function exportData(): Promise<string> {
  const allData = await getAllFormData();
  const settings = await getSettings();
  
  return JSON.stringify({
    version: '1.0.0',
    exportDate: new Date().toISOString(),
    formData: allData,
    settings: settings,
  }, null, 2);
}

/**
 * Import data from JSON
 */
export async function importData(jsonString: string): Promise<void> {
  try {
    const parsed = JSON.parse(jsonString);
    
    if (parsed.formData && Array.isArray(parsed.formData)) {
      await chrome.storage.local.set({ [STORAGE_KEYS.FORM_DATA]: parsed.formData });
    }
    
    if (parsed.settings) {
      await saveSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
    }
  } catch (error) {
    console.error('Failed to import data:', error);
    throw new Error('Invalid import file format');
  }
}

