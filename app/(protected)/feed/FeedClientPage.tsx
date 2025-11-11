'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import FeedContainer from '@/components/feed/FeedContainer';
import Billboard from '@/components/feed/Billboard';
import PlayerBar from '@/components/feed/PlayerBar';
import { useStageContext } from '@/contexts/StageContext';

const mockJams = [
  { id: "1", name: "RhythmMasterX", instrument: "Guitar", profileImage: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop", color: "#FF6B6B" },
  { id: "2", name: "PianoMaestro", instrument: "Piano", profileImage: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop", color: "#4ECDC4" },
  { id: "3", name: "DrummerBoy", instrument: "Drums", profileImage: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&h=100&fit=crop", color: "#FFE66D" },
  { id: "4", name: "BassQueen", instrument: "Bass", profileImage: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop", color: "#A8E6CF" },
  { id: "5", name: "SynthWizard", instrument: "Synthesizer", profileImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop", color: "#FF8B94" },
  { id: "6", name: "ViolinStar", instrument: "Violin", profileImage: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop", color: "#B4A7D6" },
  { id: "7", name: "SaxMaster", instrument: "Saxophone", profileImage: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop", color: "#FFD93D" },
  { id: "8", name: "TrumpetHero", instrument: "Trumpet", profileImage: "https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?w=100&h=100&fit=crop", color: "#6BCB77" }
];

const mockSongs = [
  { id: "1", title: "Dynamite", artist: "BTS", duration: 199 },
  { id: "2", title: "Butter", artist: "BTS", duration: 164 },
  { id: "3", title: "Permission to Dance", artist: "BTS", duration: 187 }
];

const COLOR_PALETTE = ['#FF7B7B', '#FFD166', '#3DDF85', '#B794F6'];

const getPerformersForJam = (jamIndex: number) => {
  const startIndex = (jamIndex * 4) % mockJams.length;

  return [
    { name: 'JAMUS', color: '#7BA7FF', playRange: [0, 16] as [number, number] },
    {
      name: mockJams[startIndex].name,
      color: mockJams[startIndex].color,
      playRange: [16, 48] as [number, number],
    },
    {
      name: mockJams[(startIndex + 1) % mockJams.length].name,
      color: mockJams[(startIndex + 1) % mockJams.length].color,
      playRange: [48, 80] as [number, number],
    },
    {
      name: mockJams[(startIndex + 2) % mockJams.length].name,
      color: mockJams[(startIndex + 2) % mockJams.length].color,
      playRange: [80, 112] as [number, number],
    },
    {
      name: mockJams[(startIndex + 3) % mockJams.length].name,
      color: mockJams[(startIndex + 3) % mockJams.length].color,
      playRange: [112, 144] as [number, number],
    },
  ];
};

export default function FeedClientPage() {
  const router = useRouter();
  const [currentJamIndex, setCurrentJamIndex] = useState(0);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [jamOnlyMode, setJamOnlyMode] = useState(false);
  const { setCurrentPerformer, setStageColor } = useStageContext();

  useEffect(() => {
    router.refresh();
  }, [router]);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        router.refresh();
      }
    };

    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [router]);

  const currentJam = mockJams[currentJamIndex];
  const currentSong = mockSongs[currentSongIndex];
  const totalDuration = currentSong.duration;

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

  const introEndTime = progressSections[0].startTime + progressSections[0].duration;
  const outroStartTime = progressSections[progressSections.length - 1].startTime;

  const clampTime = useCallback(
    (time: number) => {
      if (jamOnlyMode) {
        const epsilon = 0.01;
        const lowerBound = introEndTime;
        const upperBound = Math.max(lowerBound, outroStartTime - epsilon);
        return Math.min(Math.max(time, lowerBound), upperBound);
      }

      const lowerBound = 0;
      const upperBound = totalDuration;
      return Math.min(Math.max(time, lowerBound), upperBound);
    },
    [introEndTime, jamOnlyMode, outroStartTime, totalDuration]
  );

  const getRandomStageColor = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * COLOR_PALETTE.length);
    return COLOR_PALETTE[randomIndex];
  }, []);

  const handleJamChange = useCallback((direction: 'next' | 'prev') => {
    console.log('🎵 JAM 변경 시작:', direction);
    console.log('현재 인덱스:', currentJamIndex);

    setCurrentTime(jamOnlyMode ? introEndTime : 0);
    setIsPlaying(false);
    setStageColor(getRandomStageColor());
    if (direction === 'next') {
      setCurrentJamIndex((prev) => {
        const newIndex = (prev + 1) % mockJams.length;
        console.log('✅ 새 인덱스:', newIndex, mockJams[newIndex].name);
        return newIndex;
      });
    } else {
      setCurrentJamIndex((prev) => {
        const newIndex = (prev - 1 + mockJams.length) % mockJams.length;
        console.log('✅ 새 인덱스:', newIndex, mockJams[newIndex].name);
        return newIndex;
      });
    }
  }, [currentJamIndex, getRandomStageColor, introEndTime, jamOnlyMode, setStageColor]);

  const handleSongChange = useCallback((direction: 'next' | 'prev') => {
    console.log('🎵 곡 변경 시작:', direction);
    console.log('현재 곡 인덱스:', currentSongIndex);

    setCurrentTime(jamOnlyMode ? introEndTime : 0);
    setIsPlaying(false);
    setStageColor(getRandomStageColor());

    if (direction === 'next') {
      setCurrentSongIndex((prev) => {
        const newIndex = (prev + 1) % mockSongs.length;
        console.log('✅ 새 곡:', mockSongs[newIndex].title);
        return newIndex;
      });
    } else {
      setCurrentSongIndex((prev) => {
        const newIndex = (prev - 1 + mockSongs.length) % mockSongs.length;
        console.log('✅ 새 곡:', mockSongs[newIndex].title);
        return newIndex;
      });
    }
  }, [currentSongIndex, getRandomStageColor, introEndTime, jamOnlyMode, setStageColor]);

  const togglePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const skipForward = useCallback(() => {
    setCurrentTime((prev) => clampTime(prev + 5));
  }, [clampTime]);

  const skipBackward = useCallback(() => {
    setCurrentTime((prev) => clampTime(prev - 5));
  }, [clampTime]);

  // 키보드 제어: ←→ (JAM 전환), ZX (마디 이동), Space (재생/정지)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      switch(e.code) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          console.log('⬇️ 아래 화살표 눌림');
          handleSongChange('next');
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          console.log('⬆️ 위 화살표 눌림');
          handleSongChange('prev');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleJamChange('prev');
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleJamChange('next');
          break;
        case 'KeyZ':
          e.preventDefault();
          skipBackward();
          break;
        case 'KeyX':
          e.preventDefault();
          skipForward();
          break;
        case 'KeyS':
          e.preventDefault();
          e.stopPropagation();
          {
            const nextJamOnly = !jamOnlyMode;
            setJamOnlyMode(nextJamOnly);
            console.log('🎛️ JAM-only 모드 토글:', nextJamOnly ? 'ON' : 'OFF');
          }
          break;
        case 'Space':
          e.preventDefault();
          e.stopPropagation();
          togglePlayPause();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress, true);
    return () => window.removeEventListener('keydown', handleKeyPress, true);
  }, [handleJamChange, handleSongChange, jamOnlyMode, skipBackward, skipForward, togglePlayPause]);

  useEffect(() => {
    if (jamOnlyMode) {
      setCurrentTime((prev) => clampTime(prev));
    }
  }, [clampTime, jamOnlyMode]);

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
        const nextTime = prev + 0.05;

        if (jamOnlyMode) {
          if (nextTime >= outroStartTime) {
            return introEndTime;
          }
          return clampTime(nextTime);
        }

        if (nextTime >= totalDuration) {
          return 0;
        }

        return nextTime;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [clampTime, introEndTime, isPlaying, jamOnlyMode, outroStartTime, totalDuration]);

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

  const performers = getPerformersForJam(currentJamIndex);

  const getCurrentPerformer = useCallback(() => {
    const currentSection = progressSections[sectionIndex];
    if (!currentSection) {
      return 'JAMUS';
    }

    for (const performer of performers) {
      const [startTime, endTime] = performer.playRange;
      if (currentTime >= startTime && currentTime < endTime) {
        return performer.name;
      }
    }

    return 'JAMUS';
  }, [currentTime, performers, progressSections, sectionIndex]);

  const getCurrentPerformerColor = useCallback(() => {
    for (const performer of performers) {
      const [startTime, endTime] = performer.playRange;
      if (currentTime >= startTime && currentTime < endTime) {
        return performer.color;
      }
    }

    return '#7BA7FF';
  }, [currentTime, performers]);

  const currentPerformerName = getCurrentPerformer();

  const handleTimeChange = (newTime: number) => {
    setCurrentTime(clampTime(newTime));
  };

  useEffect(() => {
    setCurrentPerformer(currentPerformerName);
  }, [currentPerformerName, setCurrentPerformer]);

  useEffect(() => {
    setStageColor(getCurrentPerformerColor());
  }, [getCurrentPerformerColor, setStageColor]);

  return (
    <FeedContainer>
      <div className="flex h-full flex-col">
        <Billboard
          key={`jam-${currentJamIndex}-song-${currentSongIndex}`}
          className="flex-1"
          userName={currentJam.name}
          userProfile={currentJam.profileImage}
          instrument={currentJam.instrument}
          songTitle={currentSong.title}
          artistName={currentSong.artist}
          chordProgression={chordProgression}
          performers={performers}
          currentSectionIndex={sectionIndex}
          currentMeasure={measure}
          measureProgress={measureProgress}
          sectionProgress={sectionProgress}
        />

        <div className="h-6 flex-shrink-0" />

        <PlayerBar
          className="flex-shrink-0"
          songTitle={currentSong.title}
          artistName={currentSong.artist}
          isPlaying={isPlaying}
          onPlayPause={togglePlayPause}
          sections={progressSections}
          currentTime={currentTime}
          duration={totalDuration}
          onTimeChange={handleTimeChange}
          onNextJam={() => handleJamChange('next')}
          onPrevJam={() => handleJamChange('prev')}
          jamOnlyMode={jamOnlyMode}
          onToggleJamOnly={setJamOnlyMode}
        />
      </div>
    </FeedContainer>
  );
}
