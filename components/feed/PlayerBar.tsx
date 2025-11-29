'use client';

import { Play, Pause, RotateCcw, RotateCw, ChevronLeft, ChevronRight } from "lucide-react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { useState, useEffect, useMemo } from 'react';
import { SongWithMusicData, ProgressSection } from '@/types/music';
import { calculateMeasureDuration, seekByMeasures, getCurrentMeasure } from '@/utils/musicCalculations';

interface Performer {
  name: string;
  color: string;
  playRange: [number, number]; // [startMeasure, endMeasure]
}

interface PlayerBarProps {
  songTitle: string;
  artistName: string;
  isPlaying: boolean;
  onPlayPause: () => void;
  song: SongWithMusicData;
  progressSections: ProgressSection[];
  currentTime: number;
  duration: number;
  onTimeChange: (time: number) => void;
  className?: string;
  onNextJam?: () => void;
  onPrevJam?: () => void;
  jamOnlyMode?: boolean;
  onToggleJamOnly?: (value: boolean) => void;
  performers?: Performer[]; // 연주자 배열 추가
  pressedKey?: string | null; // 현재 눌린 키 (시각적 피드백용)
  feedIntroEndTime?: number; // JAM 시작 시간 (Chorus A 시작)
  feedOutroStartTime?: number; // JAM 끝 시간 (Outro 시작)
}

