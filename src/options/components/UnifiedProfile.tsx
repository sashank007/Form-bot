import React, { useEffect, useState } from 'react';
import { FormData } from '../../types';
import { getAuth, UserAuth } from '../../utils/googleAuth';

interface ProfileSection {
  id: string;
  title: string;
  icon: string;
  description: string;
  fields: FieldDefinition[];
  collapsed?: boolean;
}

interface FieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'date' | 'url' | 'textarea';
  placeholder?: string;
}

const PROFILE_SECTIONS: ProfileSection[] = [
  {
    id: 'personal',
    title: 'Personal Information',
    icon: '👤',
    description: 'Basic personal details for forms',
    fields: [
      { key: 'firstName', label: 'First Name', type: 'text', placeholder: 'John' },
      { key: 'lastName', label: 'Last Name', type: 'text', placeholder: 'Doe' },
      { key: 'fullName', label: 'Full Name', type: 'text', placeholder: 'John Doe' },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'john@example.com' },
      { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+1 (555) 123-4567' },
      { key: 'dateOfBirth', label: 'Date of Birth', type: 'date' },
      { key: 'gender', label: 'Gender', type: 'text', placeholder: 'Male/Female/Other' },
    ],
  },
  {
    id: 'address',
    title: 'Address',
    icon: '🏠',
    description: 'Home address details',
    fields: [
      { key: 'address', label: 'Street Address', type: 'text', placeholder: '123 Main Street' },
      { key: 'address2', label: 'Address Line 2', type: 'text', placeholder: 'Apt 4B' },
      { key: 'city', label: 'City', type: 'text', placeholder: 'New York' },
      { key: 'state', label: 'State/Province', type: 'text', placeholder: 'NY' },
      { key: 'zipCode', label: 'ZIP/Postal Code', type: 'text', placeholder: '10001' },
      { key: 'country', label: 'Country', type: 'text', placeholder: 'United States' },
    ],
  },
  {
    id: 'professional',
    title: 'Professional',
    icon: '💼',
    description: 'Work and career information',
    fields: [
      { key: 'company', label: 'Company', type: 'text', placeholder: 'Acme Inc.' },
      { key: 'jobTitle', label: 'Job Title', type: 'text', placeholder: 'Software Engineer' },
      { key: 'department', label: 'Department', type: 'text', placeholder: 'Engineering' },
      { key: 'workEmail', label: 'Work Email', type: 'email', placeholder: 'john@company.com' },
      { key: 'workPhone', label: 'Work Phone', type: 'tel', placeholder: '+1 (555) 987-6543' },
      { key: 'employeeId', label: 'Employee ID', type: 'text', placeholder: 'EMP-12345' },
    ],
  },
  {
    id: 'education',
    title: 'Education',
    icon: '🎓',
    description: 'Educational background',
    fields: [
      { key: 'university', label: 'University/School', type: 'text', placeholder: 'MIT' },
      { key: 'degree', label: 'Degree', type: 'text', placeholder: 'Bachelor of Science' },
      { key: 'fieldOfStudy', label: 'Field of Study', type: 'text', placeholder: 'Computer Science' },
      { key: 'graduationDate', label: 'Graduation Date', type: 'date' },
      { key: 'gpa', label: 'GPA', type: 'text', placeholder: '3.8' },
    ],
  },
  {
    id: 'social',
    title: 'Social & Links',
    icon: '🔗',
    description: 'Social media and portfolio links',
    fields: [
      { key: 'linkedIn', label: 'LinkedIn', type: 'url', placeholder: 'https://linkedin.com/in/johndoe' },
      { key: 'github', label: 'GitHub', type: 'url', placeholder: 'https://github.com/johndoe' },
      { key: 'twitter', label: 'Twitter/X', type: 'url', placeholder: 'https://twitter.com/johndoe' },
      { key: 'website', label: 'Personal Website', type: 'url', placeholder: 'https://johndoe.com' },
      { key: 'portfolio', label: 'Portfolio', type: 'url', placeholder: 'https://portfolio.johndoe.com' },
    ],
  },
  {
    id: 'identification',
    title: 'Identification',
    icon: '🪪',
    description: 'IDs and legal documents',
    fields: [
      { key: 'ssn', label: 'SSN (Last 4)', type: 'text', placeholder: '••••' },
      { key: 'passportNumber', label: 'Passport Number', type: 'text', placeholder: 'AB1234567' },
      { key: 'licenseNumber', label: "Driver's License", type: 'text', placeholder: 'D1234567' },
      { key: 'nationalId', label: 'National ID', type: 'text', placeholder: 'ID-12345678' },
    ],
  },
  {
    id: 'emergency',
    title: 'Emergency Contact',
    icon: '🚨',
    description: 'Emergency contact information',
    fields: [
      { key: 'emergencyName', label: 'Contact Name', type: 'text', placeholder: 'Jane Doe' },
      { key: 'emergencyRelation', label: 'Relationship', type: 'text', placeholder: 'Spouse' },
      { key: 'emergencyPhone', label: 'Phone Number', type: 'tel', placeholder: '+1 (555) 111-2222' },
      { key: 'emergencyEmail', label: 'Email', type: 'email', placeholder: 'jane@example.com' },
    ],
  },
];

