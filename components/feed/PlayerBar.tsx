'use client';

import { Play, Pause, RotateCcw, RotateCw, ChevronLeft, ChevronRight } from "lucide-react";
import * as SliderPrimitive from "@radix-ui/react-slider";

interface Section {
  id: string;
  label: string;
  color: string;
  startTime: number;
  duration: number;
}

interface PlayerBarProps {
  songTitle: string;
  artistName: string;
  isPlaying: boolean;
  onPlayPause: () => void;
  sections?: Section[];
  currentTime: number;
  duration: number;
  onTimeChange: (time: number) => void;
  className?: string;
  onNextJam?: () => void;
  onPrevJam?: () => void;
  jamOnlyMode?: boolean;
  onToggleJamOnly?: (value: boolean) => void;
}

export default function PlayerBar({
  songTitle,
  artistName,
  isPlaying,
  onPlayPause,
  sections = [],
  currentTime,
  duration,
  onTimeChange,
  className,
  onNextJam,
  onPrevJam,
  jamOnlyMode = false,
  onToggleJamOnly,
}: PlayerBarProps) {
  const getCurrentSectionColor = () => {
    for (const section of sections) {
      const sectionEndTime = section.startTime + section.duration;
      if (currentTime >= section.startTime && currentTime < sectionEndTime) {
        return section.color;
      }
    }
    return "#7BA7FF";
  };

  const currentSectionColor = getCurrentSectionColor();

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
            <div className="relative">
              {sections.length > 0 && (
                <div className="absolute -top-6 left-0 right-0 flex h-5 items-end">
                  {sections.map((section) => {
                    const position = (section.startTime / duration) * 100;
                    return (
                      <div key={section.id} className="absolute flex flex-col items-center" style={{ left: `${position}%` }}>
                        <div
                          className="rounded-t px-1.5 py-0.5 text-[9px] backdrop-blur-sm"
                          style={{
                            backgroundColor: `${section.color}40`,
                            color: section.color,
                            border: `1px solid ${section.color}60`,
                          }}
                        >
                          {section.label}
                        </div>
                        <div className="h-2 w-px" style={{ backgroundColor: `${section.color}80` }} />
                      </div>
                    );
                  })}
                </div>
              )}

              <SliderPrimitive.Root
                value={[currentTime]}
                max={duration}
                step={1}
                onValueChange={(value) => onTimeChange(value[0])}
                className="relative flex w-full select-none items-center touch-none"
              >
                <SliderPrimitive.Track className="relative h-3 w-full grow overflow-hidden rounded-full bg-[#FFFFFF]/10">
                  <SliderPrimitive.Range className="absolute h-full" style={{ backgroundColor: currentSectionColor }} />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb
                  className="block size-4 shrink-0 rounded-full shadow-sm transition-[color,box-shadow] focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
                  style={{
                    backgroundColor: currentSectionColor,
                    border: `2px solid ${currentSectionColor}`,
                  }}
                />
              </SliderPrimitive.Root>
            </div>

            <div className="flex justify-between text-[10px] text-[#9B9B9B]">
              <span>{formatTime(currentTime)}</span>
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
                className="flex h-6 w-6 items-center justify-center rounded-full border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 text-[#E0E0E0] transition-colors hover:bg-[#FFFFFF]/10 disabled:cursor-not-allowed disabled:opacity-40"
                title="이전 JAM (←)"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <span className="text-xs font-semibold uppercase tracking-wide text-[#7BA7FF]">JAM</span>

              <button
                type="button"
                onClick={onNextJam}
                disabled={!onNextJam}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 text-[#E0E0E0] transition-colors hover:bg-[#FFFFFF]/10 disabled:cursor-not-allowed disabled:opacity-40"
                title="다음 JAM (→)"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSkip(-10)}
                className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[#FFFFFF]/5 text-[#9B9B9B] transition-colors hover:bg-[#FFFFFF]/10"
                title="이전 마디 (Z)"
              >
                <RotateCcw className="h-3 w-3" />
                <span className="absolute mt-6 text-[7px] font-semibold text-[#9B9B9B]">Z</span>
              </button>

              <button
                type="button"
                onClick={onPlayPause}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#7BA7FF] text-white shadow-lg shadow-[#7BA7FF]/30 transition-colors hover:bg-[#6A96EE]"
                title={isPlaying ? "일시정지 (Space)" : "재생 (Space)"}
              >
                {isPlaying ? <Pause className="h-4.5 w-4.5" /> : <Play className="h-4.5 w-4.5 ml-0.5" />}
              </button>

              <button
                type="button"
                onClick={() => handleSkip(10)}
                className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[#FFFFFF]/5 text-[#9B9B9B] transition-colors hover:bg-[#FFFFFF]/10"
                title="다음 마디 (X)"
              >
                <RotateCw className="h-3 w-3" />
                <span className="absolute mt-6 text-[7px] font-semibold text-[#9B9B9B]">X</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

