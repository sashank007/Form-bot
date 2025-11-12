/**
 * Secrets Manager - Profile-based encrypted storage for sensitive data
 */

import React, { useEffect, useState } from 'react';
import { Secret, getProfileSecretsArray, saveSecretToProfile, deleteSecretFromProfile } from '../../utils/secretsStorage';
import { getAllFormData } from '../../utils/storage';
import { SavedFormData } from '../../types';

const SecretsManager: React.FC = () => {
  const [profiles, setProfiles] = useState<SavedFormData[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [showValues, setShowValues] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    loadProfiles();
  }, []);

  useEffect(() => {
    if (selectedProfileId) {
      loadSecrets();
    }
  }, [selectedProfileId]);

  const loadProfiles = async () => {
    const data = await getAllFormData();
    setProfiles(data);
    if (data.length > 0 && !selectedProfileId) {
      setSelectedProfileId(data[0].id);
    }
  };

  const loadSecrets = async () => {
    if (!selectedProfileId) return;
    const data = await getProfileSecretsArray(selectedProfileId);
    setSecrets(data);
  };

  const handleSave = async () => {
    if (!secretName.trim() || !secretValue.trim()) {
      alert('Please enter both name and value');
      return;
    }

    if (!selectedProfileId) {
      alert('Please select a profile first');
      return;
    }

    await saveSecretToProfile(selectedProfileId, secretName, secretValue);
    
    setShowAddForm(false);
    setEditingName(null);
    setSecretName('');
    setSecretValue('');
    loadSecrets();
  };

  const handleEdit = (secret: Secret) => {
    setEditingName(secret.name);
    setSecretName(secret.name);
    setSecretValue(secret.value);
    setShowAddForm(true);
  };

  const handleDelete = async (name: string) => {
    if (confirm('Delete this secret? This cannot be undone.')) {
      await deleteSecretFromProfile(selectedProfileId, name);
      loadSecrets();
    }
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingName(null);
    setSecretName('');
    setSecretValue('');
  };

  const toggleShowValue = (id: string) => {
    setShowValues(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const maskValue = (value: string) => {
    return '•'.repeat(Math.min(value.length, 20));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Secrets Vault</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Profile-based encrypted storage for sensitive credentials
          </p>
        </div>
        <button 
          onClick={() => setShowAddForm(true)} 
          className="btn-primary"
          disabled={!selectedProfileId}
        >
          <svg className="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Secret
        </button>
      </div>

      {/* Profile Selector */}
      {profiles.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-card shadow p-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Profile to Manage Secrets:
          </label>
          <select
            value={selectedProfileId}
            onChange={(e) => setSelectedProfileId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-purple focus:border-transparent"
          >
            {profiles.map(profile => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Secrets are stored separately for each profile
          </p>
        </div>
      )}

      {/* Security Notice */}
      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <div className="flex-1">
            <h4 className="font-semibold text-purple-900 dark:text-purple-100">🔒 Military-Grade Encryption</h4>
            <ul className="mt-2 text-sm text-purple-800 dark:text-purple-200 space-y-1">
              <li>• Secrets encrypted with AES-256 (same as banks use)</li>
              <li>• Stored locally on your device only</li>
              <li>• Never sent to any server (not even ours)</li>
              <li>• Auto-masked in UI (shown as ••••••)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="bg-white dark:bg-gray-800 rounded-card shadow-lg p-6 border-2 border-primary-purple">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
            {editingName ? 'Edit Secret' : 'Add New Secret'}
            <span className="text-sm font-normal text-gray-600 dark:text-gray-400 ml-2">
              for {profiles.find(p => p.id === selectedProfileId)?.name}
            </span>
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Secret Name
              </label>
              <input
                type="text"
                value={secretName}
                onChange={(e) => setSecretName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-purple focus:border-transparent"
                placeholder="e.g., GitHub Token, SSN, Bank Password"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Secret Value
              </label>
              <input
                type="password"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-purple focus:border-transparent font-mono"
                placeholder="••••••••••"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Will be encrypted and stored securely
              </p>
            </div>
            
            <div className="flex gap-2">
              <button onClick={handleSave} className="flex-1 btn-primary">
                {editingName ? 'Update' : 'Save'} Secret
              </button>
              <button onClick={handleCancel} className="flex-1 btn-secondary">
                Cancel
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
              Secret will be encrypted and stored in "{profiles.find(p => p.id === selectedProfileId)?.name}" profile
            </p>
          </div>
        </div>
      )}

      {/* Secrets List */}
      <div className="space-y-3">
        {secrets.length === 0 && !showAddForm && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-card">
            <svg className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">No secrets stored</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Add sensitive data like passwords, API keys, or SSN
            </p>
          </div>
        )}

        {secrets.map(secret => (
          <div key={secret.name} className="bg-white dark:bg-gray-800 rounded-card shadow p-4 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{secret.name}</h3>
                </div>
                
                <div className="mt-2 flex items-center gap-3">
                  <code className="text-sm bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded font-mono text-gray-900 dark:text-gray-100">
                    {showValues[secret.name] ? secret.value : maskValue(secret.value)}
                  </code>
                  <button
                    onClick={() => toggleShowValue(secret.name)}
                    className="text-xs text-primary-purple hover:text-primary-blue font-medium"
                  >
                    {showValues[secret.name] ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => handleEdit(secret)}
                  className="p-2 text-primary-purple hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                  title="Edit"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(secret.name)}
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
        ))}
      </div>

      {/* Usage Instructions */}
      {selectedProfileId && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">💡 How Secrets Work</h4>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>• Each profile has its own encrypted secrets vault</li>
            <li>• Secrets are AES-256 encrypted and stored locally</li>
            <li>• When filling with "{profiles.find(p => p.id === selectedProfileId)?.name}", its secrets are automatically used</li>
            <li>• Perfect for: Passwords, API keys, SSN, security answers, credit cards</li>
            <li>• Secrets override regular profile data (more secure)</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default SecretsManager;

