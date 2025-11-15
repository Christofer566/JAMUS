'use client';

import React, { useEffect, useRef } from 'react';
import { Renderer, Stave, StaveNote, Voice, Formatter } from 'vexflow';
import { chordToNotes } from '@/lib/vexflow/chordToNotes';

interface VexFlowStaffProps {
  chord: string;
  height: number;
  color?: string;
}

const VexFlowStaffComponent = ({
  chord,
  height,
  color = '#FFFFFF'
}: VexFlowStaffProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentContainer = containerRef.current;
    if (!currentContainer) return;

    // Get actual dimensions of the container
    const actualWidth = currentContainer.offsetWidth;

    // Clear previous render
    currentContainer.innerHTML = '';

    try {
      // Create SVG renderer
      const renderer = new Renderer(
        currentContainer,
        Renderer.Backends.SVG
      );

      renderer.resize(actualWidth, height); // Use actual dimensions
      const context = renderer.getContext();

      // Set bright color for visibility
      context.setStrokeStyle('#FFFFFF'); // White staff lines
      context.setFillStyle('#FFFFFF');

      const staveHeight = 40; // Staff takes 40px
      const staveY = ((height - staveHeight) / 2) - 40; // Adjust up by another 5px (total 40px)

      // Create stave - position at top of container
      const stave = new Stave(0, staveY, actualWidth); // Use actual width
      stave.setContext(context);
      stave.draw();

      // Convert chord to notes
      const noteData = chordToNotes(chord);
      
      // Create VexFlow notes
      const notes = noteData.map(({ key, duration }) => 
        new StaveNote({
          keys: [key],
          duration,
          clef: 'treble'
        })
      );

      // Create voice and add notes
      const voice = new Voice({ numBeats: 4, beat_value: 4 });
      voice.addTickables(notes);

      // Format and draw
      new Formatter()
        .joinVoices([voice])
        .format([voice], actualWidth - 20); // Use actual width

      voice.draw(context, stave);

    } catch (error) {
      console.error('VexFlow rendering error:', error);
    }

    return () => {
      if (currentContainer) {
        currentContainer.innerHTML = '';
      }
    };
  }, [chord, height, color]); // Remove width and height from dependencies

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        pointerEvents: 'none'
      }}
    />
  );
};

export default React.memo(VexFlowStaffComponent);
