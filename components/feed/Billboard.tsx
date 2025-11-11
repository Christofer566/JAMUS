'use client';

import React from "react";
import SheetMusic from "./SheetMusic";

interface Performer {
  name: string;
  color: string;
  playRange: [number, number];
}

interface BillboardProps {
  songTitle: string;
  artist: string;
  performers: Performer[];
  chordProgression: string[][];
  currentSectionIndex: number;
  currentMeasure: number;
  measureProgress: number;
  sectionProgress: number;
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
        id: `section-${labels[performerIndex]}`,
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
  songTitle,
  artist,
  performers,
  chordProgression,
  currentSectionIndex,
  currentMeasure,
  measureProgress,
  sectionProgress,
}: BillboardProps) {
  const sections = createSections(performers, chordProgression);

  const handleJamJoin = () => {
    console.log("JAM 참여하기 클릭 - Single 모드로 이동 예정");
  };

  return (
    <div className="flex h-[70vh] w-full flex-col rounded-2xl border border-white/10 bg-[#1B1C26]/60 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-shrink-0 items-start justify-between p-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#7BA7FF]/30 bg-[#7BA7FF]/30">
            <span className="text-sm font-medium text-white">J</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">{songTitle}</h2>
            <p className="text-sm text-[#9B9B9B]">{artist}</p>
          </div>
        </div>

        <button
          onClick={handleJamJoin}
          className="rounded-full bg-white px-5 py-2 text-sm font-medium text-[#1B1C26] shadow-lg transition-all hover:bg-[#E0E0E0] hover:shadow-xl"
        >
          <span>이 JAM에 참여하기</span>
        </button>
      </div>

      <div className="mx-4 mb-4 flex-1 overflow-hidden rounded-xl border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 p-8 backdrop-blur-sm">
        <SheetMusic
          sections={sections}
          currentSectionIndex={currentSectionIndex}
          currentMeasure={currentMeasure}
          measureProgress={measureProgress}
          sectionProgress={sectionProgress}
        />
      </div>
    </div>
  );
}