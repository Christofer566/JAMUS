// components/single/feedback/EditModeOverlay.tsx
'use client';

import React from 'react';

interface EditModeOverlayProps {
  measureWidth: number;
  height: number;
}

const EditModeOverlay: React.FC<EditModeOverlayProps> = ({ measureWidth, height }) => {
  const slotWidth = measureWidth / 16;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ height }}>
      {Array.from({ length: 16 }).map((_, i) => {
        const isBeat = i % 4 === 0;
        return (
          <div
            key={i}
            className="absolute top-0 bottom-0"
            style={{
              left: `${i * slotWidth}px`,
              width: '1px',
              backgroundColor: isBeat
                ? 'rgba(255, 255, 255, 0.3)'
                : 'rgba(255, 255, 255, 0.15)',
              borderStyle: isBeat ? 'solid' : 'dashed'
            }}
          />
        );
      })}
    </div>
  );
};

export default EditModeOverlay;
