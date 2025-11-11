'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import FeedContainer from '@/components/feed/FeedContainer';
import Billboard from '@/components/feed/Billboard';
import Stage from '@/components/feed/Stage';
import PlayerBar from '@/components/feed/PlayerBar';

const mockSongs = [
  { id: '1', title: 'Summer Breeze', artist: 'The Melodics' },
  { id: '2', title: 'Electric Dreams', artist: 'Neon Waves' },
];

const COLOR_PALETTE = ['#FF7B7B', '#FFD166', '#3DDF85', '#B794F6'];

export default function FeedPage() {
  const router = useRouter();
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    router.refresh();
  }, [router]);

  const currentSong = mockSongs[currentSongIndex];
  const totalDuration = 160;

  const sectionColors = {
    A: COLOR_PALETTE[0],
    B: COLOR_PALETTE[1],
    C: COLOR_PALETTE[2],
    D: COLOR_PALETTE[3],
  };

  const progressSections = [
    { id: 'intro', label: 'In', color: '#7BA7FF', startTime: 0, duration: 16, measures: 4 },
    { id: 'a1', label: 'A', color: sectionColors.A, startTime: 16, duration: 32, measures: 8 },
    { id: 'b1', label: 'B', color: sectionColors.B, startTime: 48, duration: 32, measures: 8 },
    { id: 'c1', label: 'C', color: sectionColors.C, startTime: 80, duration: 32, measures: 8 },
    { id: 'd1', label: 'D', color: sectionColors.D, startTime: 112, duration: 32, measures: 8 },
    { id: 'outro', label: 'Out', color: '#7BA7FF', startTime: 144, duration: 16, measures: 4 },
  ];

  const getCurrentSectionAndMeasure = () => {
    for (let i = 0; i < progressSections.length; i++) {
      const section = progressSections[i];
      const sectionEndTime = section.startTime + section.duration;

      if (currentTime >= section.startTime && currentTime < sectionEndTime) {
        const timeInSection = currentTime - section.startTime;
        const secondsPerMeasure = section.duration / section.measures;
        const currentMeasure = Math.floor(timeInSection / secondsPerMeasure);

        const timeInMeasure = timeInSection % secondsPerMeasure;
        const measureProgress = timeInMeasure / secondsPerMeasure;
        const sectionProgress = timeInSection / section.duration;

        return {
          sectionIndex: i,
          measure: Math.min(currentMeasure, section.measures - 1),
          measureProgress,
          sectionProgress,
        };
      }
    }

    return {
      sectionIndex: progressSections.length - 1,
      measure: progressSections[progressSections.length - 1].measures - 1,
      measureProgress: 0,
      sectionProgress: 1,
    };
  };

  const { sectionIndex, measure, measureProgress, sectionProgress } = getCurrentSectionAndMeasure();

  const currentStageColor =
    sectionIndex >= 0 && sectionIndex < progressSections.length
      ? progressSections[sectionIndex].color
      : '#7BA7FF';

  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        if (prev >= totalDuration) return 0;
        return prev + 0.05;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying, totalDuration]);

  const chordProgression = [
    ['C', 'G', 'Am', 'F'],
    ['C', 'Am', 'F', 'G'],
    ['C', 'F', 'G', 'C'],
    ['Dm', 'G', 'C', 'Am'],
    ['Dm', 'G', 'C', 'C'],
    ['F', 'G', 'Em', 'Am'],
    ['F', 'G', 'C', 'C'],
    ['Em', 'Am', 'Dm', 'G'],
    ['Em', 'F', 'G', 'C'],
    ['F', 'G', 'C', 'C'],
  ];

  const performers = [
    { name: 'JAMUS', color: '#7BA7FF', playRange: [0, 16] as [number, number] },
    { name: 'RhythmMasterX', color: COLOR_PALETTE[0], playRange: [16, 48] as [number, number] },
    { name: 'PianoMaestro', color: COLOR_PALETTE[1], playRange: [48, 80] as [number, number] },
    { name: 'DrummerBoy', color: COLOR_PALETTE[2], playRange: [80, 112] as [number, number] },
    { name: 'GuitarGuru', color: COLOR_PALETTE[3], playRange: [112, 144] as [number, number] },
  ];

  const handleTimeChange = (newTime: number) => {
    setCurrentTime(newTime);
  };

  return (
    <FeedContainer>
      <div className="h-full flex flex-col">
        {/* Billboard */}
        <div className="w-full flex-shrink-0 mb-4">
          <Billboard
            songTitle={currentSong.title}
            artist={currentSong.artist}
            chordProgression={chordProgression}
            performers={performers}
            currentSectionIndex={sectionIndex}
            currentMeasure={measure}
            measureProgress={measureProgress}
            sectionProgress={sectionProgress}
          />
        </div>

        {/* Stage */}
        <div className="w-full flex-shrink-0 h-[12vh] mb-6">
          <Stage currentPerformer="RhythmMasterX" backgroundColor={currentStageColor} />
        </div>

        {/* Spacer */}
        <div className="flex-1"></div>

        {/* Player Controls */}
        <div className="w-full flex-shrink-0">
          <PlayerBar
            songTitle={currentSong.title}
            artistName={currentSong.artist}
            isPlaying={isPlaying}
            onPlayPause={() => setIsPlaying(!isPlaying)}
            sections={progressSections}
            currentTime={currentTime}
            duration={totalDuration}
            onTimeChange={handleTimeChange}
          />
        </div>
      </div>
    </FeedContainer>
  );
}
