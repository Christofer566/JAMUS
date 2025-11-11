'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from "react";

import LoadingError from "@/components/errors/LoadingError";
import NetworkError from "@/components/errors/NetworkError";
import ServerError from "@/components/errors/ServerError";

type ErrorType = "network" | "loading" | "server";

export default function TestErrorsPage() {
  const [errorType, setErrorType] = useState<ErrorType>("network");

  const errorComponent = useMemo(() => {
    switch (errorType) {
      case "loading":
        return <LoadingError key="loading" />;
      case "server":
        return <ServerError key="server" />;
      case "network":
      default:
        return <NetworkError key="network" />;
    }
  }, [errorType]);

  return (
    <div className="min-h-screen bg-[#1B1C26]">
      <div className="fixed left-0 right-0 top-0 z-40 border-b border-gray-700/80 bg-[#1E1F2B]/90 px-8 py-4 backdrop-blur">
        <h1 className="mb-4 text-xl font-semibold text-white">오류 화면 테스트</h1>
        <div className="flex gap-4">
          <button
            onClick={() => setErrorType("network")}
            className={`px-6 py-2 font-medium transition-colors ${
              errorType === "network"
                ? "rounded-lg bg-[#6495ED] text-white"
                : "rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Network Error
          </button>
          <button
            onClick={() => setErrorType("loading")}
            className={`px-6 py-2 font-medium transition-colors ${
              errorType === "loading"
                ? "rounded-lg bg-[#EF4444] text-white"
                : "rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Loading Error
          </button>
          <button
            onClick={() => setErrorType("server")}
            className={`px-6 py-2 font-medium transition-colors ${
              errorType === "server"
                ? "rounded-lg bg-[#A855F7] text-white"
                : "rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Server Error
          </button>
        </div>
      </div>

      <div className="pt-28">{errorComponent}</div>
    </div>
  );
}
