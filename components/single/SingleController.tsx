'use client';

import { Play, Pause, RotateCcw, RotateCw, ChevronDown } from "lucide-react";
import { useState, useRef } from 'react';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { InputInstrument, OutputInstrument } from '@/types/instrument';

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
  onFinish: () => void;
  currentTime: number;
  duration: number;
  pressedKey: string | null;
  isFinishing?: boolean;
  hasRecording?: boolean;
  inputInstrument: InputInstrument;
  onInputInstrumentChange: (value: InputInstrument) => void;
  outputInstrument: OutputInstrument;
  onOutputInstrumentChange: (value: OutputInstrument) => void;
}

const JAMUS_BLUE = '#7BA7FF';
const CORAL_COLOR = '#FF7B7B';

const INPUT_OPTIONS = [
  { value: 'voice', label: '🎤 목소리' },
  { value: 'piano', label: '🎹 피아노' },
  { value: 'guitar', label: '🎸 기타' },
];

const OUTPUT_OPTIONS = [
  { value: 'raw', label: '🎤 녹음 원본' },
  { value: 'piano', label: '🎹 피아노' },
  { value: 'guitar', label: '🎸 기타' },
];



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
  onFinish,
  pressedKey = null,
  isFinishing = false,
  hasRecording = false,
  inputInstrument,
  onInputInstrumentChange,
  outputInstrument,
  onOutputInstrumentChange,
}: SingleControllerProps) {
  const [isInputDropdownOpen, setIsInputDropdownOpen] = useState(false);
  const [isOutputDropdownOpen, setIsOutputDropdownOpen] = useState(false);

  // ref를 전체 드롭다운 컨테이너에 연결 (버튼 + 메뉴 포함)
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const outputContainerRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(inputContainerRef, () => setIsInputDropdownOpen(false));
  useOnClickOutside(outputContainerRef, () => setIsOutputDropdownOpen(false));


  const jamButtonBg = isJamming ? CORAL_COLOR : JAMUS_BLUE;
  const jamButtonShadow = isJamming ? `0 4px 14px ${CORAL_COLOR}30` : `0 4px 14px ${JAMUS_BLUE}30`;
  const pillClasses = isJamming 
    ? 'text-white' 
    : 'bg-white text-[#1B1C26] group-hover:bg-gray-100';

  const buttonFeedbackStyle = "transition-all duration-150 active:scale-95 active:brightness-110";
  // Reusable style for shortcut labels
  const shortcutLabelStyle = "absolute -bottom-5 text-[10px] font-medium text-gray-400";


  return (
    <div className="flex items-center justify-between gap-4">
      {/* 좌측: Input/Output */}
      <div className="flex items-center gap-3">
        {/* Input Dropdown */}
        <div ref={inputContainerRef} className="flex flex-col gap-1 relative">
          <span className="text-[10px] text-white font-medium uppercase tracking-wide">Input</span>
          <button
            onClick={() => setIsInputDropdownOpen(!isInputDropdownOpen)}
            className={`relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 ${buttonFeedbackStyle}`}
          >
            <span className="text-sm">{INPUT_OPTIONS.find(opt => opt.value === inputInstrument)?.label.split(' ')[0]}</span>
            <span className="text-xs text-[#E0E0E0] truncate">{INPUT_OPTIONS.find(opt => opt.value === inputInstrument)?.label.split(' ')[1]}</span>
            <ChevronDown className="w-3 h-3 text-[#9B9B9B] ml-auto" />
          </button>
          {isInputDropdownOpen && (
            <div className="absolute z-50 bottom-full left-0 mb-2 w-40 bg-[#1B1C26] rounded-lg shadow-lg border border-white/10">
              {INPUT_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => {
                    onInputInstrumentChange(option.value as InputInstrument);
                    setIsInputDropdownOpen(false);
                  }}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-white/10 ${
                    inputInstrument === option.value ? 'text-[#7BA7FF] bg-white/5' : 'text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-10 bg-white/10" />

        {/* Output Dropdown */}
        <div ref={outputContainerRef} className="flex flex-col gap-1 relative">
          <span className="text-[10px] text-white font-medium uppercase tracking-wide">Output</span>
          <button
            onClick={() => setIsOutputDropdownOpen(!isOutputDropdownOpen)}
            className={`relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 ${buttonFeedbackStyle}`}
          >
            <span className="text-sm">{OUTPUT_OPTIONS.find(opt => opt.value === outputInstrument)?.label.split(' ')[0]}</span>
            <span className="text-xs text-[#E0E0E0] truncate">{OUTPUT_OPTIONS.find(opt => opt.value === outputInstrument)?.label.split(' ')[1]}</span>
            <ChevronDown className="w-3 h-3 text-[#9B9B9B] ml-auto" />
          </button>
          {isOutputDropdownOpen && (
            <div className="absolute z-50 bottom-full left-0 mb-2 w-40 bg-[#1B1C26] rounded-lg shadow-lg border border-white/10">
              {OUTPUT_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => {
                    onOutputInstrumentChange(option.value as OutputInstrument);
                    setIsOutputDropdownOpen(false);
                  }}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-left text-sm hover:bg-white/10 ${
                    outputInstrument === option.value ? 'text-[#7BA7FF] bg-white/5' : 'text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 중앙: 재생 컨트롤 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSeekBackward}
          className={`relative flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-gray-400 hover:bg-white/10 ${buttonFeedbackStyle} ${pressedKey === 'KeyZ' ? 'ring-2 ring-white/50 scale-95 brightness-110' : ''}`}
          title="이전 마디 (Z)"
        >
          <RotateCcw className="h-4 w-4" />
          <span className={shortcutLabelStyle}>Z</span>
        </button>

        {/* --- START: START JAM 버튼 (클릭 영역 분리) --- */}
        <div
          className={`group relative flex items-center transition-all duration-200 cursor-pointer ${buttonFeedbackStyle} ${pressedKey === 'Space' || pressedKey === 'KeyR' ? 'ring-2 ring-white/50 scale-95 brightness-110' : ''}`}
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
              className="relative flex h-full items-center justify-center pl-1.5 pr-2"
            >
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg transition-all duration-200"
                style={{ backgroundColor: jamButtonBg, boxShadow: `0 4px 14px ${jamButtonBg}40` }}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
              </div>
              <span className={`left-1/2 -translate-x-1/2 ${shortcutLabelStyle}`}>Space</span>
            </div>
            
            {/* 오른쪽 클릭 영역 (텍스트) */}
            <div
              data-testid="jam-toggle-area"
              onClick={onToggleJam}
              className="relative flex h-full items-center justify-center pr-5 pl-2 whitespace-nowrap"
            >
              {isJamming ? 'STOP JAM' : 'START JAM'}
              <span className={`left-1/2 -translate-x-1/2 ${shortcutLabelStyle}`}>R</span>
            </div>
          </div>
        </div>
        {/* --- END: START JAM 버튼 --- */}

        <button
          type="button"
          onClick={onSeekForward}
          className={`relative flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-gray-400 hover:bg-white/10 ${buttonFeedbackStyle} ${pressedKey === 'KeyX' ? 'ring-2 ring-white/50 scale-95 brightness-110' : ''}`}
          title="다음 마디 (X)"
        >
          <RotateCw className="h-4 w-4" />
          <span className={shortcutLabelStyle}>X</span>
        </button>
      </div>

      {/* 우측: 옵션 */}
      <div className="flex items-center gap-2 min-w-[340px] justify-end">
        <button
            onClick={() => onToggleMetronome(!metronomeOn)}
            className={`relative px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${buttonFeedbackStyle} ${metronomeOn ? 'bg-[#FFD166] text-black ring-2 ring-yellow-200' : 'bg-white/10 text-gray-300 hover:bg-white/20'} ${pressedKey === 'KeyD' ? 'scale-95 brightness-110' : ''}`}
        >
            ♪ 메트로놈
            <span className={`left-1/2 -translate-x-1/2 ${shortcutLabelStyle}`}>D</span>
        </button>
        <button
            onClick={() => onToggleJamOnly(!jamOnlyMode)}
            className={`relative px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${buttonFeedbackStyle} ${jamOnlyMode ? 'bg-[#7BA7FF] text-black ring-2 ring-blue-200' : 'bg-white/10 text-gray-300 hover:bg-white/20'} ${pressedKey === 'KeyF' ? 'scale-95 brightness-110' : ''}`}
        >
            JAM만 듣기
            <span className={`left-1/2 -translate-x-1/2 ${shortcutLabelStyle}`}>F</span>
        </button>
        <button
          type="button"
          onClick={onFinish}
          disabled={isFinishing || !hasRecording}
          className={`px-3 py-1.5 rounded-lg border-2 text-sm font-medium whitespace-nowrap ${buttonFeedbackStyle} ${hasRecording && !isFinishing ? 'hover:bg-[#7BA7FF]/10 cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
          style={{ borderColor: JAMUS_BLUE, color: JAMUS_BLUE }}
          title={hasRecording ? '종료하고 피드백 보기' : '녹음이 없습니다'}
        >
          {isFinishing ? '이동 중...' : '종료(Feedback)'}
        </button>
      </div>
    </div>
  );
}
