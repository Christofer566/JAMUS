// components/single/feedback/AIAdjustmentLoading.tsx
import React from 'react';

const AIAdjustmentLoading = () => {
  return (
    <div
      data-testid="ai-adjustment-loading"
      className="flex flex-col items-center justify-center h-full bg-[#0D1B2A] text-white"
    >
      <div className="flex items-center space-x-2">
        <span className="animate-bounce-slow delay-0 w-3 h-3 bg-[#1E6FFB] rounded-full"></span>
        <span className="animate-bounce-slow delay-150 w-3 h-3 bg-[#1E6FFB] rounded-full"></span>
        <span className="animate-bounce-slow delay-300 w-3 h-3 bg-[#1E6FFB] rounded-full"></span>
      </div>
      <p className="mt-4 text-lg">AI가 당신의 연주를 조율 중입니다…</p>
      <style jsx>{`
        @keyframes bounce-slow {
          0%,
          100% {
            transform: translateY(-25%);
            animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
          }
          50% {
            transform: translateY(0);
            animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
          }
        }
        .animate-bounce-slow {
          animation: bounce-slow 1.4s infinite;
        }
        .delay-0 {
          animation-delay: 0s;
        }
        .delay-150 {
          animation-delay: 0.15s;
        }
        .delay-300 {
          animation-delay: 0.3s;
        }
      `}</style>
    </div>
  );
};

export default AIAdjustmentLoading;
