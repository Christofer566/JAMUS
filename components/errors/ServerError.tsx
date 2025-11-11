'use client';

import { Unplug } from "lucide-react";
import { useRouter } from "next/navigation";

import Sidebar from "@/components/layout/Sidebar";

import ErrorScreen from "./ErrorScreen";

export default function ServerError() {
  const router = useRouter();

  const handleGoHome = () => {
    router.push("/");
  };

  return (
    <>
      <Sidebar />
      <main className="ml-[240px] flex min-h-screen w-[calc(100vw-240px)] items-center justify-center bg-[#1E1F2B] px-8">
        <ErrorScreen
          icon={
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-purple-500/20">
              <Unplug className="h-12 w-12 text-[#A855F7]" />
            </div>
          }
          title="일시적인 오류입니다"
          message="문제가 지속되면 고객센터에 문의해주세요"
          actionText="홈으로 가기"
          onAction={handleGoHome}
          errorCode="500"
        />
      </main>
    </>
  );
}
