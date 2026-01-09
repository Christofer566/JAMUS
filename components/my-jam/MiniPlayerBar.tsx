'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { Play, Pause, X } from 'lucide-react';
import * as SliderPrimitive from "@radix-ui/react-slider";
import { usePlayerStore } from '@/stores/playerStore';
import { useToast } from '@/contexts/ToastContext';

export default function MiniPlayerBar() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const backingAudioRef = useRef<HTMLAudioElement | null>(null); // M-05: backing track
  const { showToast } = useToast();

  const {
    currentJam,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    setIsPlaying,
    updateTime,
    setDuration,
    closePlayer,
  } = usePlayerStore();

  // M-06: 스페이스바 단축키 처리
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // 입력 필드에서는 무시
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    if (e.code === 'Space' && currentJam) {
      e.preventDefault(); // 스크롤 방지
      togglePlay();
    }
  }, [currentJam, togglePlay]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Audio element setup and control (녹음본)
  // M-05 Fix: 새 JAM 로드 시 currentTime 리셋
  useEffect(() => {
    if (!currentJam?.audioUrl) return;

    const audio = audioRef.current;
    if (!audio) return;

    // Load new audio when currentJam changes
    if (audio.src !== currentJam.audioUrl) {
      audio.pause(); // 먼저 정지
      audio.src = currentJam.audioUrl;
      audio.currentTime = 0; // 처음부터 시작
      audio.load();
    }
  }, [currentJam?.audioUrl]);

  // M-05: Backing track 오디오 로드 (새 JAM 시 처음부터 시작)
  useEffect(() => {
    if (!currentJam?.backingTrackUrl) return;

    const backingAudio = backingAudioRef.current;
    if (!backingAudio) return;

    // 항상 새로 로드 (같은 곡이라도 JAM이 바뀌면 처음부터)
    backingAudio.pause(); // 먼저 정지
    backingAudio.src = currentJam.backingTrackUrl;
    backingAudio.currentTime = 0; // 처음부터 시작
    backingAudio.load();
  }, [currentJam?.id, currentJam?.backingTrackUrl]); // JAM ID 변경 시에도 리셋

  // Play/Pause control (녹음본 + backing track 동시 제어)
  // M-47 Fix: play() 인터럽트 에러 방지
  useEffect(() => {
    const audio = audioRef.current;
    const backingAudio = backingAudioRef.current;
    if (!audio || !currentJam) return;

    const playAudio = async () => {
      try {
        await audio.play();
        // M-05: backing track 동시 재생
        if (backingAudio && currentJam.backingTrackUrl) {
          await backingAudio.play().catch(() => {
            // backing track 에러는 무시 (녹음본만이라도 재생)
          });
        }
      } catch (err: any) {
        // AbortError는 무시 (play가 pause에 의해 중단된 경우)
        if (err.name !== 'AbortError') {
          console.error('[MiniPlayer] 재생 오류:', err);
          showToast('error', '오디오 재생에 실패했습니다');
          setIsPlaying(false);
        }
      }
    };

    if (isPlaying) {
      playAudio();
    } else {
      audio.pause();
      // M-05: backing track 동시 일시정지
      if (backingAudio) {
        backingAudio.pause();
      }
    }
  }, [isPlaying, currentJam, setIsPlaying, showToast]);

  // Audio event handlers
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      updateTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    updateTime(0);
    // M-05: backing track도 정지
    if (backingAudioRef.current) {
      backingAudioRef.current.pause();
      backingAudioRef.current.currentTime = 0;
    }
  };

  const handleError = () => {
    console.error('[MiniPlayer] 오디오 로딩 실패');
    showToast('error', '오디오를 불러올 수 없습니다');
    closePlayer();
  };

  // Seek control (녹음본 + backing track 동기화)
  const handleSliderChange = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      updateTime(value[0]);
    }
    // M-05: backing track도 동기화
    if (backingAudioRef.current) {
      backingAudioRef.current.currentTime = value[0];
    }
  };

  // Close player
  const handleClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    // M-05: backing track도 정리
    if (backingAudioRef.current) {
      backingAudioRef.current.pause();
      backingAudioRef.current.src = '';
    }
    closePlayer();
  };

  // Don't render if no JAM is playing
  if (!currentJam) return null;

  return (
    <>
      {/* Hidden Audio Element - 녹음본 */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={handleError}
        preload="metadata"
      />
      {/* M-05: Hidden Audio Element - Backing Track */}
      <audio
        ref={backingAudioRef}
        preload="metadata"
      />

      {/* Player UI */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#14151C] border-t border-white/10 px-4 py-3 pb-6 sm:pb-3 shadow-2xl animate-slide-up">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          {/* Thumbnail & Info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-800 shrink-0">
              {currentJam.coverUrl ? (
                <img
                  src={currentJam.coverUrl}
                  alt={currentJam.songTitle}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                  JAM
                </div>
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <h3 className="text-sm font-medium text-white truncate">
                {currentJam.name || 'Untitled JAM'}
              </h3>
              <p className="text-xs text-[#9B9B9B] truncate">
                {currentJam.songTitle} - {currentJam.songArtist}
              </p>
            </div>
          </div>

          {/* Controls & Progress */}
          <div className="flex flex-col items-center flex-[2] max-w-xl">
            <div className="flex items-center gap-4 w-full">
              <button
                onClick={togglePlay}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#7BA7FF] hover:bg-[#6A96EE] text-white shrink-0 transition-colors"
              >
                {isPlaying ? (
                  <Pause size={16} fill="currentColor" />
                ) : (
                  <Play size={16} fill="currentColor" className="ml-0.5" />
                )}
              </button>

              <SliderPrimitive.Root
                value={[currentTime]}
                max={duration > 0 ? duration : 100}
                step={0.1}
                onValueChange={handleSliderChange}
                className="relative flex w-full select-none items-center touch-none h-4"
              >
                <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-white/10">
                  <SliderPrimitive.Range className="absolute h-full bg-[#7BA7FF]" />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb
                  className="block w-3 h-3 rounded-full bg-[#7BA7FF] shadow-xs focus:outline-hidden focus:ring-2 focus:ring-[#7BA7FF]/50 transition-transform hover:scale-125"
                />
              </SliderPrimitive.Root>

              <span className="text-xs text-[#9B9B9B] tabular-nums shrink-0 w-10 text-right">
                {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>

          {/* Close Button */}
          <div className="flex-1 flex justify-end">
            <button
              onClick={handleClose}
              className="p-2 text-[#9B9B9B] hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
