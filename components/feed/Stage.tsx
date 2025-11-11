'use client';

interface StageProps {
  currentPerformer: string;
  backgroundColor?: string;
}

export default function Stage({ currentPerformer, backgroundColor = "#7BA7FF" }: StageProps) {
  return (
    <section className="flex h-28 items-center justify-center bg-[#1B1C26] px-8">
      <div className="flex w-full max-w-[900px] flex-col items-center gap-4">
        <span className="text-sm text-gray-400">현재 연주자: {currentPerformer}</span>
        <div className="relative flex h-28 w-28 items-center justify-center">
          <div
            className="absolute inset-0 rounded-full blur-3xl"
            style={{ backgroundColor: `${backgroundColor}40` }}
          />
          <div
            className="relative z-10 flex h-28 w-28 items-center justify-center rounded-full"
            style={{ backgroundColor: `${backgroundColor}30` }}
          >
            <span className="text-sm text-white">캐릭터 준비 중</span>
          </div>
        </div>
      </div>
    </section>
  );
}