// components/single/feedback/GhostNote.tsx
'use client';

import React from 'react';

interface GhostNoteProps {
  x: number;           // 시작 X 좌표
  y: number;           // Y 좌표 (pitch 위치)
  width: number;       // 너비
  height?: number;     // 높이 (기본 5px)
  pitch: string;       // 음정 라벨
  isLocked: boolean;   // true면 녹색, false면 파란색
}

/**
 * Smart Guide용 반투명 음표 미리보기
 * - 호버 시: 파란색 (#7BA7FF/40%)
 * - 음정 확정 후: 녹색 (#4ADE80/50%)
 */
export const GhostNote: React.FC<GhostNoteProps> = ({
  x,
  y,
  width,
  height = 5,
  pitch,
  isLocked,
}) => {
  const bgColor = isLocked
    ? 'rgba(74, 222, 128, 0.5)'  // 녹색 (pitch_locked)
    : 'rgba(123, 167, 255, 0.4)'; // 파란색 (hovering)

  const borderColor = isLocked
    ? 'rgba(74, 222, 128, 0.8)'
    : 'rgba(123, 167, 255, 0.6)';

  return (
    <g className="ghost-note" style={{ pointerEvents: 'none' }}>
      {/* 음표 박스 */}
      <rect
        x={x}
        y={y - height / 2}
        width={width}
        height={height}
        fill={bgColor}
        stroke={borderColor}
        strokeWidth={1}
        rx={2}
        ry={2}
      />

      {/* 음정 라벨 */}
      <text
        x={x + width / 2}
        y={y + height + 10}
        textAnchor="middle"
        fill={isLocked ? '#4ADE80' : '#7BA7FF'}
        fontSize={10}
        fontWeight="bold"
        style={{ userSelect: 'none' }}
      >
        {pitch}
      </text>
    </g>
  );
};

export default GhostNote;
