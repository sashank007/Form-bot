/**
 * Data Manager Component - Manage saved form data
 */

import React, { useEffect, useState } from 'react';
import { SavedFormData, FormData, ProfileType } from '../../types';
import { getAllFormData, saveFormData, deleteFormData, exportData, importData } from '../../utils/storage';
import { PROFILE_TEMPLATES, createProfileFromTemplate, ProfileTemplate } from '../../utils/profileTemplates';
import { getAuth, UserAuth } from '../../utils/googleAuth';
import UnifiedProfile from './UnifiedProfile';

const DataManager: React.FC = () => {
  const [profiles, setProfiles] = useState<SavedFormData[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<FormData>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [userAuth, setUserAuth] = useState<UserAuth | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    const loadData = async () => {
      try {
        const [auth, profiles] = await Promise.all([getAuth(), getAllFormData()]);
        if (isMounted) {
          setUserAuth(auth);
          setProfiles(profiles);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Failed to load data:', error);
        }
      }
    };
    
    loadData();
    
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.formbot_data && isMounted) {
        console.log('📥 Profile data changed, refreshing...');
        loadData();
      }
    };
    
    chrome.storage.onChanged.addListener(handleStorageChange);
    
    return () => {
      isMounted = false;
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const loadProfiles = async () => {
    const data = await getAllFormData();
    setProfiles(data);
  };

  const getUnifiedProfile = (): SavedFormData => {
    const existing = profiles.find(p => p.id === 'unified_profile' || p.name === 'My Profile');
    if (existing) return existing;
    return {
      id: 'unified_profile',
      name: 'My Profile',
      data: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  };

  const handleUnifiedProfileSave = async (data: FormData) => {
    const profile: SavedFormData = {
      id: 'unified_profile',
      name: userAuth?.name ? `${userAuth.name}'s Profile` : 'My Profile',
      data,
      profileType: 'user',
      createdAt: getUnifiedProfile().createdAt,
      updatedAt: Date.now(),
    };
    await saveFormData(profile);
    loadProfiles();
  };

  const handleEdit = (profile: SavedFormData) => {
    setEditingId(profile.id);
    setEditingData({ ...profile.data });
    setEditingName(profile.name);
  };

  const handleSave = async () => {
    if (!editingId) return;

    setSaveStatus('saving');

    try {
      const profile: SavedFormData = {
        id: editingId,
        name: editingName,
        data: editingData,
        createdAt: profiles.find(p => p.id === editingId)?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      await saveFormData(profile);
      setSaveStatus('success');
      
      // Show success briefly then reset
      setTimeout(() => {
        setSaveStatus('idle');
        setEditingId(null);
        setEditingData({});
        setEditingName('');
      }, 1500);
      
      loadProfiles();
    } catch (error) {
      console.error('Failed to save profile:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditingData({});
    setEditingName('');
    setShowAddForm(false);
    setShowTemplateSelector(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this profile?')) {
      await deleteFormData(id);
      loadProfiles();
    }
  };

  const handleAddNew = () => {
    setShowTemplateSelector(true);
  };

  const handleSelectTemplate = (templateId: string) => {
    const template = PROFILE_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    const newId = `profile_${Date.now()}`;
    setEditingId(newId);
    setEditingName(template.name);
    setEditingData(createProfileFromTemplate(template));
    setShowTemplateSelector(false);
    setShowAddForm(true);
  };

  const handleCreateBlank = () => {
    const newId = `profile_${Date.now()}`;
    setEditingId(newId);
    setEditingName('New Profile');
    setEditingData({});
    setShowTemplateSelector(false);
  };

  const handleExport = async () => {
    const json = await exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `formbot-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    try {
      await importData(text);
      loadProfiles();
      alert('Data imported successfully!');
    } catch (error) {
      alert('Failed to import data. Please check the file format.');
    }
  };

  const updateField = (key: string, value: string) => {
    setEditingData(prev => ({ ...prev, [key]: value }));
  };

  const deleteField = (key: string) => {
    setEditingData(prev => {
      const newData = { ...prev };
      delete newData[key];
      return newData;
    });
  };

  const addCustomField = () => {
    if (newFieldKey.trim() && !editingData.hasOwnProperty(newFieldKey)) {
      updateField(newFieldKey, newFieldValue);
      setNewFieldKey('');
      setNewFieldValue('');
    }
  };

  const commonFields = [
    { key: 'firstName', label: 'First Name', type: 'text' },
    { key: 'lastName', label: 'Last Name', type: 'text' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone', type: 'tel' },
    { key: 'dateOfBirth', label: 'Date of Birth', type: 'date' },
    { key: 'address', label: 'Address', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'zipCode', label: 'Zip Code', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'company', label: 'Company', type: 'text' },
    { key: 'startDate', label: 'Start Date', type: 'date' },
  ];

  const commonFieldKeys = commonFields.map(f => f.key);
  const customFields = Object.entries(editingData).filter(([key]) => !commonFieldKeys.includes(key));

  const getProfileTypeBadge = (profileType?: ProfileType) => {
    if (!profileType || profileType === 'user') return null;
    
    const badges: Record<ProfileType, { label: string; color: string; bgColor: string }> = {
      'google-sheets': { 
        label: 'Google Sheets', 
        color: 'text-green-700 dark:text-green-300',
        bgColor: 'bg-green-100 dark:bg-green-900/30'
      },
      'crm': { 
        label: 'CRM', 
        color: 'text-blue-700 dark:text-blue-300',
        bgColor: 'bg-blue-100 dark:bg-blue-900/30'
      },
      'zapier': { 
        label: 'Zapier', 
        color: 'text-purple-700 dark:text-purple-300',
        bgColor: 'bg-purple-100 dark:bg-purple-900/30'
      },
      'resume': { 
        label: 'Resume', 
        color: 'text-orange-700 dark:text-orange-300',
        bgColor: 'bg-orange-100 dark:bg-orange-900/30'
      },
      'user': { 
        label: 'User', 
        color: 'text-gray-700 dark:text-gray-300',
        bgColor: 'bg-gray-100 dark:bg-gray-900/30'
      },
    };
    
    const badge = badges[profileType];
    if (!badge) return null;
    
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${badge.color} ${badge.bgColor} border border-current/20`}>
        {badge.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header - Single Profile Mode */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          My Profile
        </h2>
        <div className="flex gap-3">
          <label className="btn-secondary cursor-pointer">
            <svg className="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
          <button onClick={handleExport} className="btn-secondary" disabled={profiles.length === 0}>
            <svg className="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
        </div>
      </div>

      {/* Unified Profile View - Always shown */}
      <UnifiedProfile
        profileData={getUnifiedProfile().data}
        onSave={handleUnifiedProfileSave}
        userAuth={userAuth}
      />

      {/* Legacy profile editing (hidden by default, shown when editing old profiles) */}
      {editingId && editingId !== 'unified_profile' && (
        <>

      {/* Template Selector */}
      {showTemplateSelector && (
        <div className="bg-white dark:bg-gray-800 rounded-card shadow-lg p-6 border-2 border-primary-purple">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Choose Profile Template</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Select a pre-built template with common fields, or start from scratch
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {PROFILE_TEMPLATES.map((template: ProfileTemplate) => (
              <button
                key={template.id}
                onClick={() => handleSelectTemplate(template.id)}
                className="text-left p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-purple hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all"
              >
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{template.icon}</span>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">{template.name}</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{template.description}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      {template.fields.length} pre-configured fields
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={handleCreateBlank} className="flex-1 btn-secondary">
              Start from Scratch (Empty Profile)
            </button>
            <button onClick={() => setShowTemplateSelector(false)} className="flex-1 btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Editing Form */}
      {editingId && !showTemplateSelector && (
        <div className="bg-white dark:bg-gray-800 rounded-card shadow-lg p-6 border-2 border-primary-purple">
          <div className="flex justify-between items-center mb-4">
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              className="text-xl font-bold bg-transparent border-b-2 border-gray-300 dark:border-gray-600 focus:border-primary-purple outline-none text-gray-900 dark:text-gray-100"
              placeholder="Profile Name"
            />
            <div className="flex gap-2 items-center">
              <button 
                onClick={handleSave} 
                className="btn-primary"
                disabled={saveStatus === 'saving'}
              >
                {saveStatus === 'saving' && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2"></div>
                )}
                {saveStatus === 'saving' ? 'Saving...' : 'Save'}
              </button>
              <button onClick={handleCancel} className="btn-secondary">Cancel</button>
              {saveStatus === 'success' && (
                <span className="text-green-600 dark:text-green-400 text-sm font-medium flex items-center">
                  <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Saved & Synced to Cloud
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-red-600 dark:text-red-400 text-sm font-medium">
                  ⚠️ Saved locally (cloud sync failed)
                </span>
              )}
            </div>
          </div>

          {/* Common Fields */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Common Fields</h3>
            <div className="grid grid-cols-2 gap-4">
              {commonFields.map(field => {
                // Safely convert value to string for input field
                const rawValue = editingData[field.key];
                let stringValue: string;
                if (rawValue === null || rawValue === undefined) {
                  stringValue = '';
                } else if (typeof rawValue === 'object') {
                  // If it's an object or array, stringify it
                  stringValue = JSON.stringify(rawValue);
                } else {
                  stringValue = String(rawValue);
                }
                
                return (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {field.label}
                    </label>
                    <input
                      type={field.type}
                      value={stringValue}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-purple focus:border-transparent"
                      placeholder={field.type === 'date' ? '' : `Enter ${field.label.toLowerCase()}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom Fields */}
          {customFields.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Custom Fields</h3>
              <div className="space-y-3">
                {customFields.map(([key, value]) => {
                  // Safely convert value to string for input field
                  let stringValue: string;
                  if (value === null || value === undefined) {
                    stringValue = '';
                  } else if (typeof value === 'object') {
                    // If it's an object or array, stringify it
                    stringValue = JSON.stringify(value);
                  } else {
                    stringValue = String(value);
                  }
                  
                  return (
                    <div key={key} className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </label>
                        <input
                          type="text"
                          value={stringValue}
                          onChange={(e) => updateField(key, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-purple focus:border-transparent"
                          placeholder={`Enter ${key}`}
                        />
                      </div>
                      <button
                        onClick={() => deleteField(key)}
                        className="mt-6 p-2 text-danger hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Delete field"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add Custom Field */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Add Custom Field</h3>
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  type="text"
                  value={newFieldKey}
                  onChange={(e) => setNewFieldKey(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-purple focus:border-transparent"
                  placeholder="Field name (e.g., membershipNumber)"
                  onKeyPress={(e) => e.key === 'Enter' && addCustomField()}
                />
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  value={newFieldValue}
                  onChange={(e) => setNewFieldValue(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-purple focus:border-transparent"
                  placeholder="Value"
                  onKeyPress={(e) => e.key === 'Enter' && addCustomField()}
                />
              </div>
              <button
                onClick={addCustomField}
                disabled={!newFieldKey.trim()}
                className="btn-secondary whitespace-nowrap"
              >
                <svg className="w-5 h-5 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Add any custom fields that you commonly fill in forms (e.g., referral code, membership number, etc.)
            </p>
          </div>
        </div>
      )}

            </>
      )}
    </div>
  );
};

export default DataManager;

