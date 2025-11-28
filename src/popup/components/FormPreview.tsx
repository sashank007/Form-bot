/**
 * Form Preview Component - Shows detected fields
 */

import React, { useState, useEffect } from 'react';
import { DetectedField } from '../../types';
import ConfidenceBadge from './ConfidenceBadge';
import { getConfidenceLevel } from '../../utils/fieldClassifier';
import { getPrimaryFormData, getFormDataById, saveFormData, getAllFormData } from '../../utils/storage';

interface FormPreviewProps {
  fields: DetectedField[];
  minConfidence: number;
  selectedProfileId?: string;
}

const FormPreview: React.FC<FormPreviewProps> = ({ fields, minConfidence, selectedProfileId }) => {
  const [showAll, setShowAll] = useState(false);
  const [fieldValues, setFieldValues] = useState<{ [key: string]: string }>({});
  const [formFieldValues, setFormFieldValues] = useState<{ [key: string]: string }>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [addingField, setAddingField] = useState<string | null>(null);
  
  const filteredFields = fields.filter(f => f.fieldType !== 'password');
  const displayFields = showAll ? filteredFields : filteredFields.slice(0, 5);
  const hasMore = filteredFields.length > 5;

  // Load field values from profile data
  useEffect(() => {
    const loadFieldValues = async () => {
      try {
        let profileData;
        if (selectedProfileId) {
          const profile = await getFormDataById(selectedProfileId);
          profileData = profile?.data || {};
        } else {
          profileData = await getPrimaryFormData();
        }

        // Flatten nested data structures
        const flattenedData: any = {};
        if (profileData.rows && Array.isArray(profileData.rows)) {
          for (const row of profileData.rows) {
            if (typeof row === 'object' && row !== null) {
              Object.assign(flattenedData, row);
            }
          }
        }
        Object.assign(flattenedData, profileData);

        const values: { [key: string]: string } = {};
        fields.forEach(field => {
          if (field.matchedKey && flattenedData[field.matchedKey]) {
            let value = flattenedData[field.matchedKey];
            if (typeof value !== 'string') {
              value = String(value);
            }
            values[field.field.xpath] = value;
          }
        });
        setFieldValues(values);
      } catch (error) {
        console.error('Failed to load field values:', error);
      }
    };

    loadFieldValues();
  }, [fields, selectedProfileId]);

  // Get current form field values from the page
  useEffect(() => {
    const loadFormFieldValues = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.id) return;

        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'GET_FIELD_VALUES',
          payload: { xpaths: fields.map(f => f.field.xpath) }
        });

        if (response && response.values) {
          setFormFieldValues(response.values);
        }
      } catch (error) {
        console.error('Failed to load form field values:', error);
      }
    };

    loadFormFieldValues();
  }, [fields]);

  const handleAddToProfile = async (field: DetectedField, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!selectedProfileId) {
      alert('Please select a profile first to add this field.');
      return;
    }

    const fieldValue = formFieldValues[field.field.xpath] || '';
    const fieldLabel = field.field.label || field.field.placeholder || field.field.name || field.field.id || 'Unnamed field';
    
    if (!fieldValue.trim()) {
      alert('This field is empty. Please fill it in the form first, then try again.');
      return;
    }

    setAddingField(field.field.xpath);

    try {
      // Get current profile
      const profile = await getFormDataById(selectedProfileId);
      if (!profile) {
        alert('Profile not found.');
        return;
      }

      // Generate a key from the field label
      const generateKey = (label: string): string => {
        return label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .substring(0, 50);
      };

      let key = generateKey(fieldLabel);
      
      // Ensure key is unique
      let uniqueKey = key;
      let counter = 1;
      while (profile.data[uniqueKey]) {
        uniqueKey = `${key}_${counter}`;
        counter++;
      }

      // Update profile with new field
      const updatedProfile = {
        ...profile,
        data: {
          ...profile.data,
          [uniqueKey]: fieldValue.trim()
        },
        updatedAt: Date.now()
      };

      await saveFormData(updatedProfile);

      alert(`✅ Added "${fieldLabel}" to profile!\n\nKey: ${uniqueKey}\nValue: ${fieldValue.substring(0, 50)}${fieldValue.length > 50 ? '...' : ''}`);

      // Reload field values to show the new mapping
      const loadFieldValues = async () => {
        try {
          const profile = await getFormDataById(selectedProfileId);
          const profileData = profile?.data || {};
          const flattenedData: any = {};
          if (profileData.rows && Array.isArray(profileData.rows)) {
            for (const row of profileData.rows) {
              if (typeof row === 'object' && row !== null) {
                Object.assign(flattenedData, row);
              }
            }
          }
          Object.assign(flattenedData, profileData);

          const values: { [key: string]: string } = {};
          fields.forEach(f => {
            if (f.matchedKey && flattenedData[f.matchedKey]) {
              let value = flattenedData[f.matchedKey];
              if (typeof value !== 'string') {
                value = String(value);
              }
              values[f.field.xpath] = value;
            }
          });
          setFieldValues(values);
        } catch (error) {
          console.error('Failed to reload field values:', error);
        }
      };

      await loadFieldValues();

      // Trigger re-matching by sending message to content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'REMATCH_FIELDS',
          payload: { profileId: selectedProfileId }
        });
      }

    } catch (error) {
      console.error('Failed to add field to profile:', error);
      alert('Failed to add field to profile. Please try again.');
    } finally {
      setAddingField(null);
    }
  };

  const handleCopy = async (value: string, fieldXpath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldXpath);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = value;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopiedField(fieldXpath);
        setTimeout(() => setCopiedField(null), 2000);
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
      document.body.removeChild(textArea);
    }
  };

  const handleHighlight = async (xpath: string) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.id) return;

    await chrome.tabs.sendMessage(tab.id, {
      type: 'HIGHLIGHT_FIELD',
      payload: xpath,
    });
  };

  const handleFillField = async (field: DetectedField) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.id) {
      console.error('No active tab');
      return;
    }

    console.log('FormPreview: Filling field:', {
      label: field.field.label,
      matchedKey: field.matchedKey,
      profileId: selectedProfileId,
    });

    try {
      // Send message to fill just this field
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'FILL_SINGLE_FIELD',
        payload: {
          xpath: field.field.xpath,
          matchedKey: field.matchedKey,
          fieldType: field.fieldType,
          profileId: selectedProfileId,
        },
      });
      
      console.log('FormPreview: Fill response:', response);
    } catch (error) {
      console.error('FormPreview: Failed to fill field:', error);
      alert('Failed to fill field. Please try again or use "Fill All Fields"');
    }
  };

  return (
    <div className="mt-4 space-y-2">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Detected Fields</h3>
      
      <div className="space-y-2">
        {displayFields.map((field, index) => {
          const label = field.field.label || field.field.placeholder || field.field.name || field.field.id || 'Unnamed field';
          const confidenceLevel = getConfidenceLevel(field.confidence);
          const willFill = field.confidence >= minConfidence && field.matchedKey;
          const hasValue = formFieldValues[field.field.xpath] && formFieldValues[field.field.xpath].trim();
          const canAddToProfile = !field.matchedKey && hasValue && selectedProfileId;
          
          return (
            <div
              key={index}
              onClick={() => {
                if (willFill) {
                  handleFillField(field);
                } else {
                  handleHighlight(field.field.xpath);
                }
              }}
              className={`glass-card p-3 transition-all duration-smooth ${
                willFill 
                  ? 'cursor-pointer hover:bg-success/10 hover:border-success/30 border border-transparent' 
                  : 'cursor-pointer hover:bg-white/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {field.fieldType !== 'unknown' ? field.fieldType : 'Unknown type'}
                    {field.matchedKey && ` → ${field.matchedKey}`}
                    {!field.matchedKey && <span className="text-warning ml-1">(No mapping)</span>}
                  </p>
                  {fieldValues[field.field.xpath] && (
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-xs text-gray-700 dark:text-gray-300 font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded flex-1 truncate">
                        {fieldValues[field.field.xpath]}
                      </p>
                      <button
                        onClick={(e) => handleCopy(fieldValues[field.field.xpath], field.field.xpath, e)}
                        className="flex-shrink-0 p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        title="Copy value"
                      >
                        {copiedField === field.field.xpath ? (
                          <svg className="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )}
                  {hasValue && !field.matchedKey && (
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-xs text-gray-600 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded flex-1 truncate">
                        {formFieldValues[field.field.xpath]}
                      </p>
                      {canAddToProfile && (
                        <button
                          onClick={(e) => handleAddToProfile(field, e)}
                          disabled={addingField === field.field.xpath}
                          className="flex-shrink-0 px-2 py-1 text-xs font-medium text-white bg-primary-purple hover:bg-primary-purple/90 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Add to profile"
                        >
                          {addingField === field.field.xpath ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            '+ Add'
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="ml-2">
                  <ConfidenceBadge confidence={field.confidence} />
                </div>
              </div>
              {willFill && (
                <p className="text-xs text-success mt-2 font-medium">
                  Click to fill this field
                </p>
              )}
              {!field.matchedKey && !hasValue && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Fill this field in the form, then click "Add" to save it to your profile
                </p>
              )}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full text-xs text-center text-primary-purple dark:text-primary-blue font-medium py-2 hover:bg-white/20 dark:hover:bg-gray-700/20 rounded-lg transition-all"
        >
          {showAll ? (
            <>
              ▲ Show less
            </>
          ) : (
            <>
              ▼ Show {filteredFields.length - displayFields.length} more field{filteredFields.length - displayFields.length !== 1 ? 's' : ''}
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default FormPreview;

