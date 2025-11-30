'use client';

import { useEffect, useRef, useState, useMemo } from "react";
import VexFlowStaff from '../feed/VexFlowStaff';
import { renderChordMeasure } from '@/utils/chordParser';

interface Measure {
  chord: string;
}

interface Section {
  id: string;
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
}

// Single Mode 색상
const SINGLE_COLOR = '#7BA7FF';
const JAM_COLOR = '#FF6B6B'; // 코랄색

export default function SingleScore({
  sections,
  currentSectionIndex = 0,
  currentMeasure = 0,
  measureProgress = 0,
  selectedMeasures,
  onSelectionChange,
}: SingleScoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentRowRef = useRef<HTMLDivElement>(null);

  const currentRowIndex = useMemo(() => {
    return Math.floor(currentMeasure / 4);
  }, [currentMeasure]);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);

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

  // 자동 스크롤
  useEffect(() => {
    if (currentRowRef.current && containerRef.current) {
      const container = containerRef.current;
      const currentRow = currentRowRef.current;
      const containerHeight = container.clientHeight;
      const rowTop = currentRow.offsetTop;
      const rowHeight = currentRow.clientHeight;

      const scrollPosition = rowTop - containerHeight / 2 + rowHeight / 2;

      container.scrollTo({
        top: Math.max(0, scrollPosition),
        behavior: "smooth",
      });
    }
  }, [currentSectionIndex, currentRowIndex]);

  // 전역 마디 번호 계산 함수
  const getGlobalMeasureNumber = (sectionIdx: number, localMeasureIdx: number): number => {
    const offset = sections
      .slice(0, sectionIdx)
      .reduce((total, s) => total + s.measures.length, 0);
    return offset + localMeasureIdx + 1; // 1부터 시작
  };

  const renderSection = (section: Section, sectionIdx: number) => {
    const globalMeasureOffset = sections
      .slice(0, sectionIdx)
      .reduce((total, s) => total + s.measures.length, 0);

    const isCurrentSection = sectionIdx === currentSectionIndex;
    const isJamSection = section.isJamSection || section.label.toLowerCase().includes('chorus');
    const sectionColor = isJamSection ? JAM_COLOR : SINGLE_COLOR;
    const sectionOpacity = isCurrentSection ? 1 : 0.5;

    const measures = section.measures;

    // 4마디씩 청크로 분할
    const rows: Measure[][] = [];
    for (let i = 0; i < measures.length; i += 4) {
      const chunk = measures.slice(i, i + 4);
      while (chunk.length < 4) {
        chunk.push({ chord: '' });
      }
      rows.push(chunk);
    }

    const activeRowInSection = isCurrentSection ? Math.floor(currentMeasure / 4) : -1;
    const measureInRow = isCurrentSection ? currentMeasure % 4 : 0;

    // 선택 영역 오버레이
    const getRowOverlay = (rowIndex: number) => {
      if (!selectedMeasures) return null;

      const rowStartGlobal = globalMeasureOffset + (rowIndex * 4);
      const rowEndGlobal = rowStartGlobal + 3;

      if (selectedMeasures.end < rowStartGlobal || selectedMeasures.start > rowEndGlobal) {
        return null;
      }

      const localStart = Math.max(0, selectedMeasures.start - rowStartGlobal);
      const localEnd = Math.min(3, selectedMeasures.end - rowStartGlobal);

      const showCloseButton = selectedMeasures.start >= rowStartGlobal &&
                               selectedMeasures.start <= rowEndGlobal;

      return (
        <div
          className="absolute inset-y-0 border-[3px] border-[#7BA7FF] pointer-events-none z-30 rounded"
          style={{
            left: `${(localStart / 4) * 100}%`,
            width: `${((localEnd - localStart + 1) / 4) * 100}%`,
          }}
        >
          {showCloseButton && (
            <button
              className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-[#7BA7FF] hover:bg-[#5B87DF] flex items-center justify-center pointer-events-auto transition-colors z-40"
              onClick={(e) => {
                e.stopPropagation();
                onSelectionChange?.(null);
              }}
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      );
    };

    const renderMeasure = (measure: Measure, localIndex: number) => {
      const globalMeasureIndex = globalMeasureOffset + localIndex;
      const isActiveMeasure = isCurrentSection && localIndex === currentMeasure;
      const isSelected = selectedMeasures
        ? globalMeasureIndex >= selectedMeasures.start && globalMeasureIndex <= selectedMeasures.end
        : false;

      // 마디 번호 (01, 02, 03... 형식)
      const measureNumber = getGlobalMeasureNumber(sectionIdx, localIndex);
      const measureNumberStr = measureNumber.toString().padStart(2, '0');

      return (
        <div
          key={localIndex}
          className="relative flex flex-1 items-center justify-start"
          onMouseDown={handleMouseDown(globalMeasureIndex)}
          onMouseEnter={() => handleMouseEnter(globalMeasureIndex)}
          style={{ cursor: 'pointer' }}
        >
          {/* 마디 번호 - 각 마디 좌측 상단 */}
          <div className="absolute top-1 left-2 text-xs text-gray-400 font-mono font-medium z-10">
            {measureNumberStr}
          </div>

          {/* 마디 구분선 (왼쪽) - FEED 스타일 */}
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
              {(() => {
                try {
                  const { nodes, count, isEmpty } = renderChordMeasure(measure.chord);

                  if (isEmpty) {
                    return measure.chord || '';
                  }

                  if (count === 1) {
                    return nodes[0];
                  }

                  return (
                    <div className="flex w-full justify-around px-1">
                      {nodes}
                    </div>
                  );
                } catch {
                  return measure.chord || '';
                }
              })()}
            </div>
          )}
        </div>
      );
    };

    // 각 줄 렌더링 - FEED SheetMusic 스타일 적용
    const renderRow = (rowMeasures: Measure[], rowIndex: number) => {
      const isFirstRow = rowIndex === 0;
      const rowStartIndex = rowIndex * 4;
      const isCurrentRow = isCurrentSection && activeRowInSection === rowIndex;

      return (
        <div
          key={rowIndex}
          ref={isCurrentRow ? currentRowRef : null}
          className={`flex items-stretch transition-all duration-500 ${rowIndex > 0 ? 'mt-3' : ''}`}
          style={{
            opacity: sectionOpacity,
            height: isCurrentSection ? "4.5rem" : "3.5rem",
          }}
        >
          {/* 왼쪽 섹션 라벨 영역 - FEED와 동일한 w-28 사용 */}
          {isFirstRow ? (
            <div
              className="mr-2 flex w-28 flex-col items-center justify-center self-stretch border-r-2 pr-2 transition-all duration-300"
              style={{
                borderColor: sectionColor,
                backgroundColor: `${sectionColor}15`,
              }}
            >
              <div
                className="text-xs font-medium transition-all duration-300"
                style={{
                  color: sectionColor,
                  fontSize: isCurrentSection ? "0.75rem" : "0.6875rem",
                }}
              >
                {section.label}
              </div>
              {isJamSection && (
                <div className="text-[10px] text-gray-400 mt-1">JAM</div>
              )}
            </div>
          ) : (
            <div className="mr-2 w-28 pr-2"></div>
          )}

          {/* 코드 영역 */}
          <div className="relative flex flex-1 items-center">
            {/* 섹션 라벨 탭 - FEED 스타일 (첫 번째 줄에만) */}
            {isFirstRow && (
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
            )}

            {/* JAM 섹션 배경 (은은한 코랄색) */}
            {isJamSection && (
              <div
                className="absolute inset-0 rounded-lg pointer-events-none"
                style={{
                  background: 'linear-gradient(180deg, rgba(255, 107, 107, 0.15) 0%, rgba(255, 107, 107, 0.05) 100%)',
                  border: '1px dashed rgba(255, 107, 107, 0.3)',
                }}
              />
            )}

            {/* 진행선 - FEED 스타일 (세로선만) */}
            {isCurrentRow && (
              <div
                className="absolute top-0 bottom-0 z-30 w-full transition-transform duration-100 ease-linear"
                style={{
                  transform: `translateX(${(measureInRow + measureProgress) * 25}%)`,
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

            {/* 마디들 */}
            <div className="relative z-20 flex h-full w-full">
              {rowMeasures.map((measure, measureIndex) =>
                renderMeasure(measure, rowStartIndex + measureIndex)
              )}
              {/* 오른쪽 마디 구분선 */}
              <div
                className="absolute right-0 top-0 bottom-0 w-1"
                style={{ backgroundColor: `${sectionColor}40` }}
              />
              {getRowOverlay(rowIndex)}
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
