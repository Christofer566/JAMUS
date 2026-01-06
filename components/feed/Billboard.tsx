import { useState, useRef } from "react";
import SheetMusic from "./SheetMusic";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";

interface Performer {
  name: string;
  color: string;
  playRange: [number, number];
}

// Feed용 structure_data (마디 수 정보)
interface FeedStructureData {
  introMeasures: number;
  chorusMeasures: number;
  outroMeasures: number;
  feedTotalMeasures: number;
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
  structureData?: FeedStructureData;  // 추가
  currentSectionIndex: number;
  currentMeasure: number;
  measureProgress: number;
  sectionProgress: number;
}

function mergeClassNames(...values: (string | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

/**
 * Feed용 섹션 생성 함수
 * 구조: intro + chorus×4 + outro
 *
 * @param performers - JAMUS 제외한 4명의 performer
 * @param chordProgression - 4마디씩 그룹핑된 2D 배열
 * @param structureData - 마디 수 정보
 */
const createSections = (
  performers: Performer[],
  chordProgression: string[][],
  structureData?: FeedStructureData
) => {
  const sections: {
    id: string;
    label: string;
    user: string;
    userImage?: string;
    color: string;
    measures: { chord: string }[];
  }[] = [];

  // 기본값 (structureData 없는 경우)
  const introMeasures = structureData?.introMeasures || 8;
  const chorusMeasures = structureData?.chorusMeasures || 32;
  const outroMeasures = structureData?.outroMeasures || 8;

  // 줄 수 계산 (4마디 = 1줄)
  const introLines = Math.ceil(introMeasures / 4);
  const chorusLines = Math.ceil(chorusMeasures / 4);
  const outroLines = Math.ceil(outroMeasures / 4);


  let lineIndex = 0;

  // 1. Intro 섹션 (JAMUS)
  const introMeasuresList: { chord: string }[] = [];
  for (let i = 0; i < introLines && lineIndex < chordProgression.length; i++) {
    const line = chordProgression[lineIndex];
    if (line) {
      line.forEach(chord => introMeasuresList.push({ chord }));
    }
    lineIndex++;
  }
  sections.push({
    id: "intro",
    label: "Intro",
    user: "JAMUS",
    userImage: undefined,
    color: "#7BA7FF",
    measures: introMeasuresList,
  });

  // 2. Chorus × 4 섹션 (각 performer에게 1 chorus씩)
  const chorusLabels = ["A", "B", "C", "D"];
  const realPerformers = performers.filter(p => p.name !== "JAMUS");

  for (let chorusIdx = 0; chorusIdx < 4; chorusIdx++) {
    const performer = realPerformers[chorusIdx] || {
      name: `Player ${chorusIdx + 1}`,
      color: '#7BA7FF'
    };

    const chorusMeasuresList: { chord: string }[] = [];
    for (let i = 0; i < chorusLines && lineIndex < chordProgression.length; i++) {
      const line = chordProgression[lineIndex];
      if (line) {
        line.forEach(chord => chorusMeasuresList.push({ chord }));
      }
      lineIndex++;
    }

    sections.push({
      id: `section-${chorusLabels[chorusIdx]}`,
      label: chorusLabels[chorusIdx],
      user: performer.name,
      userImage: undefined,
      color: performer.color,
      measures: chorusMeasuresList,
    });
  }

  // 3. Outro 섹션 (JAMUS)
  const outroMeasuresList: { chord: string }[] = [];
  while (lineIndex < chordProgression.length) {
    const line = chordProgression[lineIndex];
    if (line) {
      line.forEach(chord => outroMeasuresList.push({ chord }));
    }
    lineIndex++;
  }
  sections.push({
    id: "outro",
    label: "Outro",
    user: "JAMUS",
    userImage: undefined,
    color: "#7BA7FF",
    measures: outroMeasuresList,
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
  structureData,
  currentSectionIndex,
  currentMeasure,
  measureProgress,
  sectionProgress,
}: BillboardProps) {
  const sections = createSections(performers, chordProgression, structureData);
  const [selectedMeasures, setSelectedMeasures] = useState<{ start: number; end: number } | null>(null);
  const billboardRef = useRef<HTMLDivElement | null>(null);

  useOnClickOutside(billboardRef as React.RefObject<HTMLElement>, () => setSelectedMeasures(null));

  return (
    <div
      ref={billboardRef}
      className={mergeClassNames(
        "flex h-full w-full flex-col",
        className,
      )}
    >
      {/* 악보 영역만 표시 (헤더는 FeedClientPage로 이동) */}
      <div className="flex-1 overflow-hidden p-8">
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
