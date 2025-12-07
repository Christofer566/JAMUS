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

interface RecordedRange {
  start: number;
  end: number;
}

interface SinglePlayerBarProps {
  currentTime: number;
  duration: number;
  sections: Section[];
  onTimeChange: (time: number) => void;
  recordedRanges?: RecordedRange[];
}

const BLUE_COLOR = '#7BA7FF';
const CORAL_COLOR = '#FF7B7B';

export default function SinglePlayerBar({
  currentTime,
  duration,
  sections,
  onTimeChange,
  recordedRanges = [],
}: SinglePlayerBarProps) {
  const currentColor = useMemo(() => {
    for (const section of sections) {
      if (currentTime >= section.startTime && currentTime < section.endTime) {
        return section.isJamSection ? CORAL_COLOR : BLUE_COLOR;
      }
    }
    return BLUE_COLOR;
  }, [currentTime, sections]);

  const handleSliderChange = (value: number[]) => {
    onTimeChange(value[0]);
  };

  // 복수 녹음 범위 스타일 계산
  const getRecordedRangeStyle = (range: RecordedRange) => {
    if (duration === 0) return { display: 'none' };

    const left = (range.start / duration) * 100;
    const width = ((range.end - range.start) / duration) * 100;

    return {
      left: `${left}%`,
      width: `${width}%`,
      pointerEvents: 'none' as const,
    };
  };

  return (
    <div className="w-full">
      <div className="relative pt-6">
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
                    className="rounded px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap text-white"
                    style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}80` }}
                  >
                    {section.label}
                  </div>
                  <div className="w-0.5 h-2" style={{ backgroundColor: color }} />
                </div>
              );
            })}
          </div>
        )}

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
            {/* --- START: 녹음 구간 표시 (복수 지원) --- */}
            {recordedRanges.map((range, index) => (
              <div
                key={`recorded-range-${index}`}
                data-testid="recorded-range-overlay"
                className="absolute h-full"
                style={{
                  ...getRecordedRangeStyle(range),
                  backgroundColor: 'rgba(255, 123, 123, 0.3)',
                }}
              />
            ))}
            {/* --- END: 녹음 구간 표시 --- */}
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            className="block size-4 shrink-0 rounded-full shadow-sm transition-all duration-300 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
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