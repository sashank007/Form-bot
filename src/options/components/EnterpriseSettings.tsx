/**
 * Enterprise Settings Component
 */

import React, { useState, useEffect } from 'react';
import { Settings } from '../../types';
import { testZapierWebhook } from '../../utils/zapierIntegration';
import { getWebhookReceiverUrl } from '../../utils/zapierReceiver';
import { signInWithGoogle, signOut, getAuth, UserAuth } from '../../utils/googleAuth';
import { syncFromDynamoDB, testDynamoDBConnection, pushAllProfilesToCloud } from '../../utils/dynamodbSync';

interface EnterpriseSettingsProps {
  settings: Settings;
  onChange: (settings: Partial<Settings>) => void;
}

const EnterpriseSettings: React.FC<EnterpriseSettingsProps> = ({ settings, onChange }) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [webhookReceiverUrl, setWebhookReceiverUrl] = useState('');
  const [userAuth, setUserAuth] = useState<UserAuth | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pushingAll, setPushingAll] = useState(false);
  const [testingDynamoDB, setTestingDynamoDB] = useState(false);
  const [dynamoDBTestResult, setDynamoDBTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    // Get webhook receiver URL
    setWebhookReceiverUrl(getWebhookReceiverUrl());
    
    // Check if user is signed in
    loadUserAuth();
  }, []);

  const loadUserAuth = async () => {
    const auth = await getAuth();
    setUserAuth(auth);
  };

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      const auth = await signInWithGoogle();
      setUserAuth(auth);
      alert(`✅ Signed in successfully!\n\nEmail: ${auth.email}\nUser ID: ${auth.userId}`);
    } catch (error) {
      alert(`Failed to sign in: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    if (confirm('Sign out? You will need to sign in again to sync with DynamoDB.')) {
      await signOut();
      setUserAuth(null);
    }
  };

  const handleSyncNow = async () => {
    if (!userAuth) {
      alert('Please sign in with Google first');
      return;
    }

    setSyncing(true);
    try {
      const count = await syncFromDynamoDB({});

      alert(`✅ Sync complete!\n\n${count} new profile(s) pulled from cloud.`);
    } catch (error) {
      alert(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  const handlePushAllProfiles = async () => {
    if (!userAuth) {
      alert('Please sign in with Google first');
      return;
    }

    if (!confirm('Push ALL local profiles to cloud?\n\nThis will sync all your profiles to DynamoDB.')) {
      return;
    }

    setPushingAll(true);
    try {
      const result = await pushAllProfilesToCloud({});

      if (result.failed > 0) {
        alert(`⚠️ Sync completed with errors\n\n✅ Success: ${result.success}\n❌ Failed: ${result.failed}\n📊 Total: ${result.total}\n\nCheck console for details.`);
      } else {
        alert(`✅ All profiles synced successfully!\n\n${result.success} profile(s) pushed to cloud.`);
      }
    } catch (error) {
      alert(`Push failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setPushingAll(false);
    }
  };

  const handleTestDynamoDB = async () => {
    if (!userAuth) {
      alert('Please sign in with Google first');
      return;
    }

    setTestingDynamoDB(true);
    setDynamoDBTestResult(null);

    const result = await testDynamoDBConnection({});

    setDynamoDBTestResult(result);
    setTestingDynamoDB(false);
  };

  const handleTestWebhook = async () => {
    if (!settings.zapierWebhookUrl) {
      alert('Please enter a webhook URL first');
      return;
    }

    setTesting(true);
    setTestResult(null);

    const result = await testZapierWebhook(settings.zapierWebhookUrl);
    setTestResult(result);
    setTesting(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Enterprise Features</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Advanced features for power users and teams
            </p>
          </div>
          
          {/* Enterprise Mode Toggle */}
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enterpriseMode}
              onChange={(e) => onChange({ enterpriseMode: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-gradient-to-r peer-checked:from-purple-600 peer-checked:to-blue-600"></div>
            <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-100">
              {settings.enterpriseMode ? '🏢 Enterprise' : '⚡ Free'}
            </span>
          </label>
        </div>

        {!settings.enterpriseMode && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
              🚀 Unlock Enterprise Features
            </h4>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
              <li>✓ Zapier Integration - Send form data to 5000+ apps</li>
              <li>✓ Webhook Support - Trigger automations on form submission</li>
              <li>✓ Auto-fill from Zapier - Fill forms from your workflows</li>
              <li>✓ Team Profile Sharing (coming soon)</li>
              <li>✓ Analytics Dashboard (coming soon)</li>
            </ul>
            <button
              onClick={() => onChange({ enterpriseMode: true })}
              className="mt-4 btn-primary"
            >
              Enable Enterprise Mode (Free!)
            </button>
          </div>
        )}
      </div>

      {settings.enterpriseMode && (
        <>
          {/* Google Sign-In */}
          <div className="bg-white dark:bg-gray-800 rounded-card shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              🔐 Google Sign-In
            </h3>
            
            {!userAuth ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Sign in to sync data from your CRM via DynamoDB
                </p>
                <button
                  onClick={handleGoogleSignIn}
                  disabled={signingIn}
                  className="btn-primary flex items-center gap-2"
                >
                  {signingIn ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Signing in...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Sign in with Google
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  {userAuth.picture && (
                    <img src={userAuth.picture} alt="Profile" className="w-12 h-12 rounded-full" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{userAuth.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{userAuth.email}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 font-mono">ID: {userAuth.userId}</p>
                  </div>
                  <button onClick={handleSignOut} className="btn-secondary text-sm">
                    Sign Out
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  All DynamoDB data will be synced for this user ID
                </p>
              </div>
            )}
          </div>

          {/* CRM Sync Configuration */}
          {userAuth && (
            <div className="bg-white dark:bg-gray-800 rounded-card shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                ☁️ CRM Data Sync
              </h3>
              
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <p className="text-sm text-green-800 dark:text-green-200">
                    ✓ Connected to FormBot Cloud
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                    Ready to sync employee data from your CRM
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleTestDynamoDB}
                    disabled={testingDynamoDB}
                    className="btn-secondary"
                  >
                    {testingDynamoDB ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button
                    onClick={handleSyncNow}
                    disabled={syncing}
                    className="btn-primary"
                  >
                    {syncing ? 'Syncing...' : '⬇️ Pull from Cloud'}
                  </button>
                  <button
                    onClick={handlePushAllProfiles}
                    disabled={pushingAll}
                    className="btn-primary"
                  >
                    {pushingAll ? 'Pushing...' : '⬆️ Push All to Cloud'}
                  </button>
                </div>

                {dynamoDBTestResult && (
                  <div className={`p-3 rounded-lg ${
                    dynamoDBTestResult.success
                      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200'
                      : 'bg-red-50 dark:bg-red-900/20 border border-red-200'
                  }`}>
                    <p className={`text-sm ${
                      dynamoDBTestResult.success ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {dynamoDBTestResult.message}
                    </p>
                  </div>
                )}

                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                  <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Sync Options
                  </h4>
                  <ul className="text-xs text-purple-800 dark:text-purple-200 space-y-2">
                    <li><strong>⬇️ Pull from Cloud:</strong> Download profiles from DynamoDB (CRM/team data)</li>
                    <li><strong>⬆️ Push All to Cloud:</strong> Upload ALL your local profiles to DynamoDB</li>
                    <li><strong>Auto-sync:</strong> Automatically push new profiles when saved</li>
                  </ul>
                </div>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.autoSyncEnabled}
                    onChange={(e) => onChange({ autoSyncEnabled: e.target.checked })}
                    className="w-4 h-4 text-primary-purple border-gray-300 rounded focus:ring-primary-purple"
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    Auto-sync profiles to cloud when saving
                  </span>
                </label>
              </div>

              <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  📖 DynamoDB Table Structure
                </h4>
                <pre className="text-xs text-blue-800 dark:text-blue-200 bg-blue-100 dark:bg-blue-900/30 p-3 rounded overflow-x-auto">
{`Partition Key: userId (String)
Sort Key: timestamp (Number)

Example Item:
{
  "userId": "${userAuth?.userId || 'google_123456789'}",
  "timestamp": ${Date.now()},
  "itemId": "employee_001",
  "name": "Employee: John Doe",
  "data": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@company.com",
    ...
  }
}`}
                </pre>
              </div>
            </div>
          )}

          {/* Receive Data from CRM (via Zapier) */}
          <div className="bg-white dark:bg-gray-800 rounded-card shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              📥 Receive Data from CRM (Workday, Zoho, etc.)
            </h3>
            
            <div className="space-y-4">
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <p className="text-sm font-medium text-purple-900 dark:text-purple-100 mb-2">
                  Webhook Receiver URL:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={webhookReceiverUrl}
                    readOnly
                    className="flex-1 px-3 py-2 border border-purple-300 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-xs"
                  />
                  <button
                    onClick={() => copyToClipboard(webhookReceiverUrl)}
                    className="btn-secondary text-sm"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-xs text-purple-700 dark:text-purple-300 mt-2">
                  Use this URL as the webhook destination in Zapier
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  📖 Setup Instructions
                </h4>
                <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-2 list-decimal list-inside">
                  <li>In Zapier, create new Zap: Your CRM → Webhooks</li>
                  <li>Action: "POST" to the URL above</li>
                  <li>Map CRM fields to JSON body (e.g., {`{"name": "John", "email": "john@co.com"}`})</li>
                  <li>When CRM updates → Zapier sends data → FormBot creates profile</li>
                  <li>Open any form → Select the new profile → Auto-fill!</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Send Data to Zapier (Outbound) */}
          <div className="bg-white dark:bg-gray-800 rounded-card shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              ⚡ Zapier Webhook Integration
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="flex items-center mb-3">
                  <input
                    type="checkbox"
                    checked={settings.sendToZapierOnSubmit}
                    onChange={(e) => onChange({ sendToZapierOnSubmit: e.target.checked })}
                    className="w-4 h-4 text-primary-purple border-gray-300 rounded focus:ring-primary-purple"
                  />
                  <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Send form data to Zapier on submission
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Zapier Webhook URL
                </label>
                <input
                  type="url"
                  value={settings.zapierWebhookUrl}
                  onChange={(e) => onChange({ zapierWebhookUrl: e.target.value })}
                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-purple focus:border-transparent font-mono text-sm"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Get this URL from Zapier → Create Zap → Webhooks → Catch Hook
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleTestWebhook}
                  disabled={testing || !settings.zapierWebhookUrl}
                  className="btn-secondary"
                >
                  {testing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block mr-2"></div>
                      Testing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Test Connection
                    </>
                  )}
                </button>
              </div>

              {testResult && (
                <div className={`p-3 rounded-lg ${
                  testResult.success
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                }`}>
                  <p className={`text-sm ${
                    testResult.success
                      ? 'text-green-800 dark:text-green-200'
                      : 'text-red-800 dark:text-red-200'
                  }`}>
                    {testResult.message}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
              🔗 How Zapier Integration Works
            </h4>
            <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-2 list-decimal list-inside">
              <li>Create a Zap in Zapier with "Webhooks by Zapier" as trigger</li>
              <li>Choose "Catch Hook" and copy the webhook URL</li>
              <li>Paste the URL above and enable "Send to Zapier on submission"</li>
              <li>Fill out any form and submit</li>
              <li>FormBot sends all form data to Zapier automatically</li>
              <li>Use the data in 5000+ apps (Gmail, Sheets, Slack, etc.)</li>
            </ol>
            
            <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-700">
              <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-2">💡 Use Cases:</p>
              <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 ml-4 list-disc">
                <li>Save job applications to Google Sheets</li>
                <li>Send form submissions to Slack</li>
                <li>Add contacts to CRM automatically</li>
                <li>Log form data to Airtable/Notion</li>
                <li>Trigger email notifications</li>
              </ul>
            </div>
          </div>

          {/* Coming Soon */}
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
            <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-3">
              🔮 Coming Soon in Enterprise
            </h4>
            <ul className="text-sm text-purple-800 dark:text-purple-200 space-y-2">
              <li className="flex items-center gap-2">
                <span className="text-gray-400">⏳</span>
                <span>Auto-fill from Zapier (receive data to fill forms)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-gray-400">⏳</span>
                <span>Team profile sharing and sync</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-gray-400">⏳</span>
                <span>Analytics dashboard (forms filled, time saved)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-gray-400">⏳</span>
                <span>API access for custom integrations</span>
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default EnterpriseSettings;

