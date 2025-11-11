'use client';

import { ReactNode } from "react";

// components/feed/FeedContainer.tsx
interface FeedContainerProps {
  children: ReactNode;
}

export default function FeedContainer({ children }: FeedContainerProps) {
  return (
    <div className="w-full h-full p-8">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col">
        {children}
      </div>
    </div>
  );
}