export default function PlayerBar({
  songTitle,
  artistName,
  isPlaying,
  onPlayPause,
  song,
  progressSections = [],
  currentTime,
  duration,
  onTimeChange,
  className,
  onNextJam,
  onPrevJam,
  jamOnlyMode = false,
  onToggleJamOnly,
  performers = [],
  pressedKey = null,
  feedIntroEndTime = 0,
  feedOutroStartTime = 0,
}: PlayerBarProps) {
  const [currentMeasure, setCurrentMeasure] = useState(1);

  // 🎵 슬라이더 값 변경 핸들러 (드래그/클릭 모두 처리)
  const handleSliderChange = (value: number[]) => {
    let newTime = value[0];

    // JAM만 듣기 모드일 때 범위 보정
    if (jamOnlyMode && feedIntroEndTime > 0 && feedOutroStartTime > 0) {
      if (newTime < feedIntroEndTime) {
        newTime = feedIntroEndTime;
        console.log('🎵 [Slider] Intro 범위 → Chorus A로 보정');
      } else if (newTime >= feedOutroStartTime) {
        newTime = feedOutroStartTime - 0.1;
        console.log('🎵 [Slider] Outro 범위 → Chorus D 끝으로 보정');
      }
    }

    onTimeChange(newTime);
  };

  // 🔍 디버깅: performers 전체 데이터 확인
  useEffect(() => {
    if (performers.length > 0) {
      console.log('🎨 [PlayerBar] performers 전체:', JSON.stringify(performers.map(p => ({
        name: p.name,
        color: p.color,
        playRange: p.playRange,
      })), null, 2));
    }
  }, [performers]);

  const measureDuration = useMemo(() => {
    if (!song) return 0;
    return calculateMeasureDuration(song.bpm, song.time_signature);
  }, [song]);

  // 🎵 연주자별 시간 구간 (playRange는 이미 초 단위)
  const performerTimeRanges = useMemo(() => {
    if (performers.length === 0) return [];

    // 섹션 라벨
    const sectionLabels = ['Intro', 'A', 'B', 'C', 'D', 'Outro'];

    const ranges = performers.map((p, idx) => ({
      name: p.name,
      color: p.color,
      label: sectionLabels[idx] || p.name.charAt(0),
      startTime: p.playRange[0], // 이미 초 단위
      endTime: p.playRange[1],   // 이미 초 단위
    }));

    // 디버깅: 색상 및 시간 구간 확인
    console.log('🎨 [PlayerBar] performerTimeRanges:', ranges.map(r => ({
      name: r.name,
      label: r.label,
      color: r.color,
      startTime: r.startTime.toFixed(1) + 's',
      endTime: r.endTime.toFixed(1) + 's',
    })));

    return ranges;
  }, [performers]);

  // 🎵 현재 재생 위치의 연주자 색상
  const currentPerformerColor = useMemo(() => {
    if (performerTimeRanges.length === 0) return '#7BA7FF';

    for (const range of performerTimeRanges) {
      if (currentTime >= range.startTime && currentTime < range.endTime) {
        return range.color;
      }
    }
    return '#7BA7FF'; // 기본 JAMUS 색상
  }, [currentTime, performerTimeRanges]);

  useEffect(() => {
    if (measureDuration > 0) {
      const measure = getCurrentMeasure(currentTime, measureDuration);
      setCurrentMeasure(measure);
    }
  }, [currentTime, measureDuration]);

  const handleSeekByMeasures = (measureOffset: number) => {
    if (!song) return;
    const newTime = seekByMeasures(
      currentTime,
      measureOffset,
      measureDuration,
      duration
    );
    onTimeChange(newTime);
  };

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle if not typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.code) {
        case 'KeyZ':
          e.preventDefault();
          handleSeekByMeasures(-1);
          break;
        case 'KeyX':
          e.preventDefault();
          handleSeekByMeasures(1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentTime, measureDuration, duration, onTimeChange]); // Dependencies for handleSeekByMeasures logic inside effect

  const handleSkip = (seconds: number) => {
    onTimeChange(currentTime + seconds);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const containerClassName = ["mx-auto w-full max-w-4xl", className].filter(Boolean).join(" ");

  return (
    <div className={containerClassName}>
      <div className="relative rounded-2xl border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 px-5 py-8 backdrop-blur-sm">
        <div className="absolute left-5 top-5">
          <label className="group flex w-fit items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={jamOnlyMode}
              onChange={(event) => onToggleJamOnly?.(event.target.checked)}
              className="flex h-4 w-4 appearance-none items-center justify-center rounded border-2 border-[#B38CFF]/60 bg-transparent text-[#B38CFF] transition-all checked:border-[#B38CFF] checked:bg-[#B38CFF] after:hidden after:text-[10px] after:text-white checked:after:block after:content-['✓']"
            />
            <span className="text-sm text-[#B38CFF] transition-colors group-hover:text-[#C79DFF]">JAM만 듣기 (S)</span>
          </label>
        </div>

        <div className="relative mt-14 pr-40">
          <div className="space-y-2">
            <div className="relative pt-8">
              {/* 🎵 연주자별 마커 (performers 기반) - 재생바 위에 표시 */}
              {performerTimeRanges.length > 0 && duration > 0 && (
                <div className="absolute top-0 left-0 right-0 h-7 pointer-events-none">
                  {performerTimeRanges.map((range, index) => {
                    // 마커 위치 계산 (0% ~ 99% 범위)
                    const position = Math.max(0, Math.min((range.startTime / duration) * 100, 99));

                    return (
                      <div
                        key={index}
                        className="absolute bottom-0 flex flex-col items-center"
                        style={{ left: `${position}%` }}
                      >
                        <div
                          className="rounded px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap"
                          style={{
                            backgroundColor: range.color,
                            color: '#FFFFFF',
                            boxShadow: `0 0 4px ${range.color}80`,
                          }}
                        >
                          {range.label}
                        </div>
                        <div
                          className="w-0.5 h-2"
                          style={{ backgroundColor: range.color }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              <SliderPrimitive.Root
                value={[currentTime]}
                max={duration}
                step={1}
                onValueChange={handleSliderChange}
                className="relative flex w-full select-none items-center touch-none"
              >
                <SliderPrimitive.Track className="relative h-3 w-full grow overflow-hidden rounded-full bg-[#FFFFFF]/10">
                  <SliderPrimitive.Range
                    className="absolute h-full transition-colors duration-300"
                    style={{ backgroundColor: currentPerformerColor }}
                  />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb
                  className="block size-4 shrink-0 rounded-full shadow-sm transition-all duration-300 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
                  style={{
                    backgroundColor: currentPerformerColor,
                    border: `2px solid ${currentPerformerColor}`,
                    boxShadow: `0 0 8px ${currentPerformerColor}80`,
                  }}
                />
              </SliderPrimitive.Root>
            </div>

            <div className="flex justify-between text-[10px] text-[#9B9B9B]">
              <span>{formatTime(currentTime)}</span>
              {song && song.structure_data && (
                <span className="text-sm text-[#7BA7FF]">
                  마디 {currentMeasure} / {song.structure_data.totalMeasures || song.structure_data.feedTotalMeasures || '?'}
                </span>
              )}
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        <div className="absolute right-5 top-1/2 -translate-y-1/2">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 px-2.5 py-2">
              <button
                type="button"
                onClick={onPrevJam}
                disabled={!onPrevJam}
                className={`flex h-6 w-6 items-center justify-center rounded-full border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 text-[#E0E0E0] transition-all duration-150 hover:bg-[#FFFFFF]/10 disabled:cursor-not-allowed disabled:opacity-40 ${
                  pressedKey === 'left' ? 'scale-90 bg-[#7BA7FF]/30 border-[#7BA7FF]' : ''
                }`}
                title="이전 JAM (←)"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <span className="text-xs font-semibold uppercase tracking-wide text-[#7BA7FF]">JAM</span>

              <button
                type="button"
                onClick={onNextJam}
                disabled={!onNextJam}
                className={`flex h-6 w-6 items-center justify-center rounded-full border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 text-[#E0E0E0] transition-all duration-150 hover:bg-[#FFFFFF]/10 disabled:cursor-not-allowed disabled:opacity-40 ${
                  pressedKey === 'right' ? 'scale-90 bg-[#7BA7FF]/30 border-[#7BA7FF]' : ''
                }`}
                title="다음 JAM (→)"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSeekByMeasures(-1)}
                className={`relative flex h-8 w-8 items-center justify-center rounded-full bg-[#FFFFFF]/5 text-[#9B9B9B] transition-all duration-150 hover:bg-[#FFFFFF]/10 ${
                  pressedKey === 'z' ? 'scale-90 bg-[#7BA7FF]/30 text-[#7BA7FF]' : ''
                }`}
                title="이전 마디 (Z)"
              >
                <RotateCcw className="h-3 w-3" />
                <span className="absolute mt-6 text-[7px] font-semibold text-[#9B9B9B]">Z</span>
              </button>

              <button
                type="button"
                onClick={onPlayPause}
                className={`flex h-11 w-11 items-center justify-center rounded-full bg-[#7BA7FF] text-white shadow-lg shadow-[#7BA7FF]/30 transition-all duration-150 hover:bg-[#6A96EE] ${
                  pressedKey === 'space' ? 'scale-90 brightness-75' : ''
                }`}
                title={isPlaying ? "일시정지 (Space)" : "재생 (Space)"}
              >
                {isPlaying ? <Pause className="h-4.5 w-4.5" /> : <Play className="h-4.5 w-4.5 ml-0.5" />}
              </button>

              <button
                type="button"
                onClick={() => handleSeekByMeasures(1)}
                className={`relative flex h-8 w-8 items-center justify-center rounded-full bg-[#FFFFFF]/5 text-[#9B9B9B] transition-all duration-150 hover:bg-[#FFFFFF]/10 ${
                  pressedKey === 'x' ? 'scale-90 bg-[#7BA7FF]/30 text-[#7BA7FF]' : ''
                }`}
                title="다음 마디 (X)"
              >
                <RotateCw className="h-3 w-3" />
                <span className="absolute mt-6 text-[7px] font-semibold text-[#9B9B9B]">X</span>
              </button>
            </div>
          </div>
        </div>
        <div className="absolute bottom-2 right-5 text-[10px] text-[#9B9B9B] flex gap-4">
          <span>Z: -1 마디</span>
          <span>X: +1 마디</span>
        </div>
      </div>
    </div>
  );
}

