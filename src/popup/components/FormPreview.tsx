/**
 * Form Preview Component - Shows detected fields
 */

import React, { useState } from 'react';
import { DetectedField } from '../../types';
import ConfidenceBadge from './ConfidenceBadge';
import { getConfidenceLevel } from '../../utils/fieldClassifier';

interface FormPreviewProps {
  fields: DetectedField[];
  minConfidence: number;
  selectedProfileId?: string;
}

const FormPreview: React.FC<FormPreviewProps> = ({ fields, minConfidence, selectedProfileId }) => {
  const [showAll, setShowAll] = useState(false);
  
  const filteredFields = fields.filter(f => f.fieldType !== 'password');
  const displayFields = showAll ? filteredFields : filteredFields.slice(0, 5);
  const hasMore = filteredFields.length > 5;

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
                  </p>
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

