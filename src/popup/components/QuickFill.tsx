/**
 * Quick Fill Button Component
 */

import React, { useState } from 'react';

interface QuickFillProps {
  onFill: () => void;
  onUndo: () => void;
  fillableCount: number;
  totalCount: number;
  isMatching?: boolean;
}

const QuickFill: React.FC<QuickFillProps> = ({ onFill, onUndo, fillableCount, totalCount, isMatching }) => {
  const [filledCount, setFilledCount] = useState<number | null>(null);
  const [isFilled, setIsFilled] = useState(false);

  const handleFill = async () => {
    const countToFill = fillableCount;
    await onFill();
    setFilledCount(countToFill);
    setIsFilled(true);
  };

  const handleUndo = async () => {
    await onUndo();
    setIsFilled(false);
    setFilledCount(null);
  };

  const handleFillAgain = () => {
    setIsFilled(false);
    setFilledCount(null);
  };

  // Show filled state
  if (isFilled && filledCount !== null) {
    return (
      <div className="space-y-3">
        {/* Success State */}
        <div className="w-full bg-gradient-to-r from-emerald-500 to-green-500 text-white py-4 px-4 rounded-xl shadow-lg">
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-lg font-bold">{filledCount} Field{filledCount !== 1 ? 's' : ''} Filled!</p>
              <p className="text-sm text-white/80">Form is ready to submit</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleUndo}
            className="flex-1 btn-secondary py-2.5 text-sm font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            Undo
          </button>
          <button
            onClick={handleFillAgain}
            className="flex-1 btn-secondary py-2.5 text-sm font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Fill Again
          </button>
        </div>
      </div>
    );
  }

  // Default fill button state
  return (
    <div className="space-y-3">
      <button
        onClick={handleFill}
        disabled={fillableCount === 0 || isMatching}
        className="w-full btn-primary py-3 text-lg font-bold shadow-lg disabled:opacity-60"
      >
        {isMatching ? (
          <div className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>Matching Fields...</span>
          </div>
        ) : fillableCount === 0 ? (
          'No Fields to Fill'
        ) : (
          <>
            <svg className="w-6 h-6 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Fill {fillableCount} Field{fillableCount !== 1 ? 's' : ''}
          </>
        )}
      </button>
    </div>
  );
};

export default QuickFill;

