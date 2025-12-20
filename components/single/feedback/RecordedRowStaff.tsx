// components/single/feedback/RecordedRowStaff.tsx
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Renderer, Stave, StaveNote, Voice, Formatter, Barline, Accidental } from 'vexflow';
import { NoteData } from '@/types/note';
import { DragType } from '@/types/edit';
import EditModeOverlay from './EditModeOverlay';
import NoteBox from './NoteBox';
import RestBox from './RestBox';
import { useFeedbackStore } from '@/stores/feedbackStore';

interface RecordedRowStaffProps {
  notesPerMeasure: Record<number, NoteData[]>;
  rowStartMeasure: number;
  height?: number;
  isEditMode?: boolean;
}

const CONFIDENCE_COLORS = {
  high: '#FFFFFF',
  medium: '#FFD700',
  default: '#7BA7FF'
};

const RecordedRowStaff: React.FC<RecordedRowStaffProps> = ({
  notesPerMeasure,
  rowStartMeasure,
  height = 80,
  isEditMode = false
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
    dragPreview
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
          if (n.isRest) return;

          const pitchMatch = n.pitch.match(/^([A-G])([#b]?)(\d)$/);
          if (!pitchMatch) return;

          const [, noteName, accidental, octave] = pitchMatch;
          const vexKey = `${noteName.toLowerCase()}${accidental}/${octave}`;

          const staveNote = new StaveNote({
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

          const slotRatio = n.slotIndex / 16;
          const rowProgress = (i + slotRatio) / 4;
          const noteX = rowProgress * containerWidth;

          const voice = new Voice({ num_beats: 4, beat_value: 4 }).setStrict(false);
          voice.addTickables([staveNote]);
          new Formatter().joinVoices([voice]).format([voice], 0);
          staveNote.setStave(stave);

          const tickContext = staveNote.getTickContext();
          if (tickContext) tickContext.setX(noteX - stave.getX());

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
    selectNote(noteIndex, e.ctrlKey || e.metaKey);
  }, [selectNote]);

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
          selectNote(idx, i > 0); // 첫 번째 이후는 다중선택
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

  // 이 row에 해당하는 음표들 필터링 (editedNotes 기준)
  const getNotesForRow = () => {
    const rowNotes: { note: NoteData; globalIndex: number; measureOffset: number }[] = [];

    // editedNotes에서 현재 row에 해당하는 음표들 찾기
    editedNotes.forEach((note, globalIndex) => {
      // 이 row의 마디 범위: rowStartMeasure ~ rowStartMeasure + 3
      const measureOffset = note.measureIndex - rowStartMeasure;

      if (measureOffset >= 0 && measureOffset < 4 && !note.isRest) {
        rowNotes.push({ note, globalIndex, measureOffset });
      }
    });

    // 디버그 로그 (첫 렌더링 시에만)
    if (rowNotes.length > 0 && isEditMode) {
      console.log('[RecordedRowStaff] getNotesForRow:', {
        rowStartMeasure,
        totalEditedNotes: editedNotes.length,
        notesInThisRow: rowNotes.length,
        notes: rowNotes.map(n => ({ idx: n.globalIndex, pitch: n.note.pitch, slot: n.note.slotIndex }))
      });
    }

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
              key={`rest-${note.measureIndex}-${note.slotIndex}-${globalIndex}`}
              className="absolute top-0 bottom-0"
              style={{
                left: `${measureOffset * measureWidth}px`,
                width: `${measureWidth}px`
              }}
            >
              <RestBox
                note={note}
                noteIndex={globalIndex}
                measureWidth={measureWidth}
                containerHeight={height}
              />
            </div>
          ))}

          {/* 음표 박스들 */}
          {getNotesForRow().map(({ note, globalIndex, measureOffset }) => (
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
              className="absolute bg-[#7BA7FF]/20 border border-dashed border-[#7BA7FF] rounded-sm pointer-events-none"
              style={{
                left: `${(dragPreview.measureIndex - rowStartMeasure) * measureWidth + (dragPreview.slotIndex / 16) * measureWidth}px`,
                width: `${(dragPreview.slotCount / 16) * measureWidth - 2}px`,
                height: '12px',
                top: '50%',
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
