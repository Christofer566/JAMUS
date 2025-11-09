'use client';

import Billboard from "@/components/feed/Billboard";
import Stage from "@/components/feed/Stage";
import PlayerBar from "@/components/feed/PlayerBar";

const sampleFeedData = {
  songTitle: "Electric Dreams",
  artist: "Neon Waves",
  duration: 160,
  currentTime: 0,
  chordProgression: [
    ["Em", "D", "C", "B7"],
    ["Em", "D", "C", "B7"],
    ["Em", "Am", "B7", "Em"],
    ["Am", "B7", "Em", "Em"],
  ],
  performers: [
    { name: "JAMUS", color: "#3B82F6", playRange: [0, 2] as [number, number] },
    { name: "GuitarGuru", color: "#10B981", playRange: [2, 4] as [number, number] },
    { name: "SynthWizard", color: "#F59E0B", playRange: [4, 6] as [number, number] },
    { name: "ViolinVirtuoso", color: "#A855F7", playRange: [6, 8] as [number, number] },
  ],
  currentPerformer: "JAMUS",
};

export default function FeedPage() {
  const {
    songTitle,
    artist,
    duration,
    currentTime,
    chordProgression,
    performers,
    currentPerformer,
  } = sampleFeedData;

  return (
    <div className="ml-60 flex h-screen flex-col bg-[#1B1C26] text-white">
      <Billboard
        songTitle={songTitle}
        artist={artist}
        chordProgression={chordProgression}
        performers={performers}
      />
      <Stage currentPerformer={currentPerformer} />
      <PlayerBar
        songTitle={songTitle}
        artist={artist}
        duration={duration}
        currentTime={currentTime}
        performers={performers}
      />
    </div>
  );
}