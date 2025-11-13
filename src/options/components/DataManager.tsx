/**
 * Data Manager Component - Manage saved form data
 */

import React, { useEffect, useState } from 'react';
import { SavedFormData, FormData } from '../../types';
import { getAllFormData, saveFormData, deleteFormData, exportData, importData } from '../../utils/storage';
import { PROFILE_TEMPLATES, createProfileFromTemplate } from '../../utils/profileTemplates';

const DataManager: React.FC = () => {
  const [profiles, setProfiles] = useState<SavedFormData[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<FormData>({});
  const [editingName, setEditingName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    const data = await getAllFormData();
    setProfiles(data);
  };

  const handleEdit = (profile: SavedFormData) => {
    setEditingId(profile.id);
    setEditingData({ ...profile.data });
    setEditingName(profile.name);
  };

  const handleSave = async () => {
    if (!editingId) return;

    const profile: SavedFormData = {
      id: editingId,
      name: editingName,
      data: editingData,
      createdAt: profiles.find(p => p.id === editingId)?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    await saveFormData(profile);
    setEditingId(null);
    setEditingData({});
    setEditingName('');
    loadProfiles();
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
    setShowAddForm(true);
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
    { key: 'firstName', label: 'First Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'address', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'zipCode', label: 'Zip Code' },
    { key: 'country', label: 'Country' },
    { key: 'company', label: 'Company' },
  ];

  const commonFieldKeys = commonFields.map(f => f.key);
  const customFields = Object.entries(editingData).filter(([key]) => !commonFieldKeys.includes(key));

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Form Data Profiles</h2>
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
          <button onClick={handleAddNew} className="btn-primary">
            <svg className="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Profile
          </button>
        </div>
      </div>

      {/* Template Selector */}
      {showTemplateSelector && (
        <div className="bg-white dark:bg-gray-800 rounded-card shadow-lg p-6 border-2 border-primary-purple">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Choose Profile Template</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Select a pre-built template with common fields, or start from scratch
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {PROFILE_TEMPLATES.map(template => (
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
            <div className="flex gap-2">
              <button onClick={handleSave} className="btn-primary">Save</button>
              <button onClick={handleCancel} className="btn-secondary">Cancel</button>
            </div>
          </div>

          {/* Common Fields */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Common Fields</h3>
            <div className="grid grid-cols-2 gap-4">
              {commonFields.map(field => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {field.label}
                  </label>
                  <input
                    type="text"
                    value={editingData[field.key] || ''}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-purple focus:border-transparent"
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Custom Fields */}
          {customFields.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Custom Fields</h3>
              <div className="space-y-3">
                {customFields.map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </label>
                      <input
                        type="text"
                        value={value}
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
                ))}
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

      {/* Profiles List */}
      <div className="space-y-4">
        {profiles.length === 0 && !editingId && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-card">
            <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">No profiles yet</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Create your first profile to start auto-filling forms</p>
          </div>
        )}

        {profiles.map(profile => (
          editingId === profile.id ? null : (
            <div key={profile.id} className="bg-white dark:bg-gray-800 rounded-card shadow p-6 hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{profile.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Last updated: {new Date(profile.updatedAt).toLocaleDateString()}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    {Object.entries(profile.data).slice(0, 6).map(([key, value]) => (
                      value && (
                        <div key={key}>
                          <span className="text-gray-600 dark:text-gray-400">{key}:</span>
                          <span className="ml-1 text-gray-900 dark:text-gray-100">{value}</span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleEdit(profile)}
                    className="p-2 text-primary-purple hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(profile.id)}
                    className="p-2 text-danger hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
};

export default DataManager;

