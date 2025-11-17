import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import SheetMusic from "./SheetMusic";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";

interface Performer {
  name: string;
  color: string;
  playRange: [number, number];
}

interface BillboardProps {
  className?: string;
  userName: string;
  userProfile?: string;
  instrument?: string;
  songTitle: string;
  artistName: string;
  performers: Performer[];
  chordProgression: string[][];
  currentSectionIndex: number;
  currentMeasure: number;
  measureProgress: number;
  sectionProgress: number;
}

function mergeClassNames(...values: (string | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

const createSections = (performers: Performer[], chordProgression: string[][]) => {
  const sections: {
    id: string;
    label: string;
    user: string;
    userImage?: string;
    color: string;
    measures: { chord: string }[];
  }[] = [];

  sections.push({
    id: "intro",
    label: "Intro",
    user: "JAMUS",
    userImage: undefined,
    color: "#7BA7FF",
    measures: chordProgression[0]?.map((chord: string) => ({ chord })) || [],
  });

  const labels = ["A", "B", "C", "D"];
  const realPerformers = performers.filter((performer) => performer.name !== "JAMUS");

  realPerformers.forEach((performer, performerIndex) => {
    if (performerIndex < 4) {
      const firstLineIndex = 1 + performerIndex * 2;
      const secondLineIndex = firstLineIndex + 1;

      const firstLineMeasures =
        chordProgression[firstLineIndex]?.map((chord: string) => ({ chord })) || [];
      const secondLineMeasures =
        chordProgression[secondLineIndex]?.map((chord: string) => ({ chord })) || [];

      sections.push({
        id: `section-${labels[performerIndex]} `,
        label: labels[performerIndex],
        user: performer.name,
        userImage: undefined,
        color: performer.color,
        measures: [...firstLineMeasures, ...secondLineMeasures],
      });
    }
  });

  sections.push({
    id: "outro",
    label: "Outro",
    user: "JAMUS",
    userImage: undefined,
    color: "#7BA7FF",
    measures: chordProgression[9]?.map((chord: string) => ({ chord })) || [],
  });

  return sections;
};

export default function Billboard({
  className,
  userName,
  userProfile,
  instrument,
  songTitle,
  artistName,
  performers,
  chordProgression,
  currentSectionIndex,
  currentMeasure,
  measureProgress,
  sectionProgress,
}: BillboardProps) {
  const router = useRouter();
  const sections = createSections(performers, chordProgression);
  const [selectedMeasures, setSelectedMeasures] = useState<{ start: number; end: number } | null>(null);
  const billboardRef = useRef<HTMLDivElement | null>(null);

  useOnClickOutside(billboardRef as React.RefObject<HTMLElement>, () => setSelectedMeasures(null));

  const handleJoinJam = () => {
    router.push("/single");
  };

  return (
    <div
      ref={billboardRef}
      className={mergeClassNames(
        "flex h-full w-full flex-col rounded-2xl border border-white/10 bg-[#1B1C26]/60 shadow-2xl backdrop-blur-xl",
        className,
      )}
    >
      <div className="flex flex-shrink-0 items-center justify-between px-6 pt-5 pb-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 via-blue-500 to-indigo-500 shadow-lg">
            <span className="text-2xl">🎵</span>
          </div>
          <div>
            <p className="text-lg font-bold text-white">{songTitle}</p>
            <p className="text-sm text-[#9B9B9B]">{artistName}</p>
          </div>
        </div>

        <button
          onClick={handleJoinJam}
          className="rounded-full bg-white px-6 py-2 text-sm font-medium text-[#1B1C26] shadow-lg transition-all hover:bg-[#E0E0E0] hover:shadow-xl"
        >
          이 JAM에 참여하기
        </button>
      </div>

      <div className="mx-5 mb-5 flex-1 overflow-hidden rounded-2xl border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 p-8 backdrop-blur-sm">
        <SheetMusic
          sections={sections}
          currentSectionIndex={currentSectionIndex}
          currentMeasure={currentMeasure}
          measureProgress={measureProgress}
          sectionProgress={sectionProgress}
          selectedMeasures={selectedMeasures}
          onSelectionChange={setSelectedMeasures}
        />
      </div>
    </div>
  );
}
