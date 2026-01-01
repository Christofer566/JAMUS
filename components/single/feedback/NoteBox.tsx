// components/single/feedback/NoteBox.tsx
'use client';

import React, { useCallback, useRef } from 'react';
import { NoteData } from '@/types/note';

interface NoteBoxProps {
  note: NoteData;
  noteIndex: number;
  displayNumber: number;  // 음표 전용 번호 (1부터 시작)
  measureWidth: number;
  containerHeight: number;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDragStart: (noteIndex: number, dragType: 'resize' | 'move', e: React.MouseEvent) => void;
  onDragEnd: () => void;
}

// 음정 → Y 위치 변환 (VexFlow 오선보 기준)
const NOTE_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// VexFlow stave 설정과 일치: staveY = -5, height = 80
// 오선보 중심 (B4 기준)은 대략 staveY + 40 = 35px 근처
const STAVE_CENTER_Y = 35;
const PIXELS_PER_SEMITONE = 2.5; // VexFlow 음표 간격에 맞춤

function pitchToY(pitch: string, containerHeight: number): number {
  if (pitch === 'rest') return containerHeight / 2;

  const match = pitch.match(/^([A-G]#?)(\d)$/);
  if (!match) return containerHeight / 2;

  const noteName = match[1];
  const octave = parseInt(match[2]);
  const noteIdx = NOTE_ORDER.indexOf(noteName);

  // MIDI 기준 (B4 = 71, 오선보 가운데 선)
  const midiNote = (octave + 1) * 12 + noteIdx;
  const b4Midi = 71;

  // 높은 음 = 위쪽 (낮은 Y값)
  return STAVE_CENTER_Y - (midiNote - b4Midi) * PIXELS_PER_SEMITONE;
}

const NoteBox: React.FC<NoteBoxProps> = ({
  note,
  noteIndex,
  displayNumber,
  measureWidth,
  containerHeight,
  isSelected,
  onClick,
  onDragStart,
  onDragEnd
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const slotWidth = measureWidth / 16;

  // 쉼표는 렌더링하지 않음
  if (note.isRest) return null;

  // 위치 계산
  const left = note.slotIndex * slotWidth;
  const width = note.slotCount * slotWidth;
  const top = pitchToY(note.pitch, containerHeight);
  const height = 8; // 음표 박스 높이 (작게)

  // 색상 결정 (노란색 제거 - 모든 음표 동일 색상)
  const baseStyle = 'absolute rounded-[2px] transition-colors duration-100 cursor-pointer';
  const colorStyle = isSelected
    ? 'bg-[#7BA7FF]/50 border border-[#7BA7FF] shadow-md'
    : 'bg-white/40 border border-white/60';

  // 드래그 시작 처리
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    console.log('[NoteBox] mouseDown on note:', { noteIndex, pitch: note.pitch });
    e.stopPropagation();
    e.preventDefault(); // 드래그 시 텍스트 선택 및 화면 스크롤 방지

    // 먼저 음표 선택 (드래그 전에)
    onClick(e);

    const box = boxRef.current;
    if (!box) return;

    const rect = box.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const boxWidth = rect.width;

    // 오른쪽 끝 12px 영역 클릭 시 리사이즈, 그 외 이동
    // 최소 박스 너비가 작을 때는 비율로 계산
    const resizeZone = Math.max(12, boxWidth * 0.25);
    const isResizeArea = clickX > boxWidth - resizeZone;
    const dragType = isResizeArea ? 'resize' : 'move';

    console.log('[NoteBox] Starting drag:', { dragType, isResizeArea });
    onDragStart(noteIndex, dragType, e);
  }, [noteIndex, note.pitch, onDragStart, onClick]);

  return (
    <div
      ref={boxRef}
      data-notebox="true"
      className={`${baseStyle} ${colorStyle}`}
      style={{
        left: `${left}px`,
        top: `${top - height / 2}px`,
        width: `${width - 2}px`,
        height: `${height}px`,
        zIndex: isSelected ? 20 : 10
      }}
      onClick={onClick}
      onMouseDown={handleMouseDown}
      onMouseUp={onDragEnd}
    >
      {/* 리사이즈 핸들 */}
      <div
        className="absolute right-0 top-0 bottom-0 w-[6px] cursor-ew-resize group flex items-center justify-center"
        style={{ borderRadius: '0 2px 2px 0' }}
      >
        <div className="w-[1px] h-[60%] bg-white/30 group-hover:bg-white/70 rounded-full transition-colors" />
      </div>
      {/* 번호 표시 (선택 시에만 음정 표시) */}
      <span
        className="absolute left-0 text-[10px] font-mono whitespace-nowrap font-medium pointer-events-none"
        style={{
          top: '-14px',
          color: isSelected ? '#7BA7FF' : '#9CA3AF'
        }}
      >
        {displayNumber}{isSelected && ` ${note.pitch}`}
      </span>
    </div>
  );
};

export default NoteBox;
