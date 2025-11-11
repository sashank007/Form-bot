/**
 * Resume/Master Profile Component
 */

import React, { useState } from 'react';
import { Settings, ExtractedProfileData } from '../../types';
import { extractProfileFromResume } from '../../utils/resumeExtractor';

interface ResumeProfileProps {
  settings: Settings;
  onChange: (settings: Partial<Settings>) => void;
}

const ResumeProfile: React.FC<ResumeProfileProps> = ({ settings, onChange }) => {
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedProfileData | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleExtract = async () => {
    if (!settings.openAIEnabled || !settings.openAIKey) {
      alert('Please enable AI and add your OpenAI API key in Privacy & Settings first.');
      return;
    }

    if (!settings.masterProfile || settings.masterProfile.trim().length < 50) {
      alert('Please enter your resume or profile text first (at least 50 characters).');
      return;
    }

    setExtracting(true);
    
    try {
      const data = await extractProfileFromResume(settings.masterProfile);
      setExtractedData(data);
      setShowPreview(true);
    } catch (error) {
      alert('Failed to extract data. Please check your API key and try again.');
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Resume / Master Profile</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Paste your resume, LinkedIn profile, or any text about yourself. AI will extract structured data and intelligently fill forms.
        </p>
      </div>

      {/* Resume Text Input */}
      <div className="bg-white dark:bg-gray-800 rounded-card shadow p-6 space-y-4">
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block font-medium text-gray-900 dark:text-gray-100">
              Your Resume / Profile
            </label>
            <button
              onClick={handleExtract}
              disabled={extracting || !settings.openAIEnabled}
              className="btn-secondary text-sm"
            >
              {extracting ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block mr-2"></div>
                  Extracting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Preview Extraction
                </>
              )}
            </button>
          </div>
          <textarea
            value={settings.masterProfile}
            onChange={(e) => onChange({ masterProfile: e.target.value })}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-purple focus:border-transparent font-mono text-sm"
            rows={15}
            placeholder="Paste your resume, LinkedIn About section, or bio here...

Example:
John Doe
Senior Software Engineer
Email: john@example.com
Phone: (555) 123-4567
Location: San Francisco, CA

I'm a full-stack developer with 5 years of experience in React, TypeScript, and Node.js. Currently working at Tech Corp, where I lead a team of 5 engineers...

Skills: JavaScript, React, TypeScript, Node.js, Python, AWS
Education: BS Computer Science, Stanford University
..."
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {settings.masterProfile.length} characters • AI will extract: name, contact info, work history, skills, education, and more
          </p>
        </div>

        {!settings.openAIEnabled && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ AI is required for this feature. Please enable it in <strong>Privacy & Settings</strong> tab.
            </p>
          </div>
        )}
      </div>

      {/* LinkedIn URL (Optional) */}
      <div className="bg-white dark:bg-gray-800 rounded-card shadow p-6">
        <label className="block font-medium text-gray-900 dark:text-gray-100 mb-2">
          LinkedIn URL (Optional)
        </label>
        <input
          type="url"
          value={settings.linkedInUrl}
          onChange={(e) => onChange({ linkedInUrl: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-purple focus:border-transparent"
          placeholder="https://linkedin.com/in/yourprofile"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Store your LinkedIn URL for reference (extraction coming soon)
        </p>
      </div>

      {/* Extracted Data Preview */}
      {showPreview && extractedData && (
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-800 rounded-card p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              ✓ Extracted Data Preview
            </h3>
            <button
              onClick={() => setShowPreview(false)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            {Object.entries(extractedData).map(([key, value]) => (
              value && (
                <div key={key} className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3">
                  <p className="font-medium text-gray-700 dark:text-gray-300 capitalize mb-1">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </p>
                  <p className="text-gray-900 dark:text-gray-100 text-xs break-words">
                    {value.length > 100 ? value.substring(0, 100) + '...' : value}
                  </p>
                </div>
              )
            ))}
          </div>
          
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-4">
            This data will be used to intelligently fill forms. Right-click on any page and select "Form Bot: Fill from Resume/Profile"
          </p>
        </div>
      )}

      {/* How to Use */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-card p-6">
        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          How to Use
        </h4>
        <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-2 list-decimal list-inside">
          <li>Paste your resume or LinkedIn "About" section above</li>
          <li>Click "Preview Extraction" to see what AI extracts</li>
          <li>Save your settings</li>
          <li>On any form page, <strong>right-click</strong> → select <strong>"Form Bot: Fill from Resume/Profile"</strong></li>
          <li>AI analyzes the form and fills it intelligently!</li>
        </ol>
        
        <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-700">
          <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-2">💡 Pro Tips:</p>
          <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 ml-4 list-disc">
            <li>Include contact info, work history, education, and skills</li>
            <li>AI understands context - it will match "Why do you want this job?" to your experience</li>
            <li>Works great for job applications, surveys, and complex forms</li>
            <li>You can edit the text anytime and re-extract</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ResumeProfile;

