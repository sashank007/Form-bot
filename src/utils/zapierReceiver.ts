/**
 * Zapier Data Receiver - Polls for incoming CRM data
 */

import { saveFormData } from './storage';
import { SavedFormData } from '../types';

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
 * Process CRM data and create profile
 */
async function processCRMData(data: any): Promise<void> {
  console.log('🏢 Processing CRM data...');
  
  // Flatten the data
  const flattenedData: { [key: string]: string } = {};
  
  for (const [key, value] of Object.entries(data)) {
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

  // Create profile
  const profile: SavedFormData = {
    id: `crm_${Date.now()}`,
    name: `From CRM - ${new Date().toLocaleString()}`,
    data: flattenedData,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveFormData(profile);
  
  console.log('✅ Profile created from CRM data:', profile.name);

  // Show notification
  chrome.notifications?.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/formbot_icon.png'),
    title: 'FormBot: CRM Data Received',
    message: `Created profile "${profile.name}" with ${Object.keys(flattenedData).length} fields`,
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

