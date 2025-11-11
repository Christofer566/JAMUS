'use client';

import { WifiOff } from "lucide-react";

import ErrorScreen from "./ErrorScreen";

export default function NetworkError() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[#1E1F2B] px-8">
      <ErrorScreen
        icon={
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-500/20">
            <WifiOff className="h-12 w-12 text-[#6495ED]" />
          </div>
        }
        title="네트워크 연결 오류"
        message="인터넷 연결을 확인해주세요"
        actionText="다시 시도"
        onAction={handleRetry}
      />
    </main>
  );
}
