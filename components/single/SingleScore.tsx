'use client';

import { useEffect, useRef, useMemo } from "react";
import { renderChordMeasure } from '@/utils/chordParser';
import { NoteData } from "@/types/note";
import RecordedRowStaff from "./feedback/RecordedRowStaff";

interface Measure {
  chord: string;
}

interface Section {
  id:string;
  label: string;
  measures: Measure[];
  isJamSection?: boolean;
}

interface SingleScoreProps {
  sections: Section[];
  currentSectionIndex?: number;
  currentMeasure?: number;
  measureProgress?: number;
  selectedMeasures: { start: number; end: number } | null;
  onSelectionChange?: (selection: { start: number; end: number } | null) => void;
  onMeasureClick?: (globalMeasureIndex: number) => void;
  recordedMeasures?: number[];
  recordedNotes?: Record<number, NoteData[]>;
  isEditMode?: boolean;
}

const SINGLE_COLOR = '#7BA7FF';
const JAM_COLOR = '#FF6B6B';

export default function SingleScore({
  sections,
  currentSectionIndex = 0,
  currentMeasure = 0,
  measureProgress = 0,
  selectedMeasures,
  onSelectionChange,
  onMeasureClick,
  recordedMeasures = [],
  recordedNotes = {},
  isEditMode = false,
}: SingleScoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentRowRef = useRef<HTMLDivElement>(null);

  const currentRowIndex = useMemo(() => {
    return Math.floor(currentMeasure / 4);
  }, [currentMeasure]);

  // 마디 클릭 시 해당 마디 처음으로 이동 (드래그 선택 제거)
  const handleMeasureClick = (measureIndex: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    // onMeasureClick이 있으면 해당 마디로 seek
    if (onMeasureClick) {
      onMeasureClick(measureIndex);
    }
  };

  // ESC 키 핸들러 (추후 악보 렌더링 시 사용)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedMeasures) onSelectionChange?.(null);
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedMeasures, onSelectionChange]);

  useEffect(() => {
    if (currentRowRef.current && containerRef.current) {
      const container = containerRef.current;
      const currentRow = currentRowRef.current;
      const containerHeight = container.clientHeight;
      const rowTop = currentRow.offsetTop;
      const rowHeight = currentRow.clientHeight;
      const scrollPosition = rowTop - containerHeight / 2 + rowHeight / 2;
      container.scrollTo({ top: Math.max(0, scrollPosition), behavior: "smooth" });
    }
  }, [currentSectionIndex, currentRowIndex]);

  const getGlobalMeasureIndex = (sectionIdx: number, localMeasureIdx: number): number => {
    return sections.slice(0, sectionIdx).reduce((total, s) => total + s.measures.length, 0) + localMeasureIdx;
  };

  const renderSection = (section: Section, sectionIdx: number) => {
    const isCurrentSection = sectionIdx === currentSectionIndex;
    const isJamSection = section.isJamSection || section.label.toLowerCase().includes('chorus');
    const sectionColor = isJamSection ? JAM_COLOR : SINGLE_COLOR;
    const sectionOpacity = isCurrentSection ? 1 : 0.5;
    const measures = section.measures;
    const rows: Measure[][] = [];
    for (let i = 0; i < measures.length; i += 4) {
      rows.push(measures.slice(i, i + 4));
    }
    const activeRowInSection = isCurrentSection ? Math.floor(currentMeasure / 4) : -1;
    const measureInRow = isCurrentSection ? currentMeasure % 4 : 0;

    const renderMeasure = (measure: Measure, localIndex: number, hasNotesInRow: boolean) => {
      const globalMeasureIndex = getGlobalMeasureIndex(sectionIdx, localIndex);
      const isActiveMeasure = isCurrentSection && localIndex === currentMeasure;
      const isRecorded = recordedMeasures.includes(globalMeasureIndex + 1);
      const measureNumberStr = (globalMeasureIndex + 1).toString().padStart(2, '0');

      return (
        <div
          key={localIndex}
          data-testid={`recorded-measure-${globalMeasureIndex}`}
          className={`relative flex flex-1 items-center justify-start transition-colors ${!isEditMode ? 'hover:bg-white/5' : ''}`}
          onClick={isEditMode ? undefined : handleMeasureClick(globalMeasureIndex)}
          style={{
            cursor: isEditMode ? 'default' : 'pointer',
            backgroundColor: isRecorded ? 'rgba(255, 123, 123, 0.15)' : 'transparent',
          }}
        >
          <div className="absolute top-1 left-2 text-xs text-gray-400 font-mono font-medium z-10">{measureNumberStr}</div>
          <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: `${sectionColor}40` }} />

          {/* 오선지가 있는 줄에서는 코드 표시 안 함 */}
          {!hasNotesInRow && (
            <div
              className="absolute inset-0 flex items-center justify-center duration-300"
              style={{ pointerEvents: 'none', transition: 'all 0.3s ease' }}
            >
              <div style={{
                  color: isActiveMeasure ? sectionColor : "#E0E0E0",
                  fontSize: isActiveMeasure ? "1rem" : "0.875rem",
                  fontWeight: isActiveMeasure ? 600 : 400,
                  textShadow: isActiveMeasure ? `0 0 8px ${sectionColor}99` : "none",
              }}>
                  {(() => {
                    try {
                      const { nodes, count, isEmpty } = renderChordMeasure(measure.chord);
                      if (isEmpty) return measure.chord || '';
                      if (count === 1) return nodes[0];
                      return <div className="flex w-full justify-around px-1">{nodes}</div>;
                    } catch { return measure.chord || ''; }
                  })()}
              </div>
            </div>
          )}
        </div>
      );
    };

    const renderRow = (rowMeasures: Measure[], rowIndex: number) => {
        const rowStartIndex = rowIndex * 4;
        const rowStartMeasure = getGlobalMeasureIndex(sectionIdx, rowStartIndex) + 1; // 1-indexed
        const hasNotesInRow = rowMeasures.some((_, i) => recordedNotes[rowStartMeasure + i]?.length > 0);
        const rowHeight = hasNotesInRow ? "7rem" : (isCurrentSection ? "4.5rem" : "3.5rem"); // 오선지 줄 높이 증가

        const isFirstRow = rowIndex === 0;
        const isCurrentRow = isCurrentSection && activeRowInSection === rowIndex;

        return (
            <div
            key={rowIndex}
            ref={isCurrentRow ? currentRowRef : null}
            className={`flex items-stretch transition-all duration-500 ${rowIndex > 0 ? 'mt-3' : ''}`}
            style={{ opacity: sectionOpacity, height: rowHeight }}
            >
            {isFirstRow ? (
                <div className="mr-2 flex w-28 flex-col items-center justify-center self-stretch border-r-2 pr-2 transition-all duration-300" style={{ borderColor: sectionColor, backgroundColor: `${sectionColor}15` }}>
                <div className="text-xs font-medium transition-all duration-300" style={{ color: sectionColor, fontSize: isCurrentSection ? "0.75rem" : "0.6875rem" }}>{section.label}</div>
                {isJamSection && <div className="text-[10px] text-gray-400 mt-1">JAM</div>}
                </div>
            ) : ( <div className="mr-2 w-28 pr-2"></div> )}
            <div className="relative flex flex-1 items-center">
                {isFirstRow && (
                <div className="absolute left-0 z-10 rounded-t-md px-1.5 transition-all duration-300" style={{ bottom: "100%", backgroundColor: sectionColor, fontSize: isCurrentSection ? "0.625rem" : "0.5625rem", fontWeight: isCurrentSection ? 600 : 500, color: "#FFFFFF", boxShadow: `0 2px 4px ${sectionColor}40`, lineHeight: "1.2", paddingTop: "0.25rem", paddingBottom: "0.125rem" }}>
                    {section.label}
                </div>
                )}
                {isJamSection && <div className="absolute inset-0 rounded-lg pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255, 107, 107, 0.15) 0%, rgba(255, 107, 107, 0.05) 100%)', border: '1px dashed rgba(255, 107, 107, 0.3)' }} />}

                {/* 녹음된 노트가 있는 줄에 오선지 표시 */}
                {hasNotesInRow && (
                  <div
                    className="absolute inset-0"
                    style={{ zIndex: isEditMode ? 25 : 'auto' }}
                  >
                    <RecordedRowStaff
                      notesPerMeasure={recordedNotes}
                      rowStartMeasure={rowStartMeasure}
                      height={112}
                      isEditMode={isEditMode}
                    />
                  </div>
                )}

                {isCurrentRow && (
                <div className="absolute top-0 bottom-0 z-30 w-full transition-transform duration-100 ease-linear" style={{ transform: `translateX(${(measureInRow + measureProgress) * 25}%)`, pointerEvents: 'none' }}>
                    <div className="h-full w-1" style={{ backgroundColor: sectionColor, boxShadow: `0 0 10px ${sectionColor}, 0 0 20px ${sectionColor}99` }} />
                </div>
                )}
                <div
                  className="relative z-20 flex h-full w-full"
                  style={{ pointerEvents: isEditMode ? 'none' : 'auto' }}
                >
                {rowMeasures.map((measure, measureIndex) => renderMeasure(measure, rowStartIndex + measureIndex, hasNotesInRow))}
                <div className="absolute right-0 top-0 bottom-0 w-1" style={{ backgroundColor: `${sectionColor}40` }} />
                </div>
            </div>
            </div>
        );
    };

    return (
      <div key={section.id} className="mb-6">
        {rows.map((rowMeasures, rowIndex) => renderRow(rowMeasures, rowIndex))}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="h-full overflow-y-auto px-2 pt-5 no-scrollbar">
      {sections.map((section, index) => renderSection(section, index))}
    </div>
  );
}