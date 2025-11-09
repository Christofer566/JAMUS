'use client';

import { ReactNode } from "react";

// components/feed/FeedContainer.tsx
interface FeedContainerProps {
  children: ReactNode;
}

export default function FeedContainer({ children }: FeedContainerProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-[900px] h-full rounded-2xl border border-gray-700/50 bg-[#252736] overflow-y-auto p-6">
        {children}
      </div>
    </div>
  );
}