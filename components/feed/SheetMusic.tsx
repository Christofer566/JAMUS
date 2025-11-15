'use client';

import { useEffect, useRef, useState, useMemo } from "react";
import { Heart } from "lucide-react";
import VexFlowStaff from './VexFlowStaff';

interface Measure {
  chord: string;
}

interface Section {
  id: string;
  label: string;
  measures: Measure[];
  user: string;
  userImage?: string;
  color: string;
}

interface SheetMusicProps {
  sections: Section[];
  currentSectionIndex?: number;
  currentMeasure?: number;
  measureProgress?: number;
  sectionProgress?: number;
  selectedMeasures: { start: number; end: number } | null;
  onSelectionChange?: (selection: { start: number; end: number } | null) => void;
}

export default function SheetMusic({
  sections,
  currentSectionIndex = 0,
  currentMeasure = 0,
  measureProgress = 0,
  sectionProgress = 0,
  selectedMeasures,
  onSelectionChange,
}: SheetMusicProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentSectionRef = useRef<HTMLDivElement>(null);

  const [likes, setLikes] = useState<Record<string, boolean>>({
    "section-A": false,
    "section-B": false,
    "section-C": false,
    "section-D": false,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);

  const toggleLike = (sectionId: string) => {
    setLikes((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const handleMouseDown = (measureIndex: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart(measureIndex);
    if (onSelectionChange) {
      onSelectionChange({ start: measureIndex, end: measureIndex });
    }
  };

  const handleMouseEnter = (measureIndex: number) => {
    if (isDragging && dragStart !== null) {
      if (onSelectionChange) {
        onSelectionChange({
          start: Math.min(dragStart, measureIndex),
          end: Math.max(dragStart, measureIndex)
        });
      }
    }
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedMeasures) {
        onSelectionChange?.(null);
      }
    };
  
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedMeasures, onSelectionChange]);

  useEffect(() => {
    if (currentSectionRef.current && containerRef.current) {
      const container = containerRef.current;
      const currentSection = currentSectionRef.current;
      const containerHeight = container.clientHeight;
      const sectionTop = currentSection.offsetTop;
      const sectionHeight = currentSection.clientHeight;
      const scrollPosition = sectionTop - containerHeight / 2 + sectionHeight / 2;
      container.scrollTo({
        top: scrollPosition,
        behavior: "smooth",
      });
    }
  }, [currentSectionIndex]);

  const renderSection = (section: Section, sectionIdx: number) => {
    const globalMeasureOffset = sections
      .slice(0, sectionIdx)
      .reduce((total, s) => total + s.measures.length, 0);

    const isCurrentSection = sectionIdx === currentSectionIndex;
    const sectionColor = section.color;
    const sectionOpacity = isCurrentSection ? 1 : 0.5;

    const measures = section.measures;
    const hasMultipleRows = measures.length > 4;
    const firstRow = measures.slice(0, 4);
    const secondRow = hasMultipleRows ? measures.slice(4, 8) : [];

    const sectionStart = globalMeasureOffset;
    const sectionEnd = globalMeasureOffset + section.measures.length - 1;

    const hasSelection = selectedMeasures && 
      !(selectedMeasures.end < sectionStart || selectedMeasures.start > sectionEnd);

    let firstRowOverlay = null;
    let secondRowOverlay = null;

    if (hasSelection && selectedMeasures) {
      const localStart = Math.max(0, selectedMeasures.start - globalMeasureOffset);
      const localEnd = Math.min(section.measures.length - 1, selectedMeasures.end - globalMeasureOffset);
      
      const firstRowStart = localStart < 4 ? localStart : null;
      const firstRowEnd = localEnd < 4 ? localEnd : Math.min(3, localEnd);
      const secondRowStart = localStart >= 4 ? localStart - 4 : (localEnd >= 4 ? 0 : null);
      const secondRowEnd = localEnd >= 4 ? localEnd - 4 : null;

      if (firstRowStart !== null) {
        const selectionStartsInThisFirstRow = selectedMeasures && 
          selectedMeasures.start >= globalMeasureOffset + firstRowStart && 
          selectedMeasures.start <= globalMeasureOffset + firstRowEnd;

        firstRowOverlay = (
          <div
            className="absolute inset-y-0 border-[3px] border-[#7BA7FF] pointer-events-none z-30 rounded"
            style={{
              left: `${(firstRowStart / 4) * 100}%`,
              width: `${((firstRowEnd - firstRowStart + 1) / 4) * 100}%`,
            }}
          >
            {selectionStartsInThisFirstRow && (
              <button
                className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-[#7BA7FF] hover:bg-[#5B87DF] flex items-center justify-center pointer-events-auto transition-colors z-40"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectionChange?.(null);
                }}
              >
                <svg 
                  className="w-4 h-4 text-white" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M6 18L18 6M6 6l12 12" 
                  />
                </svg>
              </button>
            )}
          </div>
        );
      }

      if (secondRowStart !== null && secondRowEnd !== null) {
        const selectionStartsInThisSecondRow = selectedMeasures && 
          selectedMeasures.start >= globalMeasureOffset + 4 && 
          selectedMeasures.start < globalMeasureOffset + 8;

        secondRowOverlay = (
          <div
            className="absolute inset-y-0 border-[3px] border-[#7BA7FF] pointer-events-none z-30 rounded"
            style={{
              left: `${(secondRowStart / 4) * 100}%`,
              width: `${((secondRowEnd - secondRowStart + 1) / 4) * 100}%`,
            }}
          >
            {selectionStartsInThisSecondRow && (
              <button
                className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-[#7BA7FF] hover:bg-[#5B87DF] flex items-center justify-center pointer-events-auto transition-colors z-40"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectionChange?.(null);
                }}
              >
                <svg 
                  className="w-4 h-4 text-white" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M6 18L18 6M6 6l12 12" 
                  />
                </svg>
              </button>
            )}
          </div>
        );
      }
    }

    const renderMeasure = (measure: Measure, localIndex: number) => {
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

    return (
      <div key={section.id} className="mb-6" ref={isCurrentSection ? currentSectionRef : null}>
        <div
          className="flex items-stretch transition-all duration-500"
          style={{
            opacity: sectionOpacity,
            height: isCurrentSection ? "4.5rem" : "3.5rem",
          }}
        >
          <div
            className="mr-2 flex w-28 flex-col items-center justify-center self-stretch gap-2 border-r-2 pr-2 transition-all duration-300"
            style={{
              borderColor: sectionColor,
              backgroundColor: `${sectionColor}15`,
            }}
          >
            {section.userImage || section.id.includes("section-") ? (
              <>
                <div className="flex w-full items-center justify-between px-1">
                  <div
                    className="flex items-center justify-center rounded-full text-[10px] font-medium transition-all duration-300"
                    style={{
                      width: isCurrentSection ? "2rem" : "1.5rem",
                      height: isCurrentSection ? "2rem" : "1.5rem",
                      border: `2px solid ${sectionColor}60`,
                      backgroundColor: `${sectionColor}30`,
                      color: sectionColor,
                    }}
                  >
                    {section.user.charAt(0).toUpperCase()}
                  </div>
                  <button
                    onClick={() => toggleLike(section.id)}
                    className="transition-all duration-300 hover:scale-110 active:scale-95"
                  >
                    <Heart
                      size={isCurrentSection ? 18 : 16}
                      fill={likes[section.id] ? sectionColor : "none"}
                      stroke={sectionColor}
                      strokeWidth={2}
                    />
                  </button>
                </div>
                <div
                  className="w-full truncate px-1 text-center transition-all duration-300"
                  style={{
                    color: "#E0E0E0",
                    fontSize: isCurrentSection ? "0.75rem" : "0.6875rem",
                  }}
                >
                  {section.user}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-[11px] text-[#9B9B9B]">
                {section.user}
              </div>
            )}
          </div>

          <div className="relative flex flex-1 items-center">
            <div
              className="absolute left-0 z-10 rounded-t-md px-1.5 transition-all duration-300"
              style={{
                bottom: "100%",
                backgroundColor: sectionColor,
                fontSize: isCurrentSection ? "0.625rem" : "0.5625rem",
                fontWeight: isCurrentSection ? 600 : 500,
                color: "#FFFFFF",
                boxShadow: `0 2px 4px ${sectionColor}40`,
                lineHeight: "1.2",
                paddingTop: "0.25rem",
                paddingBottom: "0.125rem",
              }}
            >
              {section.label}
            </div>

            {isCurrentSection && currentMeasure < 4 && (
              <div
                className="absolute top-0 bottom-0 z-30 w-full transition-transform duration-100 ease-linear"
                style={{
                  transform: `translateX(${(currentMeasure + measureProgress) * 25}%)`,
                  pointerEvents: 'none',
                }}
              >
                <div 
                  className="h-full w-1"
                  style={{
                    backgroundColor: sectionColor,
                    boxShadow: `0 0 10px ${sectionColor}, 0 0 20px ${sectionColor}99`,
                  }}
                />
              </div>
            )}

            <div className="relative z-20 flex h-full w-full">
              {firstRow.map((measure, measureIndex) => renderMeasure(measure, measureIndex))}
              <div
                className="absolute right-0 top-0 bottom-0 w-1"
                style={{ backgroundColor: `${sectionColor}40` }}
              />
              {firstRowOverlay}
            </div>
          </div>
        </div>

        {hasMultipleRows && (
          <div
            className="mt-6 flex items-stretch transition-all duration-500"
            style={{
              opacity: sectionOpacity,
              height: isCurrentSection ? "4.5rem" : "3.5rem",
            }}
          >
            <div className="mr-2 w-28 pr-2"></div>
            <div className="relative flex flex-1 items-center">
              {isCurrentSection && currentMeasure >= 4 && (
                <div
                  className="absolute top-0 bottom-0 z-30 w-full transition-transform duration-100 ease-linear"
                  style={{
                    transform: `translateX(${(currentMeasure - 4 + measureProgress) * 25}%)`,
                    pointerEvents: 'none',
                  }}
                >
                  <div 
                    className="h-full w-1"
                    style={{
                      backgroundColor: sectionColor,
                      boxShadow: `0 0 10px ${sectionColor}, 0 0 20px ${sectionColor}99`,
                    }}
                  />
                </div>
              )}
              <div className="relative z-20 flex h-full w-full">
                {secondRow.map((measure, measureIndex) => renderMeasure(measure, measureIndex + 4))}
                <div
                  className="absolute right-0 top-0 bottom-0 w-1"
                  style={{ backgroundColor: `${sectionColor}40` }}
                />
                {secondRowOverlay}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="h-full overflow-y-auto px-2 pt-5 no-scrollbar">
      {sections.map((section, index) => renderSection(section, index))}
    </div>
  );
}
