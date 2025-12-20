// components/single/feedback/RecordedMeasureStaff.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from 'vexflow';
import { NoteData } from '@/types/note';

interface RecordedMeasureStaffProps {
  notes: NoteData[];
  width: number;
  height: number;
}

const RecordedMeasureStaff: React.FC<RecordedMeasureStaffProps> = ({ notes, width, height }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !notes || notes.length === 0) {
      if (containerRef.current) containerRef.current.innerHTML = '';
      return;
    }

    containerRef.current.innerHTML = '';

    try {
      // Create SVG renderer
      const renderer = new Renderer(
        containerRef.current,
        Renderer.Backends.SVG
      );

      renderer.resize(width, height);
      const context = renderer.getContext();

      const staveHeight = 40;
      const staveY = (height - staveHeight) / 2 - 20;

      // Create stave without clef/time signature for compact view
      const stave = new Stave(0, staveY, width - 5);
      stave.setStyle({ strokeStyle: '#7BA7FF', fillStyle: '#7BA7FF' });
      stave.setContext(context);
      stave.draw();

      // Confidence에 따른 색상 정의
      const CONFIDENCE_COLORS = {
        high: '#FFFFFF',    // 흰색 - 확실한 음표 (70%+)
        medium: '#FFD700',  // 노란색 - 애매한 음표 (50-70%)
        default: '#7BA7FF'  // 기본 파란색
      };

      // Convert NoteData to VexFlow StaveNotes
      const staveNotes = notes.map(n => {
        if (n.isRest) {
          const restNote = new StaveNote({
            keys: ['b/4'],
            duration: `${n.duration}r`,
            clef: 'treble'
          });
          // 쉼표도 색상 적용
          restNote.setStyle({
            fillStyle: CONFIDENCE_COLORS.default,
            strokeStyle: CONFIDENCE_COLORS.default
          });
          return restNote;
        }

        // Parse pitch (e.g., "C4", "C#4", "Db4")
        const pitchMatch = n.pitch.match(/^([A-G])([#b]?)(\d)$/);
        if (!pitchMatch) {
          // Fallback for invalid pitch
          const fallbackNote = new StaveNote({
            keys: ['c/4'],
            duration: n.duration,
            clef: 'treble'
          });
          fallbackNote.setStyle({
            fillStyle: CONFIDENCE_COLORS.default,
            strokeStyle: CONFIDENCE_COLORS.default
          });
          return fallbackNote;
        }

        const [, noteName, accidental, octave] = pitchMatch;
        const vexKey = `${noteName.toLowerCase()}${accidental}/${octave}`;

        const staveNote = new StaveNote({
          keys: [vexKey],
          duration: n.duration,
          clef: 'treble'
        });

        // Accidental 추가 (샤프 또는 플랫)
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

        return staveNote;
      });

      // Create voice (non-strict mode to allow incomplete measures)
      const voice = new Voice({ num_beats: 4, beat_value: 4 }).setStrict(false);
      voice.addTickables(staveNotes);

      // Format and draw
      new Formatter()
        .joinVoices([voice])
        .format([voice], width - 20);

      voice.draw(context, stave);

    } catch (e) {
      console.error("VexFlow rendering error in RecordedMeasureStaff:", e);
      if (containerRef.current) {
        containerRef.current.innerHTML = '<p class="text-red-500 text-xs">Render Error</p>';
      }
    }

  }, [notes, width, height]);

  return <div ref={containerRef} style={{ width, height }} className="mx-auto"></div>;
};

export default RecordedMeasureStaff;
