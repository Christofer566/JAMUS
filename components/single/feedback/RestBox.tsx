// components/single/feedback/RestBox.tsx
'use client';

import React from 'react';
import { NoteData } from '@/types/note';

interface RestBoxProps {
  note: NoteData;
  measureWidth: number;
  containerHeight: number;
}

// 쉼표 기호 (슬롯 수에 따라 다른 기호 표시)
function getRestSymbol(slotCount: number): string {
  if (slotCount >= 16) return '𝄻'; // 온쉼표
  if (slotCount >= 8) return '𝄼'; // 2분쉼표
  if (slotCount >= 4) return '𝄽'; // 4분쉼표
  if (slotCount >= 2) return '𝄾'; // 8분쉼표
  return '𝄿'; // 16분쉼표
}

const RestBox: React.FC<RestBoxProps> = ({
  note,
  measureWidth,
  containerHeight
}) => {
  // 쉼표가 아니면 렌더링하지 않음
  if (!note.isRest) return null;

  const slotWidth = measureWidth / 16;
  const left = note.slotIndex * slotWidth;
  const width = note.slotCount * slotWidth;
  const centerY = containerHeight / 2;
  const height = 16;

  return (
    <div
      className="absolute flex items-center justify-center rounded border-2 border-dashed border-orange-400/50 bg-orange-400/15"
      style={{
        left: `${left}px`,
        top: `${centerY - height / 2}px`,
        width: `${Math.max(width - 2, 12)}px`,
        height: `${height}px`,
        zIndex: 5
      }}
    >
      {/* 슬롯 위치 표시 */}
      <span className="absolute -top-5 left-0 text-[10px] text-orange-300/70 font-mono">
        s{note.slotIndex}-{note.slotIndex + note.slotCount - 1}
      </span>
      {/* 쉼표 기호 표시 (슬롯이 충분히 넓을 때만) */}
      {width >= 20 && (
        <span className="text-base text-orange-300 select-none font-bold">
          {getRestSymbol(note.slotCount)}
        </span>
      )}
    </div>
  );
};

export default RestBox;
