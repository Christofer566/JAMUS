'use client';

import { ServerCrash } from "lucide-react";

import ErrorScreen from "./ErrorScreen";

export default function ServerError() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[#1E1F2B] px-8">
      <ErrorScreen
        icon={
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-purple-500/20">
            <ServerCrash className="h-12 w-12 text-[#A855F7]" />
          </div>
        }
        title="서버 오류"
        message="서버에서 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요."
        actionText="다시 시도"
        onAction={handleRetry}
        errorCode="500"
      />
    </main>
  );
}
