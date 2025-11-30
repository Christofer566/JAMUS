'use client';

import { Play, Pause, RotateCcw, RotateCw, ChevronDown, Save } from "lucide-react";

interface SingleControllerProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeekBackward: () => void;
  onSeekForward: () => void;
  isJamming: boolean;
  onToggleJam: () => void;
  jamOnlyMode: boolean;
  onToggleJamOnly: (value: boolean) => void;
  metronomeOn: boolean;
  onToggleMetronome: (value: boolean) => void;
  onSave: () => void;
  currentTime: number;
  duration: number;
  pressedKey?: string | null;
}

// 색상 상수 (재생바 Intro 책갈피 색상과 동일)
const JAMUS_BLUE = '#7BA7FF';

export default function SingleController({
  isPlaying,
  onPlayPause,
  onSeekBackward,
  onSeekForward,
  isJamming,
  onToggleJam,
  jamOnlyMode,
  onToggleJamOnly,
  metronomeOn,
  onToggleMetronome,
  onSave,
  pressedKey = null,
}: SingleControllerProps) {
  // 통합 버튼 클릭 핸들러
  const handleIntegratedButtonClick = () => {
    if (!isPlaying) {
      // 재생 시작
      onPlayPause();
    }
    // JAM 토글
    onToggleJam();
  };

  return (
    <div className="flex items-center justify-between gap-4">
      {/* 좌측: Input/Output (가로 배치) */}
      <div className="flex items-center gap-4 min-w-[280px]">
        {/* INPUT */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-white font-medium uppercase tracking-wide">Input</span>
          <button className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[#FFFFFF]/10 bg-[#FFFFFF]/5 hover:bg-[#FFFFFF]/10 transition-colors">
            <span className="text-sm">🎹</span>
            <span className="text-xs text-[#E0E0E0] truncate">Grand Piano</span>
            <ChevronDown className="w-3 h-3 text-[#9B9B9B] ml-auto" />
          </button>
        </div>
        {/* 구분선 */}
        <div className="w-px h-10 bg-[#FFFFFF]/10" />
        {/* OUTPUT */}
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
        {/* 되감기 버튼 */}
        <button
          type="button"
          onClick={onSeekBackward}
          className={`relative flex h-9 w-9 items-center justify-center rounded-full bg-[#FFFFFF]/5 text-[#9B9B9B] transition-all duration-150 hover:bg-[#FFFFFF]/10 ${
            pressedKey === 'z' ? 'scale-90 bg-[#7BA7FF]/30 text-[#7BA7FF]' : ''
          }`}
          title="이전 마디 (Z)"
        >
          <RotateCcw className="h-4 w-4" />
          <span className="absolute -bottom-4 text-[8px] font-medium text-[#9B9B9B]">Z</span>
        </button>

        {/* 통합 버튼: START JAM이 재생버튼을 감싸는 구조 */}
        <button
          type="button"
          onClick={handleIntegratedButtonClick}
          className={`flex items-center transition-all duration-200 ${
            pressedKey === 'space' ? 'scale-95' : ''
          }`}
          title={isJamming ? "정지 (Space)" : "재생 및 JAM 시작 (Space)"}
        >
          {/* START JAM 버튼 (재생버튼을 감싸는 pill shape) */}
          <div
            className={`flex items-center h-14 pl-1.5 pr-5 rounded-full text-sm font-semibold transition-all duration-200 ${
              isJamming
                ? 'text-white'
                : 'bg-white text-[#1B1C26] hover:bg-gray-100'
            }`}
            style={isJamming ? {
              backgroundColor: JAMUS_BLUE,
              boxShadow: `0 4px 14px ${JAMUS_BLUE}30`,
            } : undefined}
          >
            {/* 내부: 원형 재생/정지 아이콘 */}
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg transition-all duration-200 mr-2"
              style={{
                backgroundColor: JAMUS_BLUE,
                boxShadow: `0 4px 14px ${JAMUS_BLUE}40`,
              }}
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
            </div>
            {isJamming ? 'STOP JAM' : 'START JAM'}
          </div>
        </button>

        {/* 앞으로 버튼 */}
        <button
          type="button"
          onClick={onSeekForward}
          className={`relative flex h-9 w-9 items-center justify-center rounded-full bg-[#FFFFFF]/5 text-[#9B9B9B] transition-all duration-150 hover:bg-[#FFFFFF]/10 ${
            pressedKey === 'x' ? 'scale-90 bg-[#7BA7FF]/30 text-[#7BA7FF]' : ''
          }`}
          title="다음 마디 (X)"
        >
          <RotateCw className="h-4 w-4" />
          <span className="absolute -bottom-4 text-[8px] font-medium text-[#9B9B9B]">X</span>
        </button>
      </div>

      {/* 우측: 옵션 */}
      <div className="flex items-center gap-4 min-w-[180px] justify-end">
        {/* JAM만 듣기 체크박스 */}
        <label className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={jamOnlyMode}
            onChange={(e) => onToggleJamOnly(e.target.checked)}
            className="h-4 w-4 appearance-none rounded border-2 border-[#FF7B7B]/60 bg-transparent checked:border-[#FF7B7B] checked:bg-[#FF7B7B] flex items-center justify-center after:hidden checked:after:block after:content-['✓'] after:text-[10px] after:text-white transition-all"
          />
          <span className="text-xs text-[#FF7B7B] group-hover:text-[#FF9B9B] transition-colors whitespace-nowrap">
            JAM만 듣기 (S)
          </span>
        </label>

        {/* Metronome 체크박스 */}
        <label className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={metronomeOn}
            onChange={(e) => onToggleMetronome(e.target.checked)}
            className="h-4 w-4 appearance-none rounded border-2 border-[#9B9B9B]/60 bg-transparent checked:border-[#7BA7FF] checked:bg-[#7BA7FF] flex items-center justify-center after:hidden checked:after:block after:content-['✓'] after:text-[10px] after:text-white transition-all"
          />
          <span className="text-xs text-[#9B9B9B] group-hover:text-[#E0E0E0] transition-colors">
            Metronome
          </span>
        </label>

        {/* Save 버튼 - 재생바 Intro 책갈피 색상과 동일 */}
        <button
          type="button"
          onClick={onSave}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 hover:bg-[#7BA7FF]/10 transition-all"
          style={{
            borderColor: JAMUS_BLUE,
            color: JAMUS_BLUE,
          }}
          title="저장"
        >
          <Save className="w-4 h-4" />
          <span className="text-xs font-medium">Save</span>
        </button>
      </div>
    </div>
  );
}
