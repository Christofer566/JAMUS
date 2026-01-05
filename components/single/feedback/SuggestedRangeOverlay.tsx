// components/single/feedback/SuggestedRangeOverlay.tsx
'use client';

import React, { useCallback, useMemo } from 'react';
import { SuggestedRange, SmartGuideState } from '@/types/suggestedRange';
import GhostNote from './GhostNote';

// 상수: 악보 렌더링 기준
const STAVE_CENTER_Y = 35;          // B4 기준 Y 좌표
const PIXELS_PER_SEMITONE = 2.5;    // 반음당 픽셀
const B4_MIDI = 71;                 // B4의 MIDI 번호
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface SuggestedRangeOverlayProps {
  range: SuggestedRange;
  measureWidth: number;           // 마디 너비
  measureStartX: number;          // 마디 시작 X 좌표
  smartGuide: SmartGuideState;
  staveHeight: number;            // 오선지 높이
  onMouseMove: (y: number, x: number) => void;
  onMouseLeave: () => void;
  onClick: (e: React.MouseEvent) => void;
}

/**
 * Y 좌표를 MIDI 음정으로 변환
 */
function yToMidi(y: number): number {
  const semitoneOffset = (STAVE_CENTER_Y - y) / PIXELS_PER_SEMITONE;
  return Math.round(B4_MIDI + semitoneOffset);
}

/**
 * MIDI 번호를 pitch 문자열로 변환
 */
function midiToPitch(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const pitchClass = midi % 12;
  return NOTE_NAMES[pitchClass] + octave;
}

/**
 * MIDI 번호를 Y 좌표로 변환
 */
function midiToY(midi: number): number {
  return STAVE_CENTER_Y - (midi - B4_MIDI) * PIXELS_PER_SEMITONE;
}

/**
 * SuggestedRange 영역 오버레이
 * - 저신뢰도 구간을 하이라이트
 * - 마우스 호버 시 Ghost Note 렌더링
 * - 클릭으로 음정/길이 확정
 */
export const SuggestedRangeOverlay: React.FC<SuggestedRangeOverlayProps> = ({
  range,
  measureWidth,
  measureStartX,
  smartGuide,
  staveHeight,
  onMouseMove,
  onMouseLeave,
  onClick,
}) => {
  // 슬롯당 너비 계산
  const slotWidth = measureWidth / 16;

  // Range 영역 좌표
  const rangeX = measureStartX + range.startSlot * slotWidth;
  const rangeWidth = (range.endSlot - range.startSlot) * slotWidth;

  // 현재 Range가 활성화 상태인지 확인
  const isActive = smartGuide.activeRange?.measureIndex === range.measureIndex &&
    smartGuide.activeRange?.startSlot === range.startSlot;

  // 마우스 이동 핸들러
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;

    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    onMouseMove(svgP.y, svgP.x);
  }, [onMouseMove]);

  // Ghost Note 계산
  const ghostNote = useMemo(() => {
    if (!isActive || smartGuide.hoverY === null) return null;

    const midi = smartGuide.step === 'pitch_locked' && smartGuide.lockedMidi !== null
      ? smartGuide.lockedMidi
      : yToMidi(smartGuide.hoverY);

    const pitch = smartGuide.step === 'pitch_locked' && smartGuide.lockedPitch !== null
      ? smartGuide.lockedPitch
      : midiToPitch(midi);

    const noteY = smartGuide.step === 'pitch_locked' && smartGuide.lockedMidi !== null
      ? midiToY(smartGuide.lockedMidi)
      : smartGuide.hoverY;

    // 길이 계산: pitch_locked 상태에서 마우스 X 위치에 따라 동적
    let noteWidth = rangeWidth; // 기본: 전체 범위

    if (smartGuide.step === 'pitch_locked' && smartGuide.hoverX !== null) {
      // 마우스 X 위치까지의 슬롯 수 계산
      const mouseRelativeX = smartGuide.hoverX - rangeX;
      const slotCount = Math.max(1, Math.min(
        Math.ceil(mouseRelativeX / slotWidth),
        range.endSlot - range.startSlot
      ));
      noteWidth = slotCount * slotWidth;
    }

    return {
      x: rangeX,
      y: noteY,
      width: noteWidth,
      pitch,
      isLocked: smartGuide.step === 'pitch_locked',
    };
  }, [isActive, smartGuide, range, rangeX, rangeWidth, slotWidth]);

  return (
    <g className="suggested-range-overlay">
      {/* Range 하이라이트 영역 */}
      <rect
        x={rangeX}
        y={2}
        width={rangeWidth}
        height={staveHeight - 4}
        fill={isActive ? 'rgba(123, 167, 255, 0.15)' : 'rgba(156, 163, 175, 0.1)'}
        stroke={isActive ? 'rgba(123, 167, 255, 0.4)' : 'rgba(156, 163, 175, 0.3)'}
        strokeWidth={1}
        strokeDasharray={isActive ? '4 2' : '2 2'}
        rx={4}
        ry={4}
        style={{ cursor: 'crosshair', pointerEvents: 'auto' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
      />

      {/* 추천 음정 힌트 (비활성 상태에서만) */}
      {!isActive && range.suggestedPitch && (
        <text
          x={rangeX + rangeWidth / 2}
          y={staveHeight - 6}
          textAnchor="middle"
          fill="rgba(156, 163, 175, 0.6)"
          fontSize={8}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {range.suggestedPitch}?
        </text>
      )}

      {/* Ghost Note */}
      {ghostNote && (
        <GhostNote
          x={ghostNote.x}
          y={ghostNote.y}
          width={ghostNote.width}
          pitch={ghostNote.pitch}
          isLocked={ghostNote.isLocked}
        />
      )}

      {/* 안내 텍스트 (pitch_locked 상태에서만) */}
      {isActive && smartGuide.step === 'pitch_locked' && (
        <text
          x={rangeX + rangeWidth / 2}
          y={staveHeight + 12}
          textAnchor="middle"
          fill="#4ADE80"
          fontSize={10}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          클릭하여 길이 확정
        </text>
      )}
    </g>
  );
};

export default SuggestedRangeOverlay;
