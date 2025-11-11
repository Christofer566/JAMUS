'use client';

import { useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, RotateCw } from "lucide-react";
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
}: PlayerBarProps) {
  const controlsRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        onPlayPause();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onPlayPause]);

  const handleSkip = (seconds: number) => {
    const newTime = currentTime + seconds;
    if (newTime < 0) {
      onTimeChange(0);
    } else if (newTime > duration) {
      onTimeChange(duration);
    } else {
      onTimeChange(newTime);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div ref={controlsRef} className="mx-auto w-full max-w-4xl">
      <div className="rounded-2xl border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 p-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-2">
            <div className="relative">
              {sections.length > 0 && (
                <div className="absolute -top-6 left-0 right-0 flex h-5 items-end">
                  {sections.map((section) => {
                    const position = (section.startTime / duration) * 100;
                    return (
                      <div
                        key={section.id}
                        className="absolute flex flex-col items-center"
                        style={{ left: `${position}%` }}
                      >
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
                <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-[#FFFFFF]/10">
                  <SliderPrimitive.Range className="absolute h-full" style={{ backgroundColor: currentSectionColor }} />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb
                  className="block size-3.5 shrink-0 rounded-full shadow-sm transition-[color,box-shadow] focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
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

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSkip(-10)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFFFFF]/5 transition-colors hover:bg-[#FFFFFF]/10"
              title="10초 뒤로"
            >
              <RotateCcw className="h-3.5 w-3.5 text-[#9B9B9B]" />
            </button>

            <button
              onClick={onPlayPause}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7BA7FF] transition-colors shadow-lg shadow-[#7BA7FF]/30 hover:bg-[#6A96EE]"
              title={isPlaying ? "일시정지" : "재생"}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4 text-[#FFFFFF] fill-current" />
              ) : (
                <Play className="h-4 w-4 text-[#FFFFFF] fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={() => handleSkip(10)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFFFFF]/5 transition-colors hover:bg-[#FFFFFF]/10"
              title="10초 앞으로"
            >
              <RotateCw className="h-3.5 w-3.5 text-[#9B9B9B]" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-2 text-center text-[9px] text-[#9B9B9B]">
        <p>Swipe left/right for JAM • Swipe up/down for song • Space to play/pause</p>
      </div>
    </div>
  );
}

