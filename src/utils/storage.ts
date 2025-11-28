/**
 * Storage wrapper for form data
 * DynamoDB is the single source of truth
 * Local storage is only used as cache for offline access
 */

import { SavedFormData, FormData, Settings } from '../types';
import { pushProfileToDynamoDB, getAllProfilesFromCloud } from './dynamodbSync';
import { getAuth } from './googleAuth';
import { invalidateCacheForKey } from './matchingCache';
import { invalidateBatchCache } from './batchAIMatcher';

type ProfileChangeCallback = () => void | Promise<void>;

let profileChangeCallbacks: ProfileChangeCallback[] = [];
let profileChangeDebounceTimer: number | null = null;

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
    const existingData = existingIndex >= 0 ? allData[existingIndex] : null;
    
    if (existingIndex >= 0) {
      allData[existingIndex] = data;
    } else {
      allData.push(data);
    }
    
    await chrome.storage.local.set({ [STORAGE_KEYS.FORM_DATA]: allData });
    
    // Invalidate cache for keys that changed
    if (existingData && existingData.data) {
      const oldKeys = new Set(Object.keys(existingData.data));
      const newKeys = new Set(Object.keys(data.data));
      
      // Invalidate cache for removed or changed keys
      for (const key of oldKeys) {
        if (!newKeys.has(key) || existingData.data[key] !== data.data[key]) {
          await invalidateCacheForKey(key);
        }
      }
    }
    
    // Trigger profile change callbacks (debounced)
    triggerProfileChangeCallbacks();
    
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

// Track if we've loaded from DynamoDB in this session
let hasLoadedFromCloud = false;
let cloudLoadPromise: Promise<SavedFormData[]> | null = null;

/**
 * Get all saved form data
 * PRIMARY: Fetch from DynamoDB ONCE on initial load (single source of truth)
 * FALLBACK: Use local cache for subsequent calls
 */
export async function getAllFormData(forceRefresh: boolean = false): Promise<SavedFormData[]> {
  try {
    const auth = await getAuth();
    
    // If signed in and haven't loaded from cloud yet (or force refresh), fetch from DynamoDB
    if (auth && (!hasLoadedFromCloud || forceRefresh)) {
      // If there's already a load in progress, wait for it
      if (cloudLoadPromise && !forceRefresh) {
        console.log('⏳ Waiting for existing cloud load to complete...');
        return await cloudLoadPromise;
      }
      
      console.log('📥 Fetching profiles from DynamoDB (single source of truth)...');
      
      // Create promise for this load
      cloudLoadPromise = (async () => {
        try {
          const cloudProfiles = await getAllProfilesFromCloud();
          
          // Update local cache
          await chrome.storage.local.set({ [STORAGE_KEYS.FORM_DATA]: cloudProfiles });
          
          hasLoadedFromCloud = true;
          console.log(`✅ Loaded ${cloudProfiles.length} profile(s) from cloud`);
          return cloudProfiles;
        } catch (cloudError) {
          console.warn('⚠️ Failed to fetch from cloud, using local cache:', cloudError);
          hasLoadedFromCloud = false; // Reset so we can try again next time
          throw cloudError;
        } finally {
          cloudLoadPromise = null;
        }
      })();
      
      try {
        return await cloudLoadPromise;
      } catch (error) {
        // Fall through to local cache
      }
    } else if (auth && hasLoadedFromCloud) {
      console.log('ℹ️ Using cached profiles (already loaded from cloud)');
    } else {
      console.log('ℹ️ Not signed in, using local cache');
    }
    
    // Use local cache (offline mode, not signed in, or after initial load)
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
 * Force refresh profiles from DynamoDB
 */
export async function refreshProfilesFromCloud(): Promise<SavedFormData[]> {
  hasLoadedFromCloud = false;
  return await getAllFormData(true);
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
  const profileToDelete = allData.find(d => d.id === id);
  
  const filtered = allData.filter(d => d.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.FORM_DATA]: filtered });
  
  // Invalidate cache for all keys in deleted profile
  if (profileToDelete && profileToDelete.data) {
    const keys = Object.keys(profileToDelete.data);
    for (const key of keys) {
      await invalidateCacheForKey(key);
    }
  }
  
  // Trigger profile change callbacks (debounced)
  triggerProfileChangeCallbacks();
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
      triggerProfileChangeCallbacks();
    }
    
    if (parsed.settings) {
      await saveSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
    }
  } catch (error) {
    console.error('Failed to import data:', error);
    throw new Error('Invalid import file format');
  }
}

/**
 * Register callback for profile changes
 */
export function onProfileChange(callback: ProfileChangeCallback): () => void {
  profileChangeCallbacks.push(callback);
  
  return () => {
    profileChangeCallbacks = profileChangeCallbacks.filter(cb => cb !== callback);
  };
}

/**
 * Trigger profile change callbacks (debounced)
 */
function triggerProfileChangeCallbacks(): void {
  if (profileChangeDebounceTimer !== null) {
    clearTimeout(profileChangeDebounceTimer);
  }
  
  profileChangeDebounceTimer = window.setTimeout(async () => {
    console.log(`🔄 [PROFILE] Profile changed - triggering ${profileChangeCallbacks.length} callback(s)`);
    
    await invalidateBatchCache();
    
    for (const callback of profileChangeCallbacks) {
      try {
        await callback();
      } catch (error) {
        console.error('Profile change callback error:', error);
      }
    }
    
    profileChangeDebounceTimer = null;
  }, 300);
}

