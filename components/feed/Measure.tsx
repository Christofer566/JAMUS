import React from 'react';
import VexFlowStaff from './VexFlowStaff';

interface MeasureProps {
  measure: { chord: string };
  localIndex: number;
  globalMeasureOffset: number;
  isCurrentSection: boolean;
  currentMeasure: number;
  selectedMeasures: { start: number; end: number } | null;
  sectionColor: string;
  handleMouseDown: (measureIndex: number) => (e: React.MouseEvent) => void;
  handleMouseEnter: (measureIndex: number) => void;
}

const MeasureComponent = ({
  measure,
  localIndex,
  globalMeasureOffset,
  isCurrentSection,
  currentMeasure,
  selectedMeasures,
  sectionColor,
  handleMouseDown,
  handleMouseEnter,
}: MeasureProps) => {
  const globalMeasureIndex = globalMeasureOffset + localIndex;
  const isActiveMeasure = isCurrentSection && localIndex === currentMeasure;
  const isSelected = selectedMeasures 
    ? globalMeasureIndex >= selectedMeasures.start && globalMeasureIndex <= selectedMeasures.end 
    : false;

  return (
    <div
      key={localIndex}
      className="relative flex flex-1 items-center justify-start"
      onMouseDown={handleMouseDown(globalMeasureIndex)}
      onMouseEnter={() => handleMouseEnter(globalMeasureIndex)}
      style={{ cursor: 'pointer' }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: `${sectionColor}40` }}
      />
      
      {isSelected ? (
        <VexFlowStaff 
          chord={measure.chord} 
          height={isCurrentSection ? 72 : 56} 
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center duration-300"
          style={{
            color: isActiveMeasure ? sectionColor : "#E0E0E0",
            fontSize: isActiveMeasure ? "1rem" : "0.875rem",
            fontWeight: isActiveMeasure ? 600 : 400,
            textShadow: isActiveMeasure ? `0 0 8px ${sectionColor}99` : "none",
            pointerEvents: 'none',
            transition: 'color 0.3s ease, font-size 0.3s ease, font-weight 0.3s ease, text-shadow 0.3s ease'
          }}
        >
          {measure.chord}
        </div>
      )}
    </div>
  );
};

// Memoize the component to prevent re-renders when measureProgress changes
export const MemoizedMeasure = React.memo(MeasureComponent);
