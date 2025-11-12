/**
 * Validation Warnings Component
 */

import React from 'react';
import { ValidationIssue } from '../../utils/validator';

interface ValidationWarningsProps {
  issues: ValidationIssue[];
  securityWarnings: ValidationIssue[];
  onFix: (field: string, fixedValue: string) => void;
  onProceed: () => void;
  onCancel: () => void;
}

const ValidationWarnings: React.FC<ValidationWarningsProps> = ({
  issues,
  securityWarnings,
  onFix,
  onProceed,
  onCancel,
}) => {
  const hasErrors = issues.some(i => i.severity === 'error');
  const hasSecurityIssues = securityWarnings.length > 0;

  if (issues.length === 0 && securityWarnings.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Security Warnings */}
      {securityWarnings.map((warning, idx) => (
        <div key={`security-${idx}`} className="bg-red-50 dark:bg-red-900/20 border-2 border-red-500 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-bold text-red-900 dark:text-red-100">
                Security Alert: {warning.field}
              </p>
              <p className="text-sm text-red-800 dark:text-red-200 mt-1">
                {warning.message}
              </p>
              {warning.suggestion && (
                <p className="text-xs text-red-700 dark:text-red-300 mt-2">
                  💡 {warning.suggestion}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Validation Issues */}
      {issues.map((issue, idx) => (
        <div
          key={`issue-${idx}`}
          className={`rounded-lg p-3 border ${
            issue.severity === 'error'
              ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
              : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className={`text-sm font-medium ${
                issue.severity === 'error' 
                  ? 'text-red-900 dark:text-red-100'
                  : 'text-yellow-900 dark:text-yellow-100'
              }`}>
                {issue.severity === 'error' ? '❌' : '⚠️'} {issue.field}
              </p>
              <p className={`text-sm mt-1 ${
                issue.severity === 'error'
                  ? 'text-red-800 dark:text-red-200'
                  : 'text-yellow-800 dark:text-yellow-200'
              }`}>
                {issue.message}
              </p>
              {issue.suggestion && (
                <p className={`text-xs mt-2 ${
                  issue.severity === 'error'
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-yellow-700 dark:text-yellow-300'
                }`}>
                  💡 {issue.suggestion}
                </p>
              )}
            </div>
            {issue.autoFix && (
              <button
                onClick={() => onFix(issue.field, issue.autoFix!)}
                className="ml-2 px-3 py-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Fix
              </button>
            )}
          </div>
        </div>
      ))}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        {hasSecurityIssues && (
          <button onClick={onCancel} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
            🛑 Cancel Fill
          </button>
        )}
        {!hasErrors && (
          <button
            onClick={onProceed}
            className={`flex-1 ${
              hasSecurityIssues
                ? 'bg-yellow-600 hover:bg-yellow-700'
                : 'bg-primary-purple hover:bg-purple-700'
            } text-white font-semibold py-2 px-4 rounded-lg transition-colors`}
          >
            {hasSecurityIssues ? '⚠️ Proceed Anyway' : '✓ Fill Form'}
          </button>
        )}
        {hasErrors && !hasSecurityIssues && (
          <div className="flex-1 text-center">
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
              Fix errors before proceeding
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ValidationWarnings;

