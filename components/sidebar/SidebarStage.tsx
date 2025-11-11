'use client';

import Stage from "@/components/feed/Stage";
import { useStageContext } from "@/contexts/StageContext";

type SidebarStageProps = {
  className?: string;
};

function mergeClassNames(...values: (string | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

export default function SidebarStage({ className }: SidebarStageProps) {
  const { currentPerformer, stageColor } = useStageContext();

  return (
    <div
      className={mergeClassNames(
        "overflow-hidden rounded-2xl border border-[#FFFFFF]/10 bg-[#1B1C26]/90 p-3",
        className,
      )}
    >
      <Stage currentPerformer={currentPerformer} backgroundColor={stageColor} size="lg" />
    </div>
  );
}