interface UnifiedProfileProps {
  profileData: FormData;
  onSave: (data: FormData) => Promise<void>;
  userAuth: UserAuth | null;
}

const UnifiedProfile: React.FC<UnifiedProfileProps> = ({ profileData, onSave, userAuth }) => {
  const [data, setData] = useState<FormData>(profileData);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [customFields, setCustomFields] = useState<Array<{ key: string; value: string }>>([]);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');

  useEffect(() => {
    setData(profileData);
    const knownKeys = new Set(PROFILE_SECTIONS.flatMap(s => s.fields.map(f => f.key)));
    const custom = Object.entries(profileData)
      .filter(([key]) => !knownKeys.has(key))
      .map(([key, value]) => ({ key, value: String(value || '') }));
    setCustomFields(custom);
  }, [profileData]);

  const handleFieldChange = (key: string, value: string) => {
    setData(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const allData = { ...data };
      customFields.forEach(({ key, value }) => {
        if (key.trim()) allData[key] = value;
      });
      await onSave(allData);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const addCustomField = () => {
    if (!newFieldKey.trim()) return;
    setCustomFields(prev => [...prev, { key: newFieldKey.trim(), value: newFieldValue }]);
    setData(prev => ({ ...prev, [newFieldKey.trim()]: newFieldValue }));
    setNewFieldKey('');
    setNewFieldValue('');
    setSaved(false);
  };

  const removeCustomField = (key: string) => {
    setCustomFields(prev => prev.filter(f => f.key !== key));
    setData(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setSaved(false);
  };

  const getFilledCount = (section: ProfileSection) => {
    return section.fields.filter(f => data[f.key] && String(data[f.key]).trim()).length;
  };

  const getTotalFilledFields = () => {
    return Object.values(data).filter(v => v && String(v).trim()).length;
  };

  // Calculate profile strength/completeness
  const getProfileStrength = () => {
    // Core fields that are most commonly needed
    const coreFields = [
      'firstName', 'lastName', 'email', 'phone', 'address', 'city', 'state', 'zipCode', 'country',
      'company', 'jobTitle', 'dateOfBirth'
    ];
    
    const filledCore = coreFields.filter(key => data[key] && String(data[key]).trim()).length;
    const percentage = Math.round((filledCore / coreFields.length) * 100);
    
    // Find missing important fields to suggest
    const importantMissing = coreFields
      .filter(key => !data[key] || !String(data[key]).trim())
      .slice(0, 3)
      .map(key => {
        const field = PROFILE_SECTIONS.flatMap(s => s.fields).find(f => f.key === key);
        return field?.label || key;
      });
    
    let level: 'low' | 'medium' | 'high' = 'low';
    let message = 'Just getting started';
    let color = 'from-red-500 to-orange-500';
    
    if (percentage >= 80) {
      level = 'high';
      message = 'Profile is complete!';
      color = 'from-green-500 to-emerald-500';
    } else if (percentage >= 50) {
      level = 'medium';
      message = 'Good progress';
      color = 'from-yellow-500 to-amber-500';
    }
    
    return { percentage, level, message, color, missingFields: importantMissing };
  };

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex items-center gap-4">
          {userAuth?.picture ? (
            <img src={userAuth.picture} alt="" className="w-16 h-16 rounded-full ring-4 ring-white/30" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold ring-4 ring-white/30">
              {userAuth?.name?.[0] || '?'}
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-2xl font-bold">{userAuth?.name || 'Your Profile'}</h2>
            <p className="text-white/80">{userAuth?.email || 'Sign in to sync your data'}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{getTotalFilledFields()}</div>
            <div className="text-white/80 text-sm">Fields Filled</div>
          </div>
        </div>
        
        {/* Profile Strength Indicator */}
        {(() => {
          const strength = getProfileStrength();
          return (
            <div className="mt-4 bg-white/10 backdrop-blur rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {strength.level === 'high' ? '💪' : strength.level === 'medium' ? '📈' : '🌱'}
                  </span>
                  <span className="font-medium">Profile Strength</span>
                </div>
                <span className="text-lg font-bold">{strength.percentage}%</span>
              </div>
              
              {/* Progress bar */}
              <div className="h-2 bg-white/20 rounded-full overflow-hidden mb-3">
                <div 
                  className={`h-full bg-gradient-to-r ${strength.color} transition-all duration-500`}
                  style={{ width: `${strength.percentage}%` }}
                />
              </div>
              
              {/* Missing fields suggestion */}
              {strength.missingFields.length > 0 && strength.percentage < 100 && (
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-white/60">Add:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {strength.missingFields.map((field, i) => (
                      <span 
                        key={i}
                        className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-medium"
                      >
                        {field}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {strength.percentage >= 100 && (
                <p className="text-sm text-white/80 flex items-center gap-1.5">
                  <span>✨</span>
                  <span>Your profile is complete! You're all set for fast form filling.</span>
                </p>
              )}
            </div>
          );
        })()}
        
        {/* Save Button in Header */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-white text-purple-600 font-semibold rounded-lg hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Saved!
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Save Profile
              </>
            )}
          </button>
          {saved && (
            <span className="text-white/80 text-sm">✓ Synced to cloud</span>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {PROFILE_SECTIONS.map(section => {
          const isCollapsed = collapsedSections.has(section.id);
          const filledCount = getFilledCount(section);
          const totalFields = section.fields.length;
          const progress = (filledCount / totalFields) * 100;

          return (
            <div key={section.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <span className="text-2xl">{section.icon}</span>
                <div className="flex-1 text-left">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{section.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{section.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {filledCount}/{totalFields}
                    </span>
                    <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden mt-1">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <svg 
                    className={`w-5 h-5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Section Fields */}
              {!isCollapsed && (
                <div className="px-5 pb-5 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {section.fields.map(field => (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {field.label}
                        </label>
                        {field.type === 'textarea' ? (
                          <textarea
                            value={String(data[field.key] || '')}
                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-shadow"
                          />
                        ) : (
                          <input
                            type={field.type}
                            value={String(data[field.key] || '')}
                            onChange={(e) => handleFieldChange(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-shadow"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Custom Fields Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-4 border-b border-gray-100 dark:border-gray-700">
            <span className="text-2xl">✨</span>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Custom Fields</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Add any additional fields you need</p>
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {customFields.length} fields
            </span>
          </div>

          <div className="px-5 pb-5 pt-4">
            {/* Existing Custom Fields */}
            {customFields.length > 0 && (
              <div className="space-y-3 mb-4">
                {customFields.map(({ key, value }) => (
                  <div key={key} className="flex gap-2 items-start">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={key}
                        disabled
                        className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400"
                      />
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => {
                          setCustomFields(prev => prev.map(f => f.key === key ? { ...f, value: e.target.value } : f));
                          setData(prev => ({ ...prev, [key]: e.target.value }));
                          setSaved(false);
                        }}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <button
                      onClick={() => removeCustomField(key)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add New Custom Field */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newFieldKey}
                onChange={(e) => setNewFieldKey(e.target.value)}
                placeholder="Field name"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500"
              />
              <input
                type="text"
                value={newFieldValue}
                onChange={(e) => setNewFieldValue(e.target.value)}
                placeholder="Value"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500"
                onKeyPress={(e) => e.key === 'Enter' && addCustomField()}
              />
              <button
                onClick={addCustomField}
                disabled={!newFieldKey.trim()}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnifiedProfile;

