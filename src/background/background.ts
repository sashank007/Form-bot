/**
 * Background service worker
 */

import { Message, FormDetectionResult } from '../types';
import { startZapierPolling } from '../utils/zapierReceiver';
import { getSettings } from '../utils/storage';
import { syncFromDynamoDB } from '../utils/dynamodbSync';
import { isSignedIn } from '../utils/googleAuth';

// Track tabs with detected forms
const tabsWithForms: Set<number> = new Set();

// Start polling for Zapier data
startZapierPolling((data) => {
  console.log('📥 Background: New CRM data received via Zapier', data);
  
  // Notify all open tabs
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'CRM_DATA_RECEIVED',
          payload: data,
        }).catch(() => {
          // Tab might not have content script, ignore
        });
      }
    });
  });
});

// Lambda API Auto-Sync (every 10 seconds) - Automatic, no configuration needed
setInterval(async () => {
  const settings = await getSettings();
  
  if (settings.enterpriseMode && settings.autoSyncEnabled) {
    const signedIn = await isSignedIn();
    
    if (signedIn) {
      try {
        const count = await syncFromDynamoDB({}); // Uses hardcoded Lambda URL
        
        if (count > 0) {
          console.log(`✅ CRM auto-sync: ${count} new profile(s) created`);
          
          // Show notification
          chrome.notifications?.create({
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/formbot_beaver_transparent.png'),
            title: 'FormBot: New CRM Data',
            message: `${count} new profile(s) synced from your CRM`,
          });
        }
      } catch (error) {
        console.error('CRM auto-sync failed:', error);
      }
    }
  }
}, 10000); // 10 seconds

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'formbot-fill-from-resume',
    title: 'Form Bot: Fill from Resume/Profile',
    contexts: ['page', 'editable'],
  });
});

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true;
});

/**
 * Handle message routing
 */
function handleMessage(message: Message, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) {
  switch (message.type) {
    case 'FORM_DETECTED':
      handleFormDetected(message.payload, sender.tab?.id);
      break;
      
    default:
      // Forward other messages if needed
      break;
  }
}

/**
 * Handle form detection notification
 */
function handleFormDetected(result: FormDetectionResult, tabId?: number) {
  if (!tabId) return;
  
  const fieldCount = result.fields.filter(f => f.confidence > 0).length;
  
  if (fieldCount > 0) {
    tabsWithForms.add(tabId);
    
    // Update badge to show form was detected
    chrome.action.setBadgeText({
      text: fieldCount.toString(),
      tabId,
    });
    
    chrome.action.setBadgeBackgroundColor({
      color: '#8B5CF6', // Purple from our theme
      tabId,
    });
  } else {
    tabsWithForms.delete(tabId);
    chrome.action.setBadgeText({
      text: '',
      tabId,
    });
  }
}

/**
 * Clean up when tab is closed
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  tabsWithForms.delete(tabId);
});

/**
 * Clear badge when navigating to a new page
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({
      text: '',
      tabId,
    });
    tabsWithForms.delete(tabId);
  }
});

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'formbot-fill-from-resume' && tab?.id) {
    // Send message to content script to fill from resume
    chrome.tabs.sendMessage(tab.id, {
      type: 'FILL_FROM_RESUME',
    }).catch(err => {
      console.error('Failed to send fill from resume message:', err);
    });
  }
});

console.log('Form Bot: Background service worker initialized');

