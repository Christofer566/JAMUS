'use client';

import { ReactNode } from "react";

// components/feed/FeedContainer.tsx
interface FeedContainerProps {
  children: ReactNode;
}

export default function FeedContainer({ children }: FeedContainerProps) {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden px-8 py-8">
        {children}
      </div>
    </div>
  );
}