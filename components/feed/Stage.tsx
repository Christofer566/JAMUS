'use client';

interface StageProps {
  currentPerformer: string;
}

export default function Stage({ currentPerformer }: StageProps) {
  return (
    <section className="flex h-28 items-center justify-center bg-[#1B1C26] px-8">
      <div className="flex w-full max-w-[900px] flex-col items-center gap-4">
        <span className="text-sm text-gray-400">현재 연주자: {currentPerformer}</span>
        <div className="relative flex h-28 w-28 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-purple-500/30 blur-3xl" />
          <div className="relative z-10 flex h-28 w-28 items-center justify-center rounded-full bg-purple-500/20">
            <span className="text-sm text-white">캐릭터 준비 중</span>
          </div>
        </div>
      </div>
    </section>
  );
}