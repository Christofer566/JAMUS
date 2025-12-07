'use client';

import { Play, Pause, RotateCcw, RotateCw, ChevronDown, Save } from "lucide-react";

// Props가 spec에 따라 변경됨
interface SingleControllerProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onToggleJam: () => void;
  isJamming: boolean;
  onSeekBackward: () => void;
  onSeekForward: () => void;
  jamOnlyMode: boolean;
  onToggleJamOnly: (enabled: boolean) => void;
  metronomeOn: boolean;
  onToggleMetronome: (enabled: boolean) => void | Promise<void>;
  onSave: () => void;
  currentTime: number;
  duration: number;
  pressedKey: string | null;
  isSaving?: boolean;
  hasRecording?: boolean;
}

const JAMUS_BLUE = '#7BA7FF';
const CORAL_COLOR = '#FF7B7B';

export default function SingleController({
  isPlaying,
  onPlayPause,
  onToggleJam,
  isJamming,
  onSeekBackward,
  onSeekForward,
  jamOnlyMode,
  onToggleJamOnly,
  metronomeOn,
  onToggleMetronome,
  onSave,
  pressedKey = null,
  isSaving = false,
  hasRecording = false,
}: SingleControllerProps) {

  // isJamming 상태에 따른 스타일 동적 변경
  const jamButtonBg = isJamming ? CORAL_COLOR : JAMUS_BLUE;
  const jamButtonShadow = isJamming ? `0 4px 14px ${CORAL_COLOR}30` : `0 4px 14px ${JAMUS_BLUE}30`;
  const pillClasses = isJamming 
    ? 'text-white' 
    : 'bg-white text-[#1B1C26] group-hover:bg-gray-100';

  return (
    <div className="flex items-center justify-between gap-4">
      {/* 좌측: Input/Output (변경 없음) */}
      <div className="flex items-center gap-4 min-w-[280px]">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-white font-medium uppercase tracking-wide">Input</span>
          <button className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 hover:bg-[#FFFFFF]/10 transition-colors">
            <span className="text-sm">🎹</span>
            <span className="text-xs text-[#E0E0E0] truncate">Grand Piano</span>
            <ChevronDown className="w-3 h-3 text-[#9B9B9B] ml-auto" />
          </button>
        </div>
        <div className="w-px h-10 bg-[#FFFFFF]/10" />
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-white font-medium uppercase tracking-wide">Output</span>
          <button className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 hover:bg-[#FFFFFF]/10 transition-colors">
            <span className="text-sm">🔊</span>
            <span className="text-xs text-[#E0E0E0] truncate">Default Output</span>
            <ChevronDown className="w-3 h-3 text-[#9B9B9B] ml-auto" />
          </button>
        </div>
      </div>

      {/* 중앙: 재생 컨트롤 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSeekBackward}
          className={`relative flex h-9 w-9 items-center justify-center rounded-full bg-[#FFFFFF]/5 text-[#9B9B9B] transition-all duration-150 hover:bg-[#FFFFFF]/10 ${pressedKey === 'z' ? 'scale-90 bg-[#7BA7FF]/30 text-[#7BA7FF]' : ''}`}
          title="이전 마디 (Z)"
        >
          <RotateCcw className="h-4 w-4" />
          <span className="absolute -bottom-4 text-[8px] font-medium text-[#9B9B9B]">Z</span>
        </button>

        {/* --- START: START JAM 버튼 (클릭 영역 분리) --- */}
        <div
          className={`group flex items-center transition-all duration-200 cursor-pointer ${pressedKey === 'space' ? 'scale-95' : ''}`}
          title={isJamming ? "정지 (Space)" : "재생 및 JAM 시작 (Space)"}
        >
          <div
            className={`flex items-center h-14 rounded-full text-sm font-semibold transition-all duration-200 ${pillClasses} ${isJamming ? 'animate-pulse' : ''}`}
            style={isJamming ? { backgroundColor: jamButtonBg, boxShadow: jamButtonShadow } : {}}
          >
            {/* 왼쪽 클릭 영역 (아이콘) */}
            <div
              data-testid="jam-play-area"
              onClick={onPlayPause}
              className="flex h-full items-center justify-center pl-1.5 pr-2"
            >
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg transition-all duration-200"
                style={{ backgroundColor: jamButtonBg, boxShadow: `0 4px 14px ${jamButtonBg}40` }}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
              </div>
            </div>
            
            {/* 오른쪽 클릭 영역 (텍스트) */}
            <div
              data-testid="jam-toggle-area"
              onClick={onToggleJam}
              className="flex h-full items-center justify-center pr-5 pl-2"
            >
              {isJamming ? 'STOP JAM' : 'START JAM'}
            </div>
          </div>
        </div>
        {/* --- END: START JAM 버튼 --- */}

        <button
          type="button"
          onClick={onSeekForward}
          className={`relative flex h-9 w-9 items-center justify-center rounded-full bg-[#FFFFFF]/5 text-[#9B9B9B] transition-all duration-150 hover:bg-[#FFFFFF]/10 ${pressedKey === 'x' ? 'scale-90 bg-[#7BA7FF]/30 text-[#7BA7FF]' : ''}`}
          title="다음 마디 (X)"
        >
          <RotateCw className="h-4 w-4" />
          <span className="absolute -bottom-4 text-[8px] font-medium text-[#9B9B9B]">X</span>
        </button>
      </div>

      {/* 우측: 옵션 (변경 없음) */}
      <div className="flex items-center gap-2 min-w-[280px] justify-end">
        <button
            onClick={() => onToggleMetronome(!metronomeOn)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${metronomeOn ? 'bg-[#FFD166] text-black' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
        >
            ♪ 메트로놈
        </button>
        <button
            onClick={() => onToggleJamOnly(!jamOnlyMode)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${jamOnlyMode ? 'bg-[#7BA7FF] text-black' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
        >
            JAM만 듣기
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving || !hasRecording}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 transition-all ${
            hasRecording && !isSaving
              ? 'hover:bg-[#7BA7FF]/10 cursor-pointer'
              : 'opacity-50 cursor-not-allowed'
          }`}
          style={{ borderColor: JAMUS_BLUE, color: JAMUS_BLUE }}
          title={hasRecording ? '저장' : '녹음이 없습니다'}
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-[#7BA7FF] border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span className="text-xs font-medium">{isSaving ? 'Saving...' : 'Save'}</span>
        </button>
      </div>
    </div>
  );
}