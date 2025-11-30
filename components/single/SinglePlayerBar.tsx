'use client';

import * as SliderPrimitive from "@radix-ui/react-slider";
import { useMemo } from 'react';

interface Section {
  id: string;
  label: string;
  startTime: number;
  endTime: number;
  isJamSection?: boolean;
}

interface SinglePlayerBarProps {
  currentTime: number;
  duration: number;
  sections: Section[];
  onTimeChange: (time: number) => void;
}

// 색상 상수
const BLUE_COLOR = '#7BA7FF';
const CORAL_COLOR = '#FF7B7B';

export default function SinglePlayerBar({
  currentTime,
  duration,
  sections,
  onTimeChange,
}: SinglePlayerBarProps) {
  // 현재 위치의 섹션 색상 계산
  const currentColor = useMemo(() => {
    for (const section of sections) {
      if (currentTime >= section.startTime && currentTime < section.endTime) {
        return section.isJamSection ? CORAL_COLOR : BLUE_COLOR;
      }
    }
    return BLUE_COLOR;
  }, [currentTime, sections]);

  // 슬라이더 값 변경 핸들러
  const handleSliderChange = (value: number[]) => {
    onTimeChange(value[0]);
  };

  return (
    <div className="w-full">
      <div className="relative pt-6">
        {/* 책갈피 마커 (FEED 스타일) */}
        {sections.length > 0 && duration > 0 && (
          <div className="absolute top-0 left-0 right-0 h-5 pointer-events-none">
            {sections.map((section, index) => {
              const position = Math.max(0, Math.min((section.startTime / duration) * 100, 99));
              const color = section.isJamSection ? CORAL_COLOR : BLUE_COLOR;

              return (
                <div
                  key={index}
                  className="absolute bottom-0 flex flex-col items-center"
                  style={{ left: `${position}%` }}
                >
                  <div
                    className="rounded px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap"
                    style={{
                      backgroundColor: color,
                      color: '#FFFFFF',
                      boxShadow: `0 0 4px ${color}80`,
                    }}
                  >
                    {section.label}
                  </div>
                  <div
                    className="w-0.5 h-2"
                    style={{ backgroundColor: color }}
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
    </div>
  );
}
