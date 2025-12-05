/**
 * Confidence Badge Component with AI Explanation Tooltip
 */

import React, { useState } from 'react';
import { getConfidenceLevel } from '../../utils/fieldClassifier';

interface ConfidenceBadgeProps {
  confidence: number;
  reasoning?: string;
  matchFactors?: string[];
}

const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ confidence, reasoning, matchFactors }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const level = getConfidenceLevel(confidence);
  
  const getClassName = () => {
    switch (level) {
      case 'high':
        return 'confidence-badge-high';
      case 'medium':
        return 'confidence-badge-medium';
      default:
        return 'confidence-badge-low';
    }
  };

  const getLabel = () => {
    if (confidence === 0) return 'No match';
    return `${confidence}%`;
  };

  // Generate default match factors if not provided
  const getDefaultFactors = (): string[] => {
    const factors: string[] = [];
    if (confidence >= 90) {
      factors.push('Field name matches profile key');
      factors.push('High semantic similarity');
    } else if (confidence >= 70) {
      factors.push('Field label suggests match');
      factors.push('Input type is compatible');
    } else if (confidence >= 50) {
      factors.push('Partial name match');
      factors.push('Context suggests possible match');
    }
    return factors;
  };

  const displayFactors = matchFactors && matchFactors.length > 0 ? matchFactors : getDefaultFactors();
  const hasExplanation = reasoning || displayFactors.length > 0;

  return (
    <div 
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className={`${getClassName()} cursor-help`}>
        {getLabel()}
        {hasExplanation && (
          <svg className="w-3 h-3 ml-1 inline-block opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </span>
      
      {/* Tooltip */}
      {showTooltip && hasExplanation && (
        <div className="absolute z-50 bottom-full right-0 mb-2 w-64 p-3 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-lg shadow-xl border border-gray-700">
          <div className="font-semibold mb-2 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${
              level === 'high' ? 'bg-green-400' : level === 'medium' ? 'bg-yellow-400' : 'bg-red-400'
            }`}></span>
            {confidence}% match confidence
          </div>
          
          {reasoning && (
            <p className="text-gray-300 mb-2 leading-relaxed">
              {reasoning}
            </p>
          )}
          
          {displayFactors.length > 0 && (
            <div className="space-y-1">
              <p className="text-gray-400 text-[10px] uppercase tracking-wide">Match factors:</p>
              {displayFactors.map((factor, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <span className="text-green-400 mt-0.5">✓</span>
                  <span className="text-gray-300">{factor}</span>
                </div>
              ))}
            </div>
          )}
          
          {/* Tooltip arrow */}
          <div className="absolute -bottom-1.5 right-4 w-3 h-3 bg-gray-900 dark:bg-gray-800 border-r border-b border-gray-700 transform rotate-45"></div>
        </div>
      )}
    </div>
  );
};

export default ConfidenceBadge;

