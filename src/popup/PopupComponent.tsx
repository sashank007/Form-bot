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
import { getAuth, UserAuth } from '../utils/googleAuth';

const Popup: React.FC = () => {
  const [formData, setFormData] = useState<FormDetectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMatching, setIsMatching] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<SavedFormData[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [darkMode, setDarkMode] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [matchingTemplates, setMatchingTemplates] = useState<any[]>([]);
  const [showSaveFilledForm, setShowSaveFilledForm] = useState(false);
  const [filledFormName, setFilledFormName] = useState('');
  const [validationIssues, setValidationIssues] = useState<any[]>([]);
  const [securityWarnings, setSecurityWarnings] = useState<any[]>([]);
  const [initialProfileSet, setInitialProfileSet] = useState(false);
  const [lastRematchedProfile, setLastRematchedProfile] = useState<string>('');
  const [userAuth, setUserAuth] = useState<UserAuth | null>(null);

  useEffect(() => {
    loadData();
    
    // Listen for storage changes to auto-refresh when profiles are deleted/updated
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.formbot_data) {
        console.log('📥 Profiles changed, refreshing popup...');
        loadProfiles();
      }
    };
    
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  useEffect(() => {
    if (!isMatching) return;
    
    const pollInterval = setInterval(async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.id) return;
        
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_FORM_DATA' });
        if (response) {
          setFormData(response);
          setIsMatching(response.isMatching || false);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 500);
    
    return () => clearInterval(pollInterval);
  }, [isMatching]);

  // Re-match fields only when user manually changes profile (not on initial load)
  useEffect(() => {
    if (!selectedProfileId || !formData) return;
    
    // Skip rematch if this is the initial profile selection or same profile
    if (!initialProfileSet) {
      setInitialProfileSet(true);
      setLastRematchedProfile(selectedProfileId);
      saveSelectedProfile(selectedProfileId);
      validateProfileData(selectedProfileId);
      return;
    }
    
    // Skip if we already rematched with this profile
    if (selectedProfileId === lastRematchedProfile) {
      return;
    }
    
    // User changed profile - do rematch
    setIsMatching(true);
    setLastRematchedProfile(selectedProfileId);
    rematchFields();
    saveSelectedProfile(selectedProfileId);
    validateProfileData(selectedProfileId);
  }, [selectedProfileId]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const loadProfiles = async () => {
    const profiles = await getAllFormData();
    setSavedProfiles(profiles);
    
    // If selected profile was deleted, select another
    if (selectedProfileId && !profiles.find(p => p.id === selectedProfileId)) {
      if (profiles.length > 0) {
        const sorted = profiles.sort((a, b) => b.updatedAt - a.updatedAt);
        setSelectedProfileId(sorted[0].id);
      } else {
        setSelectedProfileId('');
      }
    }
  };

  const loadData = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.id) {
        setLoading(false);
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_FORM_DATA' });
      setFormData(response);
      setIsMatching(response?.isMatching || false);

      const loadedSettings = await getSettings();
      setSettings(loadedSettings);
      setDarkMode(loadedSettings.darkMode);
      
      // Load Google user auth
      const auth = await getAuth();
      setUserAuth(auth);

      const profiles = await getAllFormData();
      setSavedProfiles(profiles);
      
      // ALWAYS use unified_profile - single profile per Google account
      const unifiedProfile = profiles.find(p => p.id === 'unified_profile');
      if (unifiedProfile) {
        setSelectedProfileId('unified_profile');
        setTimeout(() => validateProfileData('unified_profile'), 200);
      } else if (profiles.length > 0) {
        // Fallback to first profile if no unified yet
        const sorted = profiles.sort((a, b) => b.updatedAt - a.updatedAt);
        setSelectedProfileId(sorted[0].id);
        setTimeout(() => validateProfileData(sorted[0].id), 200);
      }
      
      // Check for matching templates
      if (response.fields && response.fields.length > 0) {
        const fieldStructure = response.fields.map((f: any) => f.field.label || f.field.name || '').filter((s: string) => s);
        const matches = await findMatchingTemplates(window.location.href, fieldStructure);
        setMatchingTemplates(matches.slice(0, 3));
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

    // Refresh form data without triggering rematch (just get current state)
    setTimeout(async () => {
      try {
        const response = await chrome.tabs.sendMessage(tab.id!, { type: 'GET_FORM_DATA' });
        setFormData(response);
        setIsMatching(response?.isMatching || false);
      } catch (error) {
        console.error('Failed to refresh form data:', error);
      }
    }, 500);
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

  const handleSaveFilledForm = async () => {
    if (!filledFormName.trim()) {
      alert('Please enter a profile name');
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) return;

    try {
      // Get filled form data from page
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'EXTRACT_FILLED_DATA',
      });

      if (!response || !response.data || Object.keys(response.data).length === 0) {
        alert('No filled fields found on this page');
        return;
      }

      // Create new profile from filled data
      const { saveFormData } = await import('../utils/storage');
      const newProfile = {
        id: `filled_${Date.now()}`,
        name: filledFormName,
        data: response.data,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveFormData(newProfile);

      alert(`✅ Success!\n\nSaved ${Object.keys(response.data).length} fields from this form as profile "${filledFormName}".\n\nGo to Data Management to view and edit.`);
      
      setShowSaveFilledForm(false);
      setFilledFormName('');
    } catch (error) {
      alert('Failed to save filled form data');
    }
  };

  const rematchFields = async () => {
    if (!selectedProfileId) return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.id) return;

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'REMATCH_FIELDS',
        payload: { profileId: selectedProfileId },
      });

      if (response) {
        setFormData(response);
        setIsMatching(response.isMatching || false);
        setTimeout(() => validateProfileData(selectedProfileId), 100);
      }
    } catch (error) {
      console.error('Failed to rematch fields:', error);
      setIsMatching(false);
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

    // Get secrets for this profile
    const { getProfileSecrets } = await import('../utils/secretsStorage');
    const profileSecrets = await getProfileSecrets(profileId);
    
    // Merge regular data and secrets (secrets take priority)
    const mergedData = { ...profile.data, ...profileSecrets };

    // Only validate data that will actually be filled
    const dataToValidate: { [key: string]: string } = {};
    const fieldTypes: { [key: string]: string } = {};
    
    formData.fields.forEach(f => {
      if (f.matchedKey && mergedData[f.matchedKey]) {
        // Only include fields that are matched and will be filled
        dataToValidate[f.matchedKey] = mergedData[f.matchedKey];
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

        {/* Single Profile - Google Account Linked */}
        {(() => {
          const currentProfile = savedProfiles.find(p => p.id === 'unified_profile') || savedProfiles[0];
          const fieldCount = currentProfile ? Object.keys(currentProfile.data || {}).length : 0;
          
          return (
            <div className="bg-white/10 backdrop-blur rounded-lg p-3 border border-white/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {userAuth?.picture ? (
                    <img 
                      src={userAuth.picture} 
                      alt="" 
                      className="w-9 h-9 rounded-full border-2 border-white/30"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center border-2 border-white/30">
                      <span className="text-white text-sm font-bold">
                        {userAuth?.name?.[0] || '?'}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">
                      {userAuth?.name || 'My Profile'}
                    </p>
                    <p className="text-xs text-white/70">
                      {fieldCount > 0 ? `${fieldCount} fields saved` : 'No data yet'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={openOptions}
                  className="px-3 py-1.5 text-xs bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors font-medium"
                >
                  Edit
                </button>
              </div>
            </div>
          );
        })()}

        {hasFields && (
          <p className="text-sm mt-3 text-white/90">
            {isMatching ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Analyzing {formData.fields.length} field{formData.fields.length !== 1 ? 's' : ''}...
              </span>
            ) : (
              `${fillableFields.length} field${fillableFields.length !== 1 ? 's' : ''} ready to fill`
            )}
          </p>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {!hasFields ? (
          <div className="text-center py-6">
            {/* Fun illustration */}
            <div className="relative w-24 h-24 mx-auto mb-4">
              {/* Background circle */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 rounded-full"></div>
              {/* Animated emoji */}
              <div className="absolute inset-0 flex items-center justify-center text-5xl animate-bounce" style={{ animationDuration: '2s' }}>
                🔍
              </div>
              {/* Sparkles */}
              <div className="absolute -top-1 -right-1 text-lg animate-pulse">✨</div>
              <div className="absolute -bottom-1 -left-1 text-sm animate-pulse" style={{ animationDelay: '0.5s' }}>✨</div>
            </div>
            
            {/* Witty headline */}
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">
              No forms here!
            </h3>
            
            {/* Helpful subtext */}
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-[200px] mx-auto">
              Try visiting a signup, checkout, or application page
            </p>
            
            {/* Suggestions */}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {['Sign up', 'Checkout', 'Apply'].map((suggestion, i) => (
                <span 
                  key={i}
                  className="px-3 py-1 text-xs font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 rounded-full"
                >
                  {suggestion}
                </span>
              ))}
            </div>
            
            {/* Tip */}
            <div className="mt-5 p-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg border border-amber-200 dark:border-amber-800/50">
              <p className="text-xs text-amber-800 dark:text-amber-200 flex items-center justify-center gap-2">
                <span>💡</span>
                <span>FormBot works best on forms with input fields</span>
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Quick Fill Button */}
            <QuickFill
              onFill={handleFillForm}
              onUndo={handleUndo}
              fillableCount={fillableFields.length}
              totalCount={formData.fields.length}
              isMatching={isMatching}
            />

            {/* Form Preview */}
            <FormPreview 
              fields={formData.fields} 
              minConfidence={settings?.minConfidence || 70}
              selectedProfileId={selectedProfileId}
              isMatching={isMatching}
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

        {/* Save Filled Form as Profile */}
        {hasFields && (
          <div className="mt-4">
            {!showSaveFilledForm ? (
              <button
                onClick={() => setShowSaveFilledForm(true)}
                className="w-full btn-secondary text-sm"
              >
                <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Save Filled Form as Profile
              </button>
            ) : (
              <div className="glass-card p-3 space-y-2">
                <p className="text-xs text-gray-700 dark:text-gray-300">
                  Save current filled values as a new profile
                </p>
                <input
                  type="text"
                  value={filledFormName}
                  onChange={(e) => setFilledFormName(e.target.value)}
                  placeholder="Profile name (e.g., From Google Form)"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  onKeyPress={(e) => e.key === 'Enter' && handleSaveFilledForm()}
                />
                <div className="flex gap-2">
                  <button onClick={handleSaveFilledForm} className="flex-1 btn-primary text-sm">
                    Save Profile
                  </button>
                  <button
                    onClick={() => {
                      setShowSaveFilledForm(false);
                      setFilledFormName('');
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

