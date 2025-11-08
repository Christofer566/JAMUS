type StageId = "Beginner" | "Mid" | "Free";

type StageProgressProps = {
  currentStage?: StageId;
  progress?: number; // 0 ~ 100
  className?: string;
};

const STAGES: {
  id: StageId;
  label: string;
  color: string;
}[] = [
  { id: "Beginner", label: "Beginner", color: "#6EC1E4" },
  { id: "Mid", label: "Mid", color: "#5B8DEF" },
  { id: "Free", label: "Free", color: "#A77BFF" },
];

function mergeClassNames(...values: (string | undefined | false)[]) {
  return values.filter(Boolean).join(" ");
}

export default function StageProgress({
  currentStage = "Beginner",
  progress = 70,
  className,
}: StageProgressProps) {
  const stageIndex = STAGES.findIndex((stage) => stage.id === currentStage);
  const clampedProgress = Math.max(0, Math.min(progress, 100));

  return (
    <div
      className={mergeClassNames(
        "group relative w-full max-w-[200px] transition-all duration-300",
        className,
      )}
    >
      <div className="mb-2 flex justify-between text-[11px] font-medium">
        {STAGES.map((stage, index) => {
          const isCompleted = index < stageIndex;
          const isCurrent = index === stageIndex;
          const labelColor = isCompleted || isCurrent ? stage.color : "#A0A0A0";

          return (
            <span
              key={stage.id}
              className="uppercase tracking-tight"
              style={{ color: labelColor }}
            >
              {stage.label}
            </span>
          );
        })}
      </div>

      <div className="flex h-1.5 overflow-hidden rounded-full bg-[#2A2B39]/40">
        {STAGES.map((stage, index) => {
          const isCompleted = index < stageIndex;
          const isCurrent = index === stageIndex;

          let fillPercent = 0;
          if (isCompleted) {
            fillPercent = 100;
          } else if (isCurrent) {
            fillPercent = clampedProgress;
          }

          return (
            <div key={stage.id} className="relative flex-1 bg-[#2A2B39]">
              <div
                className={mergeClassNames(
                  "h-full transition-all duration-300 ease-out",
                )}
                style={{
                  width: `${fillPercent}%`,
                  background: stage.color,
                  boxShadow:
                    isCurrent && fillPercent > 0
                      ? `0 0 12px ${stage.color}66`
                      : undefined,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="pointer-events-none absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 rounded-md bg-black/80 px-3 py-1 text-xs text-white shadow-lg shadow-black/40 group-hover:flex">
        스테이지 상세 정보 준비 중이에요
      </div>
    </div>
  );
}

