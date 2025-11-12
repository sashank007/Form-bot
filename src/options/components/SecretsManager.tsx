/**
 * Secrets Manager - Encrypted storage for sensitive data
 */

import React, { useEffect, useState } from 'react';
import { Secret } from '../../utils/secretsStorage';
import { getAllSecrets, saveSecret, deleteSecret } from '../../utils/secretsStorage';

const SecretsManager: React.FC = () => {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [showValues, setShowValues] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    loadSecrets();
  }, []);

  const loadSecrets = async () => {
    const data = await getAllSecrets();
    setSecrets(data);
  };

  const handleSave = async () => {
    if (!secretName.trim() || !secretValue.trim()) {
      alert('Please enter both name and value');
      return;
    }

    const secret: Secret = {
      id: editingId || `secret_${Date.now()}`,
      name: secretName,
      value: secretValue,
      createdAt: editingId ? secrets.find(s => s.id === editingId)?.createdAt || Date.now() : Date.now(),
      updatedAt: Date.now(),
    };

    await saveSecret(secret);
    
    setShowAddForm(false);
    setEditingId(null);
    setSecretName('');
    setSecretValue('');
    loadSecrets();
  };

  const handleEdit = (secret: Secret) => {
    setEditingId(secret.id);
    setSecretName(secret.name);
    setSecretValue(secret.value);
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this secret? This cannot be undone.')) {
      await deleteSecret(id);
      loadSecrets();
    }
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingId(null);
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
            Encrypted storage for sensitive credentials (passwords, API keys, SSN, etc.)
          </p>
        </div>
        <button onClick={() => setShowAddForm(true)} className="btn-primary">
          <svg className="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Secret
        </button>
      </div>

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
            {editingId ? 'Edit Secret' : 'Add New Secret'}
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
                {editingId ? 'Update' : 'Save'} Secret
              </button>
              <button onClick={handleCancel} className="flex-1 btn-secondary">
                Cancel
              </button>
            </div>
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
          <div key={secret.id} className="bg-white dark:bg-gray-800 rounded-card shadow p-4 hover:shadow-lg transition-shadow">
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
                    {showValues[secret.id] ? secret.value : maskValue(secret.value)}
                  </code>
                  <button
                    onClick={() => toggleShowValue(secret.id)}
                    className="text-xs text-primary-purple hover:text-primary-blue font-medium"
                  >
                    {showValues[secret.id] ? 'Hide' : 'Show'}
                  </button>
                </div>
                
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Last updated: {new Date(secret.updatedAt).toLocaleString()}
                </p>
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
                  onClick={() => handleDelete(secret.id)}
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
      {secrets.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">💡 How to Use Secrets</h4>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>• Secrets are stored with AES-256 encryption</li>
            <li>• Use secret names in forms (e.g., if secret is "GitHub Token", create a field called "githubToken" in your profile)</li>
            <li>• Secret values automatically fill when field names match</li>
            <li>• Best for: Passwords, API keys, SSN, credit cards, security answers</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default SecretsManager;

