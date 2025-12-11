import React, { Suspense } from 'react';
import FeedbackClientPage from './FeedbackClientPage';

export default function FeedbackPage() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center bg-[#0D1B2A] text-white">Loading Feedback...</div>}>
      <FeedbackClientPage />
    </Suspense>
  );
}