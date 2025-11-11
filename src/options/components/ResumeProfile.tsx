/**
 * Resume/Master Profile Component
 */

import React, { useState } from 'react';
import { Settings, SavedFormData } from '../../types';
import { extractProfileFromResume } from '../../utils/resumeExtractor';
import { saveFormData } from '../../utils/storage';

interface ResumeProfileProps {
  settings: Settings;
  onChange: (settings: Partial<Settings>) => void;
}

const ResumeProfile: React.FC<ResumeProfileProps> = ({ settings, onChange }) => {
  const [extracting, setExtracting] = useState(false);
  const [lastExtractedCount, setLastExtractedCount] = useState(0);

  const handleExtract = async () => {
    if (!settings.openAIEnabled || !settings.openAIKey) {
      alert('Please enable AI and add your OpenAI API key in Privacy & Settings first.');
      return;
    }

    if (!settings.openAIKey.startsWith('sk-')) {
      alert('Invalid API key format. OpenAI keys start with "sk-"\n\nPlease check your API key in Privacy & Settings tab.');
      return;
    }

    if (!settings.masterProfile || settings.masterProfile.trim().length < 50) {
      alert('Please enter your resume or profile text first (at least 50 characters).');
      return;
    }

    setExtracting(true);
    
    try {
      const extractedData = await extractProfileFromResume(settings.masterProfile);
      
      if (!extractedData) {
        alert('Failed to extract data from resume. Please check your resume text and API key.');
        return;
      }
      
      // Flatten any nested objects to strings
      const flattenedData: { [key: string]: string } = {};
      
      for (const [key, value] of Object.entries(extractedData)) {
        if (value) {
          // Convert objects/arrays to strings
          if (typeof value === 'object') {
            flattenedData[key] = JSON.stringify(value, null, 2);
          } else {
            flattenedData[key] = String(value);
          }
        }
      }
      
      // Count non-empty fields
      const fieldCount = Object.keys(flattenedData).length;
      
      // Save as a new profile automatically
      const newProfile: SavedFormData = {
        id: `resume_${Date.now()}`,
        name: 'Resume Profile',
        data: flattenedData,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      await saveFormData(newProfile);
      
      setLastExtractedCount(fieldCount);
      
      alert(`✅ Success!\n\nExtracted ${fieldCount} fields from your resume and saved as "Resume Profile".\n\nGo to "Data Management" tab to view and edit all extracted fields.\n\nNow you can:\n• Use quick fill on forms\n• Right-click → "Fill from Resume/Profile" for AI-powered filling`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('Invalid API key')) {
        alert('❌ Invalid API Key\n\nYour OpenAI API key appears to be incorrect.\n\nPlease:\n1. Go to https://platform.openai.com/api-keys\n2. Create a new API key\n3. Copy it to Privacy & Settings tab\n4. Make sure it starts with "sk-"');
      } else if (errorMessage.includes('credits')) {
        alert('❌ Insufficient Credits\n\nYour OpenAI account needs credits.\n\nPlease:\n1. Go to https://platform.openai.com/account/billing\n2. Add credits ($5-10 recommended)\n3. Try again');
      } else {
        alert(`Failed to extract data:\n\n${errorMessage}\n\nPlease check:\n• Your API key is valid\n• You have OpenAI credits\n• Your internet connection`);
      }
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
              className="btn-primary text-sm"
            >
              {extracting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2"></div>
                  Extracting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Extract & Save as Profile
                </>
              )}
            </button>
          </div>
          
          {lastExtractedCount > 0 && (
            <div className="mb-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <p className="text-sm text-green-800 dark:text-green-200">
                ✓ Last extraction: {lastExtractedCount} fields saved as "Resume Profile"
              </p>
            </div>
          )}
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

Personal Projects:
- Built an e-commerce platform serving 10k users
- Open source contributor to React ecosystem

Certifications: AWS Solutions Architect, Google Cloud Professional
Languages: English (native), Spanish (fluent)
..."
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {settings.masterProfile.length} characters • AI will extract ALL fields: name, contact, work history, skills, education, <strong>personal projects</strong>, certifications, languages, awards, and any other section you include
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
          <li>Click <strong>"Extract & Save as Profile"</strong> - AI will extract all fields including personal projects</li>
          <li>Check <strong>"Data Management"</strong> tab to see the extracted fields</li>
          <li>On any form page, <strong>right-click</strong> → select <strong>"Form Bot: Fill from Resume/Profile"</strong></li>
          <li>AI analyzes the form and fills it intelligently!</li>
        </ol>
        
        <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-700">
          <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-2">💡 Pro Tips:</p>
          <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 ml-4 list-disc">
            <li>Include ALL sections: contact, work, education, skills, <strong>personal projects</strong>, certifications, languages, etc.</li>
            <li>AI extracts EVERYTHING - any section heading becomes a fillable field</li>
            <li>Handles open-ended questions ("Why this job?" uses your experience)</li>
            <li>Works for job applications, Google Forms, surveys, and complex multi-step forms</li>
            <li>You can edit and re-extract anytime to update your profile</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ResumeProfile;

