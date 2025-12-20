// components/single/feedback/RecordedMeasureStaff.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import { Renderer, Stave, StaveNote, Voice, Formatter } from 'vexflow';
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

      // Set colors - 파란색 (#7BA7FF)
      context.setStrokeStyle('#7BA7FF');
      context.setFillStyle('#7BA7FF');

      const staveHeight = 40;
      const staveY = (height - staveHeight) / 2 - 20;

      // Create stave without clef/time signature for compact view
      const stave = new Stave(0, staveY, width - 5);
      stave.setContext(context);
      stave.draw();

      // Convert NoteData to VexFlow StaveNotes
      const staveNotes = notes.map(n => {
        if (n.isRest) {
          return new StaveNote({
            keys: ['b/4'],
            duration: `${n.duration}r`,
            clef: 'treble'
          });
        }

        // Parse pitch (e.g., "C4", "C#4", "Db4")
        const pitchMatch = n.pitch.match(/^([A-G])([#b]?)(\d)$/);
        if (!pitchMatch) {
          // Fallback for invalid pitch
          return new StaveNote({
            keys: ['c/4'],
            duration: n.duration,
            clef: 'treble'
          });
        }

        const [, noteName, accidental, octave] = pitchMatch;
        const vexKey = `${noteName.toLowerCase()}${accidental}/${octave}`;

        return new StaveNote({
          keys: [vexKey],
          duration: n.duration,
          clef: 'treble'
        });
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
