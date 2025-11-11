'use client';

interface StageProps {
  currentPerformer: string;
  backgroundColor?: string;
  size?: "md" | "lg";
}

const SIZE_MAP = {
  md: {
    container: "h-28",
    circle: "h-28 w-28",
    blur: "blur-3xl",
    text: "text-sm",
    gap: "gap-4",
  },
  lg: {
    container: "h-40",
    circle: "h-40 w-40",
    blur: "blur-3xl",
    text: "text-base",
    gap: "gap-5",
  },
} as const;

export default function Stage({ currentPerformer, backgroundColor = "#7BA7FF", size = "md" }: StageProps) {
  const sizeConfig = SIZE_MAP[size];

  return (
    <section className={`flex items-center justify-center bg-[#1B1C26] px-6 ${sizeConfig.container}`}>
      <div className={`flex w-full max-w-[900px] flex-col items-center ${sizeConfig.gap}`}>
        <span className={`${sizeConfig.text} text-gray-300`}>현재 연주자: {currentPerformer}</span>
        <div className={`relative flex items-center justify-center ${sizeConfig.circle}`}>
          <div
            className={`absolute inset-0 rounded-full ${sizeConfig.blur}`}
            style={{ backgroundColor: `${backgroundColor}40` }}
          />
          <div
            className={`relative z-10 flex items-center justify-center rounded-full ${sizeConfig.circle}`}
            style={{ backgroundColor: `${backgroundColor}30` }}
          >
            <span className="text-sm text-white">캐릭터 준비 중</span>
          </div>
        </div>
      </div>
    </section>
  );
}