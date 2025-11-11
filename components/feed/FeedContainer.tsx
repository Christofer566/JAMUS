'use client';

import { ReactNode } from "react";

// components/feed/FeedContainer.tsx
interface FeedContainerProps {
  children: ReactNode;
}

export default function FeedContainer({ children }: FeedContainerProps) {
  return (
    <div className="w-full p-8">
      <div className="w-full max-w-5xl mx-auto">
        {children}
      </div>
    </div>
  );
}