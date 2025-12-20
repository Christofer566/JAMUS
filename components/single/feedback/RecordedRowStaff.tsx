// components/single/feedback/RecordedRowStaff.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import { Renderer, Stave, StaveNote, Voice, Formatter, Barline, Accidental } from 'vexflow';
import { NoteData } from '@/types/note';

interface RecordedRowStaffProps {
  // 한 줄의 4마디에 해당하는 노트들 (마디 번호 → 노트 배열)
  notesPerMeasure: Record<number, NoteData[]>;
  // 이 줄의 시작 마디 번호 (1-indexed)
  rowStartMeasure: number;
  // 높이
  height?: number;
}

// Confidence에 따른 색상 정의
const CONFIDENCE_COLORS = {
  high: '#FFFFFF',    // 흰색 - 확실한 음표 (70%+)
  medium: '#FFD700',  // 노란색 - 애매한 음표 (50-70%)
  default: '#7BA7FF'  // 기본 파란색
};

const RecordedRowStaff: React.FC<RecordedRowStaffProps> = ({
  notesPerMeasure,
  rowStartMeasure,
  height = 80
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const actualWidth = container.offsetWidth;

    if (actualWidth === 0) return;

    // 디버깅 로그
    const measureNumbers = [rowStartMeasure, rowStartMeasure + 1, rowStartMeasure + 2, rowStartMeasure + 3];
    const notesInRow: Record<number, NoteData[]> = {};
    let totalNotes = 0;

    measureNumbers.forEach(m => {
      if (notesPerMeasure[m] && notesPerMeasure[m].length > 0) {
        notesInRow[m] = notesPerMeasure[m];
        totalNotes += notesPerMeasure[m].length;
      }
    });

    if (totalNotes > 0) {
      console.log(`[RecordedRowStaff] 마디 ${rowStartMeasure}~${rowStartMeasure + 3} 렌더링:`, {
        총음표수: totalNotes,
        마디별: Object.entries(notesInRow).map(([m, notes]) =>
          `M${m}: ${notes.map(n => `${n.pitch}(${n.duration}, slot${n.slotIndex})`).join(', ')}`
        )
      });
    }

    container.innerHTML = '';

    try {
      // Create SVG renderer
      const renderer = new Renderer(container, Renderer.Backends.SVG);
      renderer.resize(actualWidth, height);
      const context = renderer.getContext();

      // 오선지 크기 및 위치 조정
      const staveHeight = 50;
      const staveY = -5;
      const measureWidth = actualWidth / 4;

      // 4개 마디의 Stave 생성 및 연결
      const staves: Stave[] = [];

      for (let i = 0; i < 4; i++) {
        const x = i * measureWidth;
        const stave = new Stave(x, staveY, measureWidth);
        stave.setStyle({ strokeStyle: '#7BA7FF', fillStyle: '#7BA7FF' });

        // 마지막 마디에 끝 바라인
        if (i === 3) {
          stave.setEndBarType(Barline.type.SINGLE);
        }

        stave.setContext(context);
        stave.draw();
        staves.push(stave);
      }

      // 각 마디에 노트 렌더링 (slotIndex 기반 위치)
      for (let i = 0; i < 4; i++) {
        const measureNumber = rowStartMeasure + i;
        const notes = notesPerMeasure[measureNumber];

        if (!notes || notes.length === 0) continue;

        const stave = staves[i];
        const slotsPerMeasure = 16;

        // 각 음표를 개별적으로 slotIndex 위치에 렌더링
        notes.forEach(n => {
          if (n.isRest) return; // 쉼표는 건너뜀

          // Parse pitch (e.g., "C4", "C#4", "Db4")
          const pitchMatch = n.pitch.match(/^([A-G])([#b]?)(\d)$/);
          if (!pitchMatch) return;

          const [, noteName, accidental, octave] = pitchMatch;
          const vexKey = `${noteName.toLowerCase()}${accidental}/${octave}`;

          const staveNote = new StaveNote({
            keys: [vexKey],
            duration: n.duration,
            clef: 'treble'
          });

          // Accidental 추가
          if (accidental === '#') {
            staveNote.addModifier(new Accidental('#'));
          } else if (accidental === 'b') {
            staveNote.addModifier(new Accidental('b'));
          }

          // confidence에 따른 색상 적용
          const noteColor = n.confidence === 'high'
            ? CONFIDENCE_COLORS.high
            : n.confidence === 'medium'
              ? CONFIDENCE_COLORS.medium
              : CONFIDENCE_COLORS.default;

          staveNote.setStyle({
            fillStyle: noteColor,
            strokeStyle: noteColor
          });

          // slotIndex 기반 x 위치 계산 (16슬롯 = 1마디)
          const slotRatio = n.slotIndex / slotsPerMeasure; // 0~1 (마디 내 위치)
          const rowProgress = (i + slotRatio) / 4; // 0~1 (전체 row 내 위치)
          const noteX = rowProgress * actualWidth;

          // Voice 생성 및 렌더링
          const voice = new Voice({ num_beats: 4, beat_value: 4 }).setStrict(false);
          voice.addTickables([staveNote]);

          new Formatter().joinVoices([voice]).format([voice], 0);
          staveNote.setStave(stave);

          // TickContext의 x 위치를 직접 설정 (stave 기준 상대 좌표)
          const tickContext = staveNote.getTickContext();
          if (tickContext) {
            tickContext.setX(noteX - stave.getX());
          }

          voice.draw(context, stave);
        });
      }

    } catch (e) {
      console.error("VexFlow rendering error in RecordedRowStaff:", e);
    }

  }, [notesPerMeasure, rowStartMeasure, height]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ pointerEvents: 'none' }}
    />
  );
};

export default RecordedRowStaff;
