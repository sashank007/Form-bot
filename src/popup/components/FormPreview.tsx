/**
 * Form Preview Component - Shows detected fields
 */

import React from 'react';
import { DetectedField } from '../../types';
import ConfidenceBadge from './ConfidenceBadge';
import { getConfidenceLevel } from '../../utils/fieldClassifier';

interface FormPreviewProps {
  fields: DetectedField[];
  minConfidence: number;
}

const FormPreview: React.FC<FormPreviewProps> = ({ fields, minConfidence }) => {
  const displayFields = fields
    .filter(f => f.fieldType !== 'password')
    .slice(0, 5); // Show max 5 fields

  const handleHighlight = async (xpath: string) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.id) return;

    await chrome.tabs.sendMessage(tab.id, {
      type: 'HIGHLIGHT_FIELD',
      payload: xpath,
    });
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
              onClick={() => handleHighlight(field.field.xpath)}
              className="glass-card p-3 cursor-pointer hover:bg-white/20 transition-all duration-smooth"
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
                <div className="ml-2 flex items-center space-x-2">
                  <ConfidenceBadge confidence={field.confidence} />
                  {willFill && (
                    <svg className="w-4 h-4 text-success" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {fields.length > displayFields.length && (
        <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">
          +{fields.length - displayFields.length} more field{fields.length - displayFields.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
};

export default FormPreview;

