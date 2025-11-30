'use client';

import { Play, Pause, RotateCcw, RotateCw, ChevronLeft, ChevronRight } from "lucide-react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { useMemo } from 'react';

interface Performer {
  name: string;
  color: string;
  playRange: [number, number];
}

interface FeedPlayerBarProps {
  currentTime: number;
  duration: number;
  performers: Performer[];
  onTimeChange: (time: number) => void;
  jamOnlyMode: boolean;
  feedIntroEndTime: number;
  feedOutroStartTime: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeekByMeasure: (offset: number) => void;
  onNextJam: () => void;
  onPrevJam: () => void;
  onToggleJamOnly: (value: boolean) => void;
  pressedKey?: string | null;
}

// 색상 상수
const BLUE_COLOR = '#7BA7FF';

export default function FeedPlayerBar({
  currentTime,
  duration,
  performers,
  onTimeChange,
  jamOnlyMode,
  feedIntroEndTime,
  feedOutroStartTime,
  isPlaying,
  onPlayPause,
  onSeekByMeasure,
  onNextJam,
  onPrevJam,
  onToggleJamOnly,
  pressedKey = null,
}: FeedPlayerBarProps) {
  // 연주자별 시간 구간
  const performerTimeRanges = useMemo(() => {
    if (performers.length === 0) return [];
    const sectionLabels = ['Intro', 'A', 'B', 'C', 'D', 'Outro'];
    return performers.map((p, idx) => ({
      name: p.name,
      color: p.color,
      label: sectionLabels[idx] || p.name.charAt(0),
      startTime: p.playRange[0],
      endTime: p.playRange[1],
    }));
  }, [performers]);

  // 현재 위치의 색상 계산
  const currentColor = useMemo(() => {
    for (const range of performerTimeRanges) {
      if (currentTime >= range.startTime && currentTime < range.endTime) {
        return range.color;
      }
    }
    return BLUE_COLOR;
  }, [currentTime, performerTimeRanges]);

  // 슬라이더 값 변경 핸들러
  const handleSliderChange = (value: number[]) => {
    let newTime = value[0];

    // JAM만 듣기 모드일 때 범위 보정
    if (jamOnlyMode && feedIntroEndTime > 0 && feedOutroStartTime > 0) {
      if (newTime < feedIntroEndTime) {
        newTime = feedIntroEndTime;
      } else if (newTime >= feedOutroStartTime) {
        newTime = feedOutroStartTime - 0.1;
      }
    }

    onTimeChange(newTime);
  };

  return (
    <div className="w-full space-y-4">
      {/* 재생바 영역 */}
      <div className="relative pt-6">
        {/* 책갈피 마커 */}
        {performerTimeRanges.length > 0 && duration > 0 && (
          <div className="absolute top-0 left-0 right-0 h-5 pointer-events-none">
            {performerTimeRanges.map((range, index) => {
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

        {/* 슬라이더 */}
        <SliderPrimitive.Root
          value={[currentTime]}
          max={duration}
          step={0.1}
          onValueChange={handleSliderChange}
          className="relative flex w-full select-none items-center touch-none"
        >
          <SliderPrimitive.Track className="relative h-3 w-full grow overflow-hidden rounded-full bg-[#FFFFFF]/10">
            <SliderPrimitive.Range
              className="absolute h-full transition-colors duration-300"
              style={{ backgroundColor: currentColor }}
            />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            className="block size-4 shrink-0 rounded-full shadow-sm transition-all duration-300 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
            style={{
              backgroundColor: currentColor,
              border: `2px solid ${currentColor}`,
              boxShadow: `0 0 8px ${currentColor}80`,
            }}
          />
        </SliderPrimitive.Root>
      </div>

      {/* 컨트롤러 영역 */}
      <div className="flex items-center justify-between gap-4">
        {/* 좌측: 빈 공간 또는 추가 컨트롤 */}
        <div className="min-w-[180px]" />

        {/* 중앙: 재생 컨트롤 */}
        <div className="flex items-center gap-3">
          {/* 되감기 버튼 */}
          <button
            type="button"
            onClick={() => onSeekByMeasure(-1)}
            className={`relative flex h-9 w-9 items-center justify-center rounded-full bg-[#FFFFFF]/5 text-[#9B9B9B] transition-all duration-150 hover:bg-[#FFFFFF]/10 ${
              pressedKey === 'z' ? 'scale-90 bg-[#7BA7FF]/30 text-[#7BA7FF]' : ''
            }`}
            title="이전 마디 (Z)"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="absolute -bottom-4 text-[8px] font-medium text-[#9B9B9B]">Z</span>
          </button>

          {/* 재생/정지 버튼 */}
          <button
            type="button"
            onClick={onPlayPause}
            className={`flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-all duration-200 ${
              pressedKey === 'space' ? 'scale-95' : ''
            }`}
            style={{
              backgroundColor: BLUE_COLOR,
              boxShadow: `0 4px 14px ${BLUE_COLOR}40`,
            }}
            title={isPlaying ? "일시정지 (Space)" : "재생 (Space)"}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
          </button>

          {/* 앞으로 버튼 */}
          <button
            type="button"
            onClick={() => onSeekByMeasure(1)}
            className={`relative flex h-9 w-9 items-center justify-center rounded-full bg-[#FFFFFF]/5 text-[#9B9B9B] transition-all duration-150 hover:bg-[#FFFFFF]/10 ${
              pressedKey === 'x' ? 'scale-90 bg-[#7BA7FF]/30 text-[#7BA7FF]' : ''
            }`}
            title="다음 마디 (X)"
          >
            <RotateCw className="h-4 w-4" />
            <span className="absolute -bottom-4 text-[8px] font-medium text-[#9B9B9B]">X</span>
          </button>
        </div>

        {/* 우측: JAM 옵션 */}
        <div className="flex items-center gap-4 min-w-[180px] justify-end">
          {/* JAM만 듣기 체크박스 */}
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={jamOnlyMode}
              onChange={(e) => onToggleJamOnly(e.target.checked)}
              className="h-4 w-4 appearance-none rounded border-2 border-[#9B9B9B]/60 bg-transparent checked:border-[#7BA7FF] checked:bg-[#7BA7FF] flex items-center justify-center after:hidden checked:after:block after:content-['✓'] after:text-[10px] after:text-white transition-all"
            />
            <span className="text-xs text-[#9B9B9B] group-hover:text-[#E0E0E0] transition-colors whitespace-nowrap">
              JAM만 듣기 (S)
            </span>
          </label>

          {/* JAM 네비게이션 */}
          <div className="flex items-center gap-2 rounded-lg border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 px-2.5 py-2">
            <button
              type="button"
              onClick={onPrevJam}
              className={`flex h-6 w-6 items-center justify-center rounded-full border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 text-[#E0E0E0] transition-all duration-150 hover:bg-[#FFFFFF]/10 ${
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
              className={`flex h-6 w-6 items-center justify-center rounded-full border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 text-[#E0E0E0] transition-all duration-150 hover:bg-[#FFFFFF]/10 ${
                pressedKey === 'right' ? 'scale-90 bg-[#7BA7FF]/30 border-[#7BA7FF]' : ''
              }`}
              title="다음 JAM (→)"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
