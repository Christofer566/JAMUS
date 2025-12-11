// components/single/feedback/FeedbackActions.tsx
'use client';

import React from 'react';
// Share Icon SVG
const ShareIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-5 w-5 mr-2"
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path d="M15 8a3 3 0 10-2.977-2.977l-1.94 1.94A4 4 0 018 12H7a2 2 0 100 4h1a3 3 0 10-.006-5.996l1.94-1.94A4 4 0 0112 8h1a2 2 0 100-4h-1.006A3 3 0 0015 8zM7 16a1 1 0 110-2 1 1 0 010 2zm1-8a1 1 0 11-2 0 1 1 0 012 0z" />
  </svg>
);

// Refresh Icon SVG
const RefreshIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-5 w-5 mr-2"
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path
      fillRule="evenodd"
      d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0116.342 8.891 1 1 0 01-1.284-1.284A5.002 5.002 0 0015 4.137V7a1 1 0 01-1 1h-1a1 1 0 01-1-1V3a1 1 0 011-1h6zM6 18a1 1 0 01-1-1v-2.101A7.002 7.002 0 01.658 9.109a1 1 0 111.284-1.284A5.002 5.002 0 005 15.863V13a1 1 0 011-1h1a1 1 0 011 1v4a1 1 0 01-1 1H4z"
      clipRule="evenodd"
    />
  </svg>
);

interface FeedbackActionsProps {
  onShare: () => void;
  onReJam: () => void;
}

const FeedbackActions = ({ onShare, onReJam }: FeedbackActionsProps) => {
  return (
    <div className="flex justify-center items-center gap-4 w-full max-w-md mx-auto p-4">
      <button
        data-testid="btn-share"
        onClick={onShare}
        className="w-1/2 py-3 text-lg font-bold text-white bg-[#FF7B7B] rounded-lg hover:opacity-90 transition-opacity duration-200 flex items-center justify-center"
      >
        <ShareIcon />
        공유하기 (Feed)
      </button>
      <button
        data-testid="btn-rejam"
        onClick={onReJam}
        className="w-1/2 py-3 text-lg font-bold text-gray-400 border border-gray-600 rounded-lg hover:bg-gray-700 hover:text-white transition-colors duration-200 flex items-center justify-center"
      >
        <RefreshIcon />
        Re-JAM
      </button>
    </div>
  );
};

export default FeedbackActions;
