/**
 * Confidence Badge Component
 */

import React from 'react';
import { getConfidenceLevel } from '../../utils/fieldClassifier';

interface ConfidenceBadgeProps {
  confidence: number;
}

const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ confidence }) => {
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

  return (
    <span className={getClassName()}>
      {getLabel()}
    </span>
  );
};

export default ConfidenceBadge;

