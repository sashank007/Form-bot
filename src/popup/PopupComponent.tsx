/**
 * Main Popup Component
 */

import React, { useEffect, useState } from 'react';
import QuickFill from './components/QuickFill';
import FormPreview from './components/FormPreview';
import { FormDetectionResult, Settings, SavedFormData } from '../types';
import { getSettings, getAllFormData, getFormDataById, saveSelectedProfile, getSelectedProfile } from '../utils/storage';
import { findMatchingTemplates } from '../utils/templateStorage';
import { validateFormData } from '../utils/validator';

const Popup: React.FC = () => {
  const [formData, setFormData] = useState<FormDetectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<SavedFormData[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [darkMode, setDarkMode] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [matchingTemplates, setMatchingTemplates] = useState<any[]>([]);
  const [validationIssues, setValidationIssues] = useState<any[]>([]);
  const [securityWarnings, setSecurityWarnings] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  // Re-match fields when profile changes
  useEffect(() => {
    if (selectedProfileId && formData) {
      rematchFields();
      // Save selected profile for next time
      saveSelectedProfile(selectedProfileId);
      // Re-validate with new profile
      validateProfileData(selectedProfileId);
    }
  }, [selectedProfileId]);

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
      
      // Restore last selected profile or use most recent
      let profileIdToUse = '';
      if (profiles.length > 0 && !selectedProfileId) {
        const lastSelected = await getSelectedProfile();
        
        // Check if last selected profile still exists
        const profileExists = lastSelected && profiles.find(p => p.id === lastSelected);
        
        if (profileExists) {
          profileIdToUse = lastSelected;
          setSelectedProfileId(lastSelected);
        } else {
          // Fall back to most recent
          const sorted = profiles.sort((a, b) => b.updatedAt - a.updatedAt);
          profileIdToUse = sorted[0].id;
          setSelectedProfileId(sorted[0].id);
        }
      }
      
      // Check for matching templates
      if (response.fields && response.fields.length > 0) {
        const fieldStructure = response.fields.map((f: any) => f.field.label || f.field.name || '').filter((s: string) => s);
        const matches = await findMatchingTemplates(window.location.href, fieldStructure);
        setMatchingTemplates(matches.slice(0, 3)); // Top 3 matches
      }
      
      // Validate profile data for this form (after profile is selected)
      if (profileIdToUse) {
        // Small delay to ensure formData state is updated
        setTimeout(() => validateProfileData(profileIdToUse), 200);
      }
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
        profileId: selectedProfileId,
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

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;

    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SAVE_TEMPLATE',
        payload: {
          name: templateName,
          profileId: selectedProfileId,
        },
      });

      alert(`✓ Template "${templateName}" saved successfully!\n\nYou can now use it on similar forms.`);
      setShowSaveTemplate(false);
      setTemplateName('');
    } catch (error) {
      alert('Failed to save template');
    }
  };

  const handleApplyTemplate = async (templateId: string) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;

    await chrome.tabs.sendMessage(tab.id, {
      type: 'APPLY_TEMPLATE',
      payload: { templateId },
    });

    setTimeout(loadData, 500);
  };

  const rematchFields = async () => {
    if (!selectedProfileId) return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.id) return;

    try {
      // Ask content script to re-match with the selected profile
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'REMATCH_FIELDS',
        payload: { profileId: selectedProfileId },
      });

      if (response) {
        setFormData(response);
        // Re-validate with new profile after rematch
        setTimeout(() => validateProfileData(selectedProfileId), 100);
      }
    } catch (error) {
      console.error('Failed to rematch fields:', error);
    }
  };

  const validateProfileData = async (profileId: string) => {
    console.log('Form Bot (Popup): validateProfileData called with profile:', profileId);
    
    if (!profileId) {
      console.log('Form Bot (Popup): No profile ID, skipping validation');
      return;
    }
    
    if (!formData || !formData.fields || formData.fields.length === 0) {
      console.log('Form Bot (Popup): No form data yet, will retry...');
      // Retry after a short delay
      setTimeout(() => validateProfileData(profileId), 300);
      return;
    }
    
    const profile = await getFormDataById(profileId);
    if (!profile) {
      console.log('Form Bot (Popup): Profile not found');
      return;
    }

    // Only validate data that will actually be filled
    const dataToValidate: { [key: string]: string } = {};
    const fieldTypes: { [key: string]: string } = {};
    
    formData.fields.forEach(f => {
      if (f.matchedKey && profile.data[f.matchedKey]) {
        // Only include fields that are matched and will be filled
        dataToValidate[f.matchedKey] = profile.data[f.matchedKey];
        fieldTypes[f.matchedKey] = f.fieldType;
      }
    });

    // If no fields to validate, clear warnings
    if (Object.keys(dataToValidate).length === 0) {
      console.log('Form Bot (Popup): No matched fields to validate');
      setValidationIssues([]);
      setSecurityWarnings([]);
      return;
    }

    console.log('Form Bot (Popup): Validating data:', dataToValidate);
    console.log('Form Bot (Popup): Field types:', fieldTypes);

    try {
      const validation = await validateFormData(
        dataToValidate,
        fieldTypes,
        window.location.href
      );

      console.log('Form Bot (Popup): Validation result:', validation);

      setValidationIssues(validation.issues);
      setSecurityWarnings(validation.securityWarnings);
      
      if (validation.issues.length > 0 || validation.securityWarnings.length > 0) {
        console.log('Form Bot (Popup): ⚠️ Issues found!', {
          issues: validation.issues.length,
          security: validation.securityWarnings.length
        });
      } else {
        console.log('Form Bot (Popup): ✓ No validation issues');
      }
    } catch (error) {
      console.error('Form Bot (Popup): Validation failed:', error);
    }
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
        <div className="flex items-center justify-between mb-3">
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

        {/* Profile Selector - Prominent */}
        {savedProfiles.length > 0 && (
          <div className="bg-white/10 backdrop-blur rounded-lg p-3 border border-white/20">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-white/80">Active Profile:</label>
              <span className="text-xs text-white/60">{savedProfiles.length} total</span>
            </div>
            <select
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              className="w-full px-3 py-2 bg-white/95 border border-white/30 rounded-lg text-sm text-gray-900 font-medium focus:ring-2 focus:ring-white focus:border-white focus:outline-none"
            >
              {savedProfiles
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map(profile => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} • {Object.keys(profile.data).length} fields
                  </option>
                ))}
            </select>
          </div>
        )}

        {hasFields && (
          <p className="text-sm mt-3 text-white/90">
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
            <FormPreview 
              fields={formData.fields} 
              minConfidence={settings?.minConfidence || 70}
              selectedProfileId={selectedProfileId}
            />

            {/* Validation Issues Preview */}
            {(validationIssues.length > 0 || securityWarnings.length > 0) && (
              <div className="mt-4 space-y-2">
                <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  ⚠️ Potential Issues Detected
                </h3>
                
                {/* Security Warnings */}
                {securityWarnings.map((warning: any, idx: number) => (
                  <div key={`sec-${idx}`} className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg p-3">
                    <p className="text-xs font-bold text-red-900 dark:text-red-100">
                      🚨 {warning.field}
                    </p>
                    <p className="text-xs text-red-800 dark:text-red-200 mt-1">
                      {warning.message}
                    </p>
                  </div>
                ))}
                
                {/* Validation Issues */}
                {validationIssues.map((issue: any, idx: number) => (
                  <div 
                    key={`val-${idx}`}
                    className={`rounded-lg p-2 border text-xs ${
                      issue.severity === 'error'
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                        : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700'
                    }`}
                  >
                    <p className={`font-semibold ${
                      issue.severity === 'error'
                        ? 'text-red-900 dark:text-red-100'
                        : 'text-yellow-900 dark:text-yellow-100'
                    }`}>
                      {issue.severity === 'error' ? '❌' : '⚠️'} {issue.field}
                    </p>
                    <p className={`mt-1 ${
                      issue.severity === 'error'
                        ? 'text-red-800 dark:text-red-200'
                        : 'text-yellow-800 dark:text-yellow-200'
                    }`}>
                      {issue.message}
                    </p>
                  </div>
                ))}
                
                <p className="text-xs text-gray-600 dark:text-gray-400 italic">
                  💡 Fix these in your profile or they'll be validated when you submit the form
                </p>
              </div>
            )}
          </>
        )}

        {/* Matching Templates */}
        {matchingTemplates.length > 0 && hasFields && (
          <div className="mt-4 space-y-2">
            <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              📋 Matching Templates
            </h3>
            {matchingTemplates.map(match => (
              <div
                key={match.template.id}
                className="glass-card p-2 flex items-center justify-between"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {match.template.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {Math.floor(match.score)}% match • {match.reason}
                  </p>
                </div>
                <button
                  onClick={() => handleApplyTemplate(match.template.id)}
                  className="btn-primary text-xs py-1 px-3"
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Save Template */}
        {hasFields && (
          <div className="mt-4">
            {!showSaveTemplate ? (
              <button
                onClick={() => setShowSaveTemplate(true)}
                className="w-full btn-secondary text-sm"
              >
                <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Save as Template
              </button>
            ) : (
              <div className="glass-card p-3 space-y-2">
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Template name (e.g., Job Application)"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  onKeyPress={(e) => e.key === 'Enter' && handleSaveTemplate()}
                />
                <div className="flex gap-2">
                  <button onClick={handleSaveTemplate} className="flex-1 btn-primary text-sm">
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setShowSaveTemplate(false);
                      setTemplateName('');
                    }}
                    className="flex-1 btn-secondary text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
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

