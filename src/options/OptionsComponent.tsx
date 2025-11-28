/**
 * Options Page - Settings and Data Management
 */

import React, { useEffect, useState } from 'react';
import DataManager from './components/DataManager';
import PrivacySettings from './components/PrivacySettings';
import ResumeProfile from './components/ResumeProfile';
import TemplateManager from './components/TemplateManager';
import SecretsManager from './components/SecretsManager';
import DocumentScanner from './components/DocumentScanner';
import DocumentHistory from './components/DocumentHistory';
import EnterpriseSettings from './components/EnterpriseSettings';
import { Settings } from '../types';
import { getSettings, saveSettings } from '../utils/storage';

const Options: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'data' | 'templates' | 'secrets' | 'scanner' | 'documents' | 'resume' | 'enterprise' | 'settings'>('data');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    const load = async () => {
      const loadedSettings = await getSettings();
      if (isMounted) {
        setSettings(loadedSettings);
        setDarkMode(loadedSettings.darkMode);
      }
    };
    
    load();
    
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const htmlElement = document.documentElement;
    
    if (darkMode) {
      htmlElement.classList.add('dark');
    } else {
      htmlElement.classList.remove('dark');
    }
    
    // Cleanup: ensure class is removed on unmount if needed
    return () => {
      // Don't remove on cleanup as it might affect other components
      // The class will be managed by the darkMode state
    };
  }, [darkMode]);

  const loadSettings = async () => {
    const loadedSettings = await getSettings();
    setSettings(loadedSettings);
    setDarkMode(loadedSettings.darkMode);
  };

  const handleSettingsChange = async (newSettings: Partial<Settings>) => {
    if (!settings) return;

    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    await saveSettings(updated);
    
    if (newSettings.darkMode !== undefined) {
      setDarkMode(newSettings.darkMode);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-purple border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-300">Loading settings...</p>
        </div>
      </div>
    );
  }

  const beaverIconUrl = chrome.runtime.getURL('icons/formbot_head.png');

  return (
    <div 
      className="min-h-screen bg-gray-50 dark:bg-gray-900 relative"
      style={{
        backgroundImage: `url(${beaverIconUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Overlay to ensure content readability */}
      <div className="absolute inset-0 bg-gray-50/80 dark:bg-gray-900/85 pointer-events-none"></div>
      
      {/* Content wrapper */}
      <div className="relative z-10">
      {/* Header */}
      <header className="bg-gradient-primary text-white shadow-lg relative z-20">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <h1 className="text-2xl font-bold">Form Bot Settings</h1>
                <p className="text-sm text-white/80 mt-1">Manage your data and preferences</p>
              </div>
            </div>
            {saved && (
              <div className="bg-white/20 backdrop-blur px-4 py-2 rounded-lg animate-slide-in">
                <span className="text-sm font-medium">✓ Saved</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 shadow relative z-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('data')}
              className={`py-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'data'
                  ? 'border-primary-purple text-primary-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Data Management
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`py-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'templates'
                  ? 'border-primary-purple text-primary-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Templates
            </button>
            <button
              onClick={() => setActiveTab('secrets')}
              className={`py-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'secrets'
                  ? 'border-primary-purple text-primary-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Secrets Vault
            </button>
            <button
              onClick={() => setActiveTab('scanner')}
              className={`py-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'scanner'
                  ? 'border-primary-purple text-primary-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Document Scanner
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              className={`py-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'documents'
                  ? 'border-primary-purple text-primary-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Document History
            </button>
            <button
              onClick={() => setActiveTab('resume')}
              className={`py-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'resume'
                  ? 'border-primary-purple text-primary-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Resume Profile
            </button>
            <button
              onClick={() => setActiveTab('enterprise')}
              className={`py-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'enterprise'
                  ? 'border-primary-purple text-primary-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {settings?.enterpriseMode ? '🏢' : ''} Enterprise
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`py-4 px-2 border-b-2 font-medium transition-colors ${
                activeTab === 'settings'
                  ? 'border-primary-purple text-primary-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Privacy & Settings
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8 relative z-20">
        {activeTab === 'data' && <DataManager />}
        {activeTab === 'templates' && <TemplateManager />}
        {activeTab === 'secrets' && <SecretsManager />}
        {activeTab === 'scanner' && <DocumentScanner settings={settings} />}
        {activeTab === 'documents' && <DocumentHistory />}
        {activeTab === 'resume' && <ResumeProfile settings={settings} onChange={handleSettingsChange} />}
        {activeTab === 'enterprise' && <EnterpriseSettings settings={settings} onChange={handleSettingsChange} />}
        {activeTab === 'settings' && <PrivacySettings settings={settings} onChange={handleSettingsChange} />}
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 relative z-20">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
            Form Bot v1.0.0 - All data stored locally
          </p>
        </div>
      </footer>
      </div>
    </div>
  );
};

export default Options;

