'use client';

import { AlertCircle } from "lucide-react";

import ErrorScreen from "./ErrorScreen";

export default function LoadingError() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[#1E1F2B] px-8">
      <ErrorScreen
        icon={
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-red-500/20">
            <AlertCircle className="h-12 w-12 text-[#EF4444]" />
          </div>
        }
        title="문제가 발생했습니다"
        message="일시적 문제가 발생했습니다"
        actionText="다시 시도"
        onAction={handleRetry}
      />
    </main>
  );
}
