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
  const centerY = 35; // VexFlow 오선보 중심과 일치
  const height = 10;

  return (
    <div
      className="absolute flex items-center justify-center rounded-[2px] border border-dashed border-orange-400/40 bg-orange-400/10"
      style={{
        left: `${left}px`,
        top: `${centerY - height / 2}px`,
        width: `${Math.max(width - 2, 10)}px`,
        height: `${height}px`,
        zIndex: 5
      }}
    >
      {/* 쉼표 기호 표시 (슬롯이 충분히 넓을 때만) */}
      {width >= 16 && (
        <span className="text-xs text-orange-300/70 select-none">
          {getRestSymbol(note.slotCount)}
        </span>
      )}
    </div>
  );
};

export default RestBox;
