/**
 * Background service worker
 */

import { Message, FormDetectionResult } from '../types';
import { startZapierPolling } from '../utils/zapierReceiver';

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

// Note: DynamoDB sync now happens only once on initial load via getAllFormData()
// No constant polling - profiles are loaded when formbot is opened
// Users can manually refresh if needed

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

