/**
 * Quick Fill Button Component
 */

import React, { useState } from 'react';

interface QuickFillProps {
  onFill: () => void;
  onUndo: () => void;
  fillableCount: number;
  totalCount: number;
}

const QuickFill: React.FC<QuickFillProps> = ({ onFill, onUndo, fillableCount, totalCount }) => {
  const [justFilled, setJustFilled] = useState(false);

  const handleFill = async () => {
    await onFill();
    setJustFilled(true);
    setTimeout(() => setJustFilled(false), 3000);
  };

  return (
    <div className="space-y-3">
      <button
        onClick={handleFill}
        disabled={fillableCount === 0}
        className="w-full btn-primary py-3 text-lg font-bold shadow-lg"
      >
        {fillableCount === 0 ? (
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

      {justFilled && (
        <button
          onClick={onUndo}
          className="w-full btn-secondary py-2 text-sm animate-slide-in"
        >
          <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          Undo Fill
        </button>
      )}
    </div>
  );
};

export default QuickFill;

