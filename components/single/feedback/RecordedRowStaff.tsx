// components/single/feedback/RecordedRowStaff.tsx
'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Renderer, Stave, StaveNote, Voice, Formatter, Barline, Accidental } from 'vexflow';
import { NoteData } from '@/types/note';
import { DragType } from '@/types/edit';
import EditModeOverlay from './EditModeOverlay';
import NoteBox from './NoteBox';
import RestBox from './RestBox';
import SuggestedRangeOverlay from './SuggestedRangeOverlay';
import { useFeedbackStore } from '@/stores/feedbackStore';

interface RecordedRowStaffProps {
  notesPerMeasure: Record<number, NoteData[]>;
  rowStartMeasure: number;
  height?: number;
  isEditMode?: boolean;
  onNoteSelect?: (index: number, multiSelect: boolean) => void;
}

const CONFIDENCE_COLORS = {
  high: '#FFFFFF',
  medium: '#FFFFFF',  // 노란색 제거 - 모든 음표 동일 색상
  default: '#7BA7FF'
};

const RecordedRowStaff: React.FC<RecordedRowStaffProps> = ({
  notesPerMeasure,
  rowStartMeasure,
  height = 80,
  isEditMode = false,
  onNoteSelect
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Zustand store
  const {
    selectedNoteIndices,
    editedNotes,
    selectNote,
    setDragPreview,
    setIsDragging,
    updateNoteDuration,
    moveNote,
    dragPreview,
    // Smart Guide
    suggestedRanges,
    smartGuide,
    setSmartGuideHover,
    lockSmartGuidePitch,
    updateSmartGuidePreview,
    cancelSmartGuide,
    confirmSmartGuideNote,
  } = useFeedbackStore();

  // 드래그 상태
  const [currentDrag, setCurrentDrag] = useState<{
    noteIndex: number;
    dragType: DragType;
    startX: number;
    startSlotIndex: number;
    startSlotCount: number;
  } | null>(null);

  // 영역 선택 드래그 상태
  const [areaSelection, setAreaSelection] = useState<{
    startX: number;
    currentX: number;
    startMeasureOffset: number;
  } | null>(null);

  // 컨테이너 너비 측정
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Y→Pitch 변환 상수
  const STAVE_CENTER_Y = 35;
  const PIXELS_PER_SEMITONE = 2.5;
  const B4_MIDI = 71;
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // Y 좌표를 MIDI와 pitch로 변환
  const yToPitchInfo = useCallback((y: number): { midi: number; pitch: string } => {
    const semitoneOffset = (STAVE_CENTER_Y - y) / PIXELS_PER_SEMITONE;
    const midi = Math.round(B4_MIDI + semitoneOffset);
    const octave = Math.floor(midi / 12) - 1;
    const pitchClass = midi % 12;
    return { midi, pitch: NOTE_NAMES[pitchClass] + octave };
  }, []);

  // 이 row에 해당하는 SuggestedRanges 필터링
  const rangesForRow = useMemo(() => {
    return suggestedRanges.filter(
      r => r.measureIndex >= rowStartMeasure && r.measureIndex < rowStartMeasure + 4
    );
  }, [suggestedRanges, rowStartMeasure]);

  // Smart Guide 클릭 핸들러
  const handleSmartGuideClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();

    if (smartGuide.step === 'hovering' && smartGuide.hoverY !== null) {
      // 1차 클릭: 음정 확정
      const { midi, pitch } = yToPitchInfo(smartGuide.hoverY);
      lockSmartGuidePitch(pitch, midi);
    } else if (smartGuide.step === 'pitch_locked') {
      // 2차 클릭: 길이 확정 및 음표 생성
      confirmSmartGuideNote();
    }
  }, [smartGuide, yToPitchInfo, lockSmartGuidePitch, confirmSmartGuideNote]);

  // ESC 키 핸들러 (Smart Guide 취소)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && smartGuide.step !== 'idle') {
        cancelSmartGuide();
      } else if (e.key === 'Enter' && smartGuide.step === 'pitch_locked') {
        // Enter로도 확정 가능
        confirmSmartGuideNote();
      }
    };

    if (isEditMode) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isEditMode, smartGuide.step, cancelSmartGuide, confirmSmartGuideNote]);

  const measureWidth = containerWidth / 4;

  // VexFlow 렌더링 (기본 모드)
  useEffect(() => {
    if (!containerRef.current || containerWidth === 0 || isEditMode) return;

    const container = containerRef.current;
    container.innerHTML = '';

    try {
      const renderer = new Renderer(container, Renderer.Backends.SVG);
      renderer.resize(containerWidth, height);
      const context = renderer.getContext();

      const staveY = -5;
      const staves: Stave[] = [];

      for (let i = 0; i < 4; i++) {
        const x = i * measureWidth;
        const stave = new Stave(x, staveY, measureWidth);
        stave.setStyle({ strokeStyle: '#7BA7FF', fillStyle: '#7BA7FF' });
        if (i === 3) stave.setEndBarType(Barline.type.SINGLE);
        stave.setContext(context);
        stave.draw();
        staves.push(stave);
      }

      for (let i = 0; i < 4; i++) {
        const measureNumber = rowStartMeasure + i;
        const notes = notesPerMeasure[measureNumber];
        if (!notes || notes.length === 0) continue;

        const stave = staves[i];

        notes.forEach(n => {
          let staveNote: StaveNote;

          if (n.isRest) {
            // 쉼표 렌더링
            staveNote = new StaveNote({
              keys: ['b/4'],  // 쉼표는 위치가 고정됨
              duration: n.duration + 'r',  // 'q' -> 'qr' (rest)
              clef: 'treble'
            });
            staveNote.setStyle({ fillStyle: '#FF9500', strokeStyle: '#FF9500' });  // 오렌지색
          } else {
            // 음표 렌더링
            const pitchMatch = n.pitch.match(/^([A-G])([#b]?)(\d)$/);
            if (!pitchMatch) return;

            const [, noteName, accidental, octave] = pitchMatch;
            const vexKey = `${noteName.toLowerCase()}${accidental}/${octave}`;

            staveNote = new StaveNote({
              keys: [vexKey],
              duration: n.duration,
              clef: 'treble'
            });

            if (accidental === '#') staveNote.addModifier(new Accidental('#'));
            else if (accidental === 'b') staveNote.addModifier(new Accidental('b'));

            const noteColor = n.confidence === 'high'
              ? CONFIDENCE_COLORS.high
              : n.confidence === 'medium'
                ? CONFIDENCE_COLORS.medium
                : CONFIDENCE_COLORS.default;

            staveNote.setStyle({ fillStyle: noteColor, strokeStyle: noteColor });
          }

          // 슬롯 시작 위치 계산 (NoteBox와 일치)
          const slotWidth = measureWidth / 16;

          // NoteBox 위치 (목표 위치)
          const noteBoxLeft = i * measureWidth + n.slotIndex * slotWidth;

          // VexFlow 내부 오프셋 보정 (디버깅으로 확인된 값: 17px)
          const VEXFLOW_INTERNAL_OFFSET = 17;

          const voice = new Voice({ num_beats: 4, beat_value: 4 }).setStrict(false);
          voice.addTickables([staveNote]);
          new Formatter().joinVoices([voice]).format([voice], 0);
          staveNote.setStave(stave);

          const tickContext = staveNote.getTickContext();
          if (tickContext) tickContext.setX(noteBoxLeft - stave.getX() - VEXFLOW_INTERNAL_OFFSET);

          voice.draw(context, stave);
        });
      }
    } catch (e) {
      console.error("VexFlow rendering error:", e);
    }
  }, [notesPerMeasure, rowStartMeasure, height, containerWidth, measureWidth, isEditMode]);

  // 음표 클릭 핸들러
  const handleNoteClick = useCallback((noteIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const multiSelect = e.ctrlKey || e.metaKey;
    if (onNoteSelect) {
      onNoteSelect(noteIndex, multiSelect);
    } else {
      selectNote(noteIndex, multiSelect);
    }
  }, [onNoteSelect, selectNote]);

  // 드래그 시작
  const handleDragStart = useCallback((noteIndex: number, dragType: DragType, e: React.MouseEvent) => {
    const note = editedNotes[noteIndex];
    if (!note) return;

    setCurrentDrag({
      noteIndex,
      dragType,
      startX: e.clientX,
      startSlotIndex: note.slotIndex,
      startSlotCount: note.slotCount
    });
    setIsDragging(true);
  }, [editedNotes, setIsDragging]);

  // 드래그 종료
  const handleDragEnd = useCallback(() => {
    // 영역 선택 완료
    if (areaSelection && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const slotWidth = containerWidth / 64;

      const startRelX = areaSelection.startX - rect.left;
      const endRelX = areaSelection.currentX - rect.left;

      const startSlot = Math.floor(Math.min(startRelX, endRelX) / slotWidth);
      const endSlot = Math.ceil(Math.max(startRelX, endRelX) / slotWidth);

      // 선택 영역 내 음표들 찾기
      const selectedIndices: number[] = [];
      editedNotes.forEach((note, idx) => {
        if (note.isRest) return;

        const measureOffset = note.measureIndex - rowStartMeasure;
        if (measureOffset < 0 || measureOffset >= 4) return;

        const noteGlobalSlot = measureOffset * 16 + note.slotIndex;
        const noteEndSlot = noteGlobalSlot + note.slotCount;

        // 음표가 선택 영역과 겹치는지 확인
        if (noteGlobalSlot < endSlot && noteEndSlot > startSlot) {
          selectedIndices.push(idx);
        }
      });

      // 스토어에 선택 업데이트
      if (selectedIndices.length > 0) {
        selectedIndices.forEach((idx, i) => {
          const multiSelect = i > 0; // 첫 번째 이후는 다중선택
          if (onNoteSelect) {
            onNoteSelect(idx, multiSelect);
          } else {
            selectNote(idx, multiSelect);
          }
        });
      }

      setAreaSelection(null);
      return;
    }

    // 음표 드래그 완료
    if (!currentDrag) return;

    const { noteIndex, dragType, startSlotIndex, startSlotCount } = currentDrag;

    if (dragPreview) {
      if (dragType === 'resize') {
        const newSlotCount = dragPreview.slotCount;
        if (newSlotCount !== startSlotCount) {
          updateNoteDuration(noteIndex, newSlotCount);
        }
      } else if (dragType === 'move') {
        const newSlotIndex = dragPreview.slotIndex;
        if (newSlotIndex !== startSlotIndex) {
          moveNote(noteIndex, newSlotIndex, dragPreview.measureIndex);
        }
      }
    }

    setCurrentDrag(null);
    setDragPreview(null);
    setIsDragging(false);
  }, [currentDrag, dragPreview, areaSelection, containerWidth, editedNotes, rowStartMeasure, selectNote, updateNoteDuration, moveNote, setDragPreview, setIsDragging]);

  // 마우스 이동 (드래그 중)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;

    // 영역 선택 드래그 중
    if (areaSelection) {
      setAreaSelection(prev => prev ? { ...prev, currentX: e.clientX } : null);
      return;
    }

    // 음표 드래그 중
    if (!currentDrag) return;

    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const slotWidth = containerWidth / 64; // 4마디 × 16슬롯

    const { noteIndex, dragType, startSlotIndex, startSlotCount, startX } = currentDrag;
    const note = editedNotes[noteIndex];
    if (!note) return;

    const deltaX = e.clientX - startX;
    const deltaSlots = Math.round(deltaX / slotWidth);

    if (dragType === 'resize') {
      const newSlotCount = Math.max(1, Math.min(16, startSlotCount + deltaSlots));
      setDragPreview({
        slotIndex: note.slotIndex,
        slotCount: newSlotCount,
        measureIndex: note.measureIndex
      });
    } else if (dragType === 'move') {
      const globalSlot = Math.floor(relativeX / slotWidth);
      const measureOffset = Math.floor(globalSlot / 16);
      const newSlotIndex = globalSlot % 16;
      const newMeasureIndex = rowStartMeasure + measureOffset;

      setDragPreview({
        slotIndex: newSlotIndex,
        slotCount: note.slotCount,
        measureIndex: newMeasureIndex
      });
    }
  }, [currentDrag, areaSelection, containerWidth, editedNotes, rowStartMeasure, setDragPreview]);

  // 컨테이너 마우스다운 (영역 선택 시작)
  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    // 음표 박스 클릭이 아닌 경우에만 영역 선택 시작
    if ((e.target as HTMLElement).closest('[data-notebox]')) return;

    e.preventDefault(); // 드래그 시 화면 스크롤 방지

    setAreaSelection({
      startX: e.clientX,
      currentX: e.clientX,
      startMeasureOffset: 0
    });
  }, []);

  // 음표 전용 번호 매핑 (쉼표 제외, 1부터 시작)
  const noteDisplayNumbers = React.useMemo(() => {
    const map = new Map<number, number>();
    let noteNumber = 1;
    editedNotes.forEach((note, index) => {
      if (!note.isRest) {
        map.set(index, noteNumber++);
      }
    });
    return map;
  }, [editedNotes]);

  // 이 row에 해당하는 음표들 필터링 (editedNotes 기준)
  const getNotesForRow = () => {
    const rowNotes: { note: NoteData; globalIndex: number; measureOffset: number; displayNumber: number }[] = [];

    // editedNotes에서 현재 row에 해당하는 음표들 찾기
    editedNotes.forEach((note, globalIndex) => {
      // 이 row의 마디 범위: rowStartMeasure ~ rowStartMeasure + 3
      const measureOffset = note.measureIndex - rowStartMeasure;

      if (measureOffset >= 0 && measureOffset < 4 && !note.isRest) {
        rowNotes.push({
          note,
          globalIndex,
          measureOffset,
          displayNumber: noteDisplayNumbers.get(globalIndex) || 0
        });
      }
    });

    return rowNotes;
  };

  // 이 row에 해당하는 쉼표들 필터링
  const getRestsForRow = () => {
    const rowRests: { note: NoteData; globalIndex: number; measureOffset: number }[] = [];

    editedNotes.forEach((note, globalIndex) => {
      const measureOffset = note.measureIndex - rowStartMeasure;

      if (measureOffset >= 0 && measureOffset < 4 && note.isRest) {
        rowRests.push({ note, globalIndex, measureOffset });
      }
    });

    return rowRests;
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        pointerEvents: isEditMode ? 'auto' : 'none',
        userSelect: isEditMode ? 'none' : 'auto',
        WebkitUserSelect: isEditMode ? 'none' : 'auto'
      }}
      onMouseDown={isEditMode ? handleContainerMouseDown : undefined}
      onMouseMove={isEditMode ? handleMouseMove : undefined}
      onMouseUp={isEditMode ? handleDragEnd : undefined}
      onMouseLeave={isEditMode ? handleDragEnd : undefined}
    >
      {/* 편집 모드일 때 추가 UI */}
      {isEditMode && containerWidth > 0 && (
        <>
          {/* 4마디 각각에 EditModeOverlay */}
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className="absolute top-0 bottom-0"
              style={{ left: `${i * measureWidth}px`, width: `${measureWidth}px` }}
            >
              <EditModeOverlay measureWidth={measureWidth} height={height} />
            </div>
          ))}

          {/* 쉼표 박스들 */}
          {getRestsForRow().map(({ note, globalIndex, measureOffset }) => (
            <div
              key={`rest-${globalIndex}`}
              className="absolute top-0 bottom-0"
              style={{
                left: `${measureOffset * measureWidth}px`,
                width: `${measureWidth}px`
              }}
            >
              <RestBox
                note={note}
                measureWidth={measureWidth}
                containerHeight={height}
              />
            </div>
          ))}

          {/* Smart Guide: SuggestedRange 오버레이 */}
          {rangesForRow.length > 0 && (
            <svg
              className="absolute top-0 left-0"
              width={containerWidth}
              height={height}
              style={{ overflow: 'visible', pointerEvents: 'none' }}
            >
              {rangesForRow.map(range => {
                const measureOffset = range.measureIndex - rowStartMeasure;
                const measureStartX = measureOffset * measureWidth;

                return (
                  <SuggestedRangeOverlay
                    key={`range-${range.measureIndex}-${range.startSlot}`}
                    range={range}
                    measureWidth={measureWidth}
                    measureStartX={measureStartX}
                    smartGuide={smartGuide}
                    staveHeight={height}
                    onMouseMove={(y, x) => setSmartGuideHover(range, y, x)}
                    onMouseLeave={() => setSmartGuideHover(null, null)}
                    onClick={handleSmartGuideClick}
                  />
                );
              })}
            </svg>
          )}

          {/* 음표 박스들 */}
          {getNotesForRow().map(({ note, globalIndex, measureOffset, displayNumber }) => (
            <div
              key={`${note.measureIndex}-${note.slotIndex}-${note.pitch}`}
              className="absolute top-0 bottom-0"
              style={{
                left: `${measureOffset * measureWidth}px`,
                width: `${measureWidth}px`
              }}
            >
              <NoteBox
                note={note}
                noteIndex={globalIndex}
                displayNumber={displayNumber}
                measureWidth={measureWidth}
                containerHeight={height}
                isSelected={selectedNoteIndices.includes(globalIndex)}
                onClick={(e) => handleNoteClick(globalIndex, e)}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
            </div>
          ))}

          {/* 드래그 프리뷰 */}
          {dragPreview && currentDrag && (
            <div
              className="absolute bg-[#7BA7FF]/20 border border-dashed border-[#7BA7FF] rounded-[2px] pointer-events-none"
              style={{
                left: `${(dragPreview.measureIndex - rowStartMeasure) * measureWidth + (dragPreview.slotIndex / 16) * measureWidth}px`,
                width: `${(dragPreview.slotCount / 16) * measureWidth - 2}px`,
                height: '8px',
                top: '35px', // VexFlow 오선보 중심
                transform: 'translateY(-50%)',
                zIndex: 30
              }}
            />
          )}

          {/* 영역 선택 박스 */}
          {areaSelection && containerRef.current && (() => {
            const rect = containerRef.current.getBoundingClientRect();
            const startX = Math.min(areaSelection.startX, areaSelection.currentX) - rect.left;
            const endX = Math.max(areaSelection.startX, areaSelection.currentX) - rect.left;
            const width = endX - startX;
            return (
              <div
                className="absolute bg-[#7BA7FF]/10 border border-[#7BA7FF] rounded pointer-events-none"
                style={{
                  left: `${startX}px`,
                  width: `${width}px`,
                  top: 0,
                  bottom: 0,
                  zIndex: 25
                }}
              />
            );
          })()}
        </>
      )}
    </div>
  );
};

export default RecordedRowStaff;
