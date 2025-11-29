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
  const currentRowRef = useRef<HTMLDivElement>(null);

  // DEBUG: sections 구조 확인 (첫 렌더링 시에만)
  useEffect(() => {
    console.log('🎼 [SheetMusic] sections 구조:', {
      totalSections: sections.length,
      sections: sections.map((s, idx) => ({
        index: idx,
        id: s.id,
        label: s.label,
        user: s.user,
        measuresCount: s.measures.length,
        // 첫 4마디의 코드 데이터 샘플
        sampleChords: s.measures.slice(0, 4).map(m => m.chord),
      }))
    });
  }, [sections.length]);

  // 현재 줄 인덱스 계산 (4마디 = 1줄)
  const currentRowIndex = useMemo(() => {
    return Math.floor(currentMeasure / 4);
  }, [currentMeasure]);

  // DEBUG: currentMeasure 변경 로그
  console.log('🎼 [SheetMusic] currentMeasure:', currentMeasure, 'sectionIndex:', currentSectionIndex, 'rowIndex:', currentRowIndex, 'measureProgress:', measureProgress.toFixed(2));

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

  // 🎵 현재 줄(row) 기반 자동 스크롤 (줄이 바뀔 때만)
  useEffect(() => {
    if (currentRowRef.current && containerRef.current) {
      const container = containerRef.current;
      const currentRow = currentRowRef.current;
      const containerHeight = container.clientHeight;
      const rowTop = currentRow.offsetTop;
      const rowHeight = currentRow.clientHeight;

      // 현재 줄이 화면 중앙에 오도록 스크롤
      const scrollPosition = rowTop - containerHeight / 2 + rowHeight / 2;

      console.log('📜 [SheetMusic] 자동 스크롤:', {
        currentSectionIndex,
        currentRowIndex,
        rowTop,
        scrollPosition: Math.max(0, scrollPosition)
      });

      container.scrollTo({
        top: Math.max(0, scrollPosition),
        behavior: "smooth",
      });
    }
  }, [currentSectionIndex, currentRowIndex]); // 줄이 바뀔 때만 스크롤

  const renderSection = (section: Section, sectionIdx: number) => {
    const globalMeasureOffset = sections
      .slice(0, sectionIdx)
      .reduce((total, s) => total + s.measures.length, 0);

    const isCurrentSection = sectionIdx === currentSectionIndex;
    const sectionColor = section.color;
    const sectionOpacity = isCurrentSection ? 1 : 0.5;

    const measures = section.measures;

    // 모든 마디를 4마디씩 청크로 분할
    const rows: Measure[][] = [];
    for (let i = 0; i < measures.length; i += 4) {
      const chunk = measures.slice(i, i + 4);
      // 4개 미만이면 빈 마디로 패딩
      while (chunk.length < 4) {
        chunk.push({ chord: '' });
      }
      rows.push(chunk);
    }

    const sectionStart = globalMeasureOffset;
    const sectionEnd = globalMeasureOffset + section.measures.length - 1;

    // 현재 마디가 속한 줄 계산 (이 섹션이 활성 섹션일 때)
    const activeRowInSection = isCurrentSection ? Math.floor(currentMeasure / 4) : -1;
    const measureInRow = isCurrentSection ? currentMeasure % 4 : 0;

    // 선택 영역 계산 함수
    const getRowOverlay = (rowIndex: number) => {
      if (!selectedMeasures) return null;

      const rowStartGlobal = globalMeasureOffset + (rowIndex * 4);
      const rowEndGlobal = rowStartGlobal + 3;

      // 이 줄과 선택 영역이 겹치는지 확인
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

    // 각 줄 렌더링 함수
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
          {/* 왼쪽 라벨 영역 - 첫 번째 줄에만 표시 */}
          {isFirstRow ? (
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
          ) : (
            <div className="mr-2 w-28 pr-2"></div>
          )}

          {/* 코드 영역 */}
          <div className="relative flex flex-1 items-center">
            {/* 섹션 라벨 - 첫 번째 줄에만 표시 */}
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

            {/* 진행선 - 현재 줄에만 표시 */}
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
      <div key={section.id} className="mb-6" ref={isCurrentSection ? currentSectionRef : null}>
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
