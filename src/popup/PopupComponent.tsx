/**
 * Main Popup Component
 */

import React, { useEffect, useState } from 'react';
import QuickFill from './components/QuickFill';
import FormPreview from './components/FormPreview';
import { FormDetectionResult, Settings, SavedFormData } from '../types';
import { getSettings, getAllFormData } from '../utils/storage';

const Popup: React.FC = () => {
  const [formData, setFormData] = useState<FormDetectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<SavedFormData[]>([]);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const loadData = async () => {
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.id) {
        setLoading(false);
        return;
      }

      // Get form data from content script
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_FORM_DATA' });
      setFormData(response);

      // Load settings
      const loadedSettings = await getSettings();
      setSettings(loadedSettings);
      setDarkMode(loadedSettings.darkMode);

      // Load saved profiles
      const profiles = await getAllFormData();
      setSavedProfiles(profiles);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFillForm = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.id) return;

    await chrome.tabs.sendMessage(tab.id, {
      type: 'FILL_FORM',
      payload: {
        minConfidence: settings?.minConfidence || 70,
        highlight: settings?.highlightFields ?? true,
      },
    });

    // Reload data to show updated form
    setTimeout(loadData, 500);
  };

  const handleUndo = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.id) return;

    await chrome.tabs.sendMessage(tab.id, { type: 'UNDO_FILL' });
    setTimeout(loadData, 300);
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-purple border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
      </div>
    );
  }

  const hasFields = formData && formData.fields && formData.fields.length > 0;
  const fillableFields = formData?.fields.filter(f => f.confidence >= (settings?.minConfidence || 70)) || [];

  return (
    <div className="min-h-96 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="bg-gradient-primary p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h1 className="text-xl font-bold">Form Bot</h1>
          </div>
          <button
            onClick={openOptions}
            className="p-2 hover:bg-white/20 rounded-lg transition-all duration-smooth"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
        {hasFields && (
          <p className="text-sm mt-2 text-white/90">
            {fillableFields.length} field{fillableFields.length !== 1 ? 's' : ''} ready to fill
          </p>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {!hasFields ? (
          <div className="text-center py-8">
            <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="mt-4 text-gray-600 dark:text-gray-400">No forms detected on this page</p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">Navigate to a page with a form to get started</p>
          </div>
        ) : (
          <>
            {/* Quick Fill Button */}
            <QuickFill
              onFill={handleFillForm}
              onUndo={handleUndo}
              fillableCount={fillableFields.length}
              totalCount={formData.fields.length}
            />

            {/* Form Preview */}
            <FormPreview fields={formData.fields} minConfidence={settings?.minConfidence || 70} />

            {/* Saved Profiles Info */}
            {savedProfiles.length > 0 && (
              <div className="mt-4 p-3 glass-card">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Using data from: <span className="font-semibold">{savedProfiles[0].name}</span>
                </p>
                {savedProfiles.length > 1 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {savedProfiles.length - 1} more profile{savedProfiles.length > 2 ? 's' : ''} available
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* Quick Actions */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={openOptions}
            className="flex-1 btn-secondary text-sm"
          >
            Manage Data
          </button>
          {savedProfiles.length === 0 && (
            <button
              onClick={openOptions}
              className="flex-1 btn-primary text-sm"
            >
              Add Profile
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 text-center text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
        All data stored locally
      </div>
    </div>
  );
};

export default Popup;

