/**
 * Privacy Settings Component
 */

import React from 'react';
import { Settings } from '../../types';

interface PrivacySettingsProps {
  settings: Settings;
  onChange: (settings: Partial<Settings>) => void;
}

const PrivacySettings: React.FC<PrivacySettingsProps> = ({ settings, onChange }) => {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Privacy & Settings</h2>
        
        {/* Auto-fill Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-card shadow p-6 space-y-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Auto-Fill Preferences</h3>
          
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <label className="font-medium text-gray-900 dark:text-gray-100">Enable Auto-Fill</label>
              <p className="text-sm text-gray-500 dark:text-gray-400">Automatically detect and fill forms on web pages</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoFillEnabled}
                onChange={(e) => onChange({ autoFillEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex-1">
              <label className="font-medium text-gray-900 dark:text-gray-100">Highlight Fields</label>
              <p className="text-sm text-gray-500 dark:text-gray-400">Visually highlight fields when filling forms</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.highlightFields}
                onChange={(e) => onChange({ highlightFields: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
            </label>
          </div>

          <div>
            <label className="block font-medium text-gray-900 dark:text-gray-100 mb-2">
              Minimum Confidence Level: {settings.minConfidence}%
            </label>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Only fill fields with confidence above this threshold
            </p>
            <input
              type="range"
              min="50"
              max="100"
              step="5"
              value={settings.minConfidence}
              onChange={(e) => onChange({ minConfidence: parseInt(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>More fills (50%)</span>
              <span>More accurate (100%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Enhancement */}
      <div className="bg-white dark:bg-gray-800 rounded-card shadow p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">AI Enhancement (Optional)</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Use OpenAI to improve field matching for complex forms
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex-1">
            <label className="font-medium text-gray-900 dark:text-gray-100">Enable OpenAI</label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Only field names are sent, never your personal data
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.openAIEnabled}
              onChange={(e) => onChange({ openAIEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
          </label>
        </div>

        {settings.openAIEnabled && (
          <>
            <div>
              <label className="block font-medium text-gray-900 dark:text-gray-100 mb-2">
                OpenAI API Key
              </label>
              <input
                type="password"
                value={settings.openAIKey}
                onChange={(e) => onChange({ openAIKey: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-purple focus:border-transparent"
                placeholder="sk-proj-..."
              />
              {settings.openAIKey && !settings.openAIKey.startsWith('sk-') && (
                <p className="text-xs text-danger mt-2">
                  ⚠️ Invalid key format. OpenAI keys start with "sk-"
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Your API key is stored locally. Get one at{' '}
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary-purple hover:underline">
                  OpenAI Platform
                </a>
                {' • '}
                <a href="https://platform.openai.com/account/billing" target="_blank" rel="noopener noreferrer" className="text-primary-purple hover:underline">
                  Add Credits
                </a>
              </p>
            </div>
            
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
              <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-2 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                AI Hybrid Mode Active
              </h4>
              <ul className="text-sm text-purple-800 dark:text-purple-200 space-y-1">
                <li>✓ Local matching for high-confidence fields (instant, free)</li>
                <li>✓ AI analysis for uncertain fields (&lt;85% confidence)</li>
                <li>✓ Smarter matching with context understanding</li>
                <li>✓ Typical cost: $0.001 - $0.01 per form page</li>
              </ul>
            </div>
          </>
        )}
      </div>

      {/* Appearance */}
      <div className="bg-white dark:bg-gray-800 rounded-card shadow p-6 space-y-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Appearance</h3>
        
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <label className="font-medium text-gray-900 dark:text-gray-100">Dark Mode</label>
            <p className="text-sm text-gray-500 dark:text-gray-400">Use dark theme for the extension interface</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.darkMode}
              onChange={(e) => onChange({ darkMode: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
          </label>
        </div>
      </div>

      {/* Privacy Notice */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-card p-6">
        <div className="flex items-start">
          <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 mt-1 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <div>
            <h4 className="font-semibold text-blue-900 dark:text-blue-100">Privacy First</h4>
            <ul className="mt-2 text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>• All form data is stored locally on your device</li>
              <li>• No data is sent to our servers</li>
              <li>• OpenAI only receives field names, never your personal information</li>
              <li>• You can export or delete your data anytime</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacySettings;

