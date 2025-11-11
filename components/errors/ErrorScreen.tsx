'use client';

import { type ReactNode } from "react";

export interface ErrorScreenProps {
  icon: ReactNode;
  title: string;
  message: string;
  actionText: string;
  onAction: () => void;
  errorCode?: string;
}

export default function ErrorScreen({
  icon,
  title,
  message,
  actionText,
  onAction,
  errorCode,
}: ErrorScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center">
      <div className="mb-6">{icon}</div>

      <h1 className="mb-3 text-[22px] font-semibold text-white">
        {title}
      </h1>

      <p className="mb-6 max-w-sm text-[14px] text-gray-400">{message}</p>

      {errorCode && (
        <p className="mb-8 text-[12px] text-gray-500">
          Error Code: {errorCode}
        </p>
      )}

      <button
        onClick={onAction}
        className="rounded-lg bg-[#6495ED] px-8 py-3 text-[15px] font-medium text-white transition-colors duration-300 hover:bg-[#5A84DC]"
      >
        {actionText}
      </button>
    </div>
  );
}

