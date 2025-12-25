import { create } from 'zustand';
import { NoteData } from '@/types/note';
import { EditAction, DragPreview } from '@/types/edit';
import { ConversionState, INITIAL_CONVERSION_STATE } from '@/types/instrument';

// 음정 순서 (반음 단위)
const NOTE_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MIN_OCTAVE = 2;
const MAX_OCTAVE = 6;
const MAX_UNDO_STEPS = 10;
const SLOTS_PER_MEASURE = 16;

interface FeedbackState {
  // 모드
  isEditMode: boolean;
  showEditPanel: boolean;

  // 선택
  selectedNoteIndices: number[];

  // 데이터
  originalNotes: NoteData[];
  editedNotes: NoteData[];

  // Undo/Redo
  undoStack: EditAction[];
  redoStack: EditAction[];

  // 드래그
  isDragging: boolean;
  dragPreview: DragPreview | null;

  // 악기 변환
  conversionState: ConversionState;
  instrumentOnlyMode: boolean;  // true: 변환된 악기만, false: 배경음악 + 악기

  // Actions
  setEditMode: (mode: boolean) => void;
  toggleEditPanel: () => void;

  selectNote: (index: number, multiSelect?: boolean) => void;
  selectNotesByArea: (startSlot: number, endSlot: number, measureIndex: number) => void;
  clearSelection: () => void;

  updateNotePitch: (direction: 'up' | 'down') => void;
  updateNotePosition: (direction: 'left' | 'right') => void;
  updateNoteDuration: (noteIndex: number, newSlotCount: number) => void;
  updateSelectedNotesDuration: (direction: 'increase' | 'decrease') => void;
  moveNote: (noteIndex: number, newSlotIndex: number, newMeasureIndex?: number) => void;
  deleteSelectedNotes: () => void;

  undo: () => void;
  redo: () => void;
  reset: () => void;

  setDragPreview: (preview: DragPreview | null) => void;
  setIsDragging: (dragging: boolean) => void;
  initializeNotes: (notes: NoteData[]) => void;
  getCleanedNotes: () => NoteData[];  // 편집 확정용: 정리된 음표+쉼표 반환

  // 악기 변환 Actions
  setConversionState: (state: Partial<ConversionState>) => void;
  toggleInstrumentOnlyMode: () => void;
  resetConversionState: () => void;
}

// 헬퍼 함수들
function parsePitch(pitch: string): { note: string; octave: number } | null {
  if (pitch === 'rest') return null;
  const match = pitch.match(/^([A-G]#?)(\d)$/);
  if (!match) return null;
  return { note: match[1], octave: parseInt(match[2]) };
}

function shiftPitch(pitch: string, direction: 'up' | 'down'): string | null {
  const parsed = parsePitch(pitch);
  if (!parsed) return null;

  let noteIndex = NOTE_ORDER.indexOf(parsed.note);
  let octave = parsed.octave;

  if (direction === 'up') {
    noteIndex++;
    if (noteIndex >= NOTE_ORDER.length) {
      noteIndex = 0;
      octave++;
    }
  } else {
    noteIndex--;
    if (noteIndex < 0) {
      noteIndex = NOTE_ORDER.length - 1;
      octave--;
    }
  }

  // 범위 체크
  if (octave < MIN_OCTAVE || octave > MAX_OCTAVE) return null;

  return `${NOTE_ORDER[noteIndex]}${octave}`;
}

function slotCountToDuration(slotCount: number): string {
  if (slotCount >= 16) return 'w';
  if (slotCount >= 8) return 'h';
  if (slotCount >= 4) return 'q';
  if (slotCount >= 2) return '8';
  return '16';
}

// 편집 후 정리: 겹치는 쉼표 제거 + 연속 쉼표 병합
function cleanupNotesAndRests(notes: NoteData[]): NoteData[] {
  if (notes.length === 0) return [];

  // 마디별로 그룹핑 (실제 존재하는 마디만)
  const notesByMeasure = new Map<number, NoteData[]>();
  const measureIndices = new Set<number>();

  notes.forEach(note => {
    const measure = note.measureIndex;
    measureIndices.add(measure);
    if (!notesByMeasure.has(measure)) {
      notesByMeasure.set(measure, []);
    }
    notesByMeasure.get(measure)!.push(note);
  });

  const result: NoteData[] = [];

  // 실제 존재하는 마디만 처리 (0부터 순회하지 않음)
  for (const measureIndex of Array.from(measureIndices).sort((a, b) => a - b)) {
    const measureNotes = notesByMeasure.get(measureIndex) || [];
    if (measureNotes.length === 0) continue;

    // 음표와 쉼표 분리
    const actualNotes = measureNotes.filter(n => !n.isRest);

    // 음표가 차지하는 슬롯 마킹 (슬롯 오버플로우 방지)
    const occupied: boolean[] = new Array(SLOTS_PER_MEASURE).fill(false);
    actualNotes.forEach(note => {
      // slotIndex와 slotCount 범위 제한
      const safeSlotIndex = Math.max(0, Math.min(note.slotIndex, SLOTS_PER_MEASURE - 1));
      const maxSlotCount = SLOTS_PER_MEASURE - safeSlotIndex;
      const safeSlotCount = Math.max(1, Math.min(note.slotCount, maxSlotCount));

      // 범위가 수정되었으면 노트도 수정
      const fixedNote = (safeSlotIndex !== note.slotIndex || safeSlotCount !== note.slotCount)
        ? { ...note, slotIndex: safeSlotIndex, slotCount: safeSlotCount, duration: slotCountToDuration(safeSlotCount) }
        : note;

      for (let i = fixedNote.slotIndex; i < fixedNote.slotIndex + fixedNote.slotCount; i++) {
        occupied[i] = true;
      }
      result.push(fixedNote);
    });

    // 빈 슬롯을 연속된 쉼표로 채우기 (기존 쉼표 무시하고 새로 생성)
    let gapStart = -1;
    for (let slot = 0; slot <= SLOTS_PER_MEASURE; slot++) {
      const isOccupied = slot < SLOTS_PER_MEASURE ? occupied[slot] : true;

      if (!isOccupied && gapStart === -1) {
        gapStart = slot;
      } else if (isOccupied && gapStart !== -1) {
        // 연속된 빈 구간 → 하나의 쉼표로
        const gapLength = slot - gapStart;
        const restNote: NoteData = {
          pitch: 'rest',
          duration: slotCountToDuration(gapLength),
          beat: measureIndex * 4 + gapStart / 4,
          measureIndex,
          slotIndex: gapStart,
          slotCount: gapLength,
          isRest: true,
          confidence: 'high'
        };
        result.push(restNote);
        gapStart = -1;
      }
    }
  }

  // measureIndex와 slotIndex로 정렬
  result.sort((a, b) => {
    if (a.measureIndex !== b.measureIndex) return a.measureIndex - b.measureIndex;
    return a.slotIndex - b.slotIndex;
  });

  // 겹침 검증 및 제거 (음표 우선, 쉼표는 겹치면 제거)
  const validated: NoteData[] = [];
  const slotMap = new Map<string, NoteData>(); // "measureIndex-slot" -> note

  // 먼저 음표 처리 (음표가 우선권)
  result.filter(n => !n.isRest).forEach(note => {
    for (let s = note.slotIndex; s < note.slotIndex + note.slotCount; s++) {
      slotMap.set(`${note.measureIndex}-${s}`, note);
    }
    validated.push(note);
  });

  // 쉼표는 겹치는 슬롯이 없는 경우만 추가
  result.filter(n => n.isRest).forEach(rest => {
    let hasOverlap = false;
    for (let s = rest.slotIndex; s < rest.slotIndex + rest.slotCount; s++) {
      if (slotMap.has(`${rest.measureIndex}-${s}`)) {
        hasOverlap = true;
        break;
      }
    }
    if (!hasOverlap) {
      for (let s = rest.slotIndex; s < rest.slotIndex + rest.slotCount; s++) {
        slotMap.set(`${rest.measureIndex}-${s}`, rest);
      }
      validated.push(rest);
    } else {
      console.warn('[FeedbackStore] Removed overlapping rest:', rest);
    }
  });

  // 다시 정렬
  validated.sort((a, b) => {
    if (a.measureIndex !== b.measureIndex) return a.measureIndex - b.measureIndex;
    return a.slotIndex - b.slotIndex;
  });

  console.log('[FeedbackStore] cleanupNotesAndRests:', {
    inputNotes: notes.length,
    beforeValidation: result.length,
    afterValidation: validated.length,
    notes: validated.filter(n => !n.isRest).length,
    rests: validated.filter(n => n.isRest).length
  });

  return validated;
}

// 빈 슬롯을 쉼표로 채우는 함수
function fillGapsWithRests(notes: NoteData[]): NoteData[] {
  if (notes.length === 0) return [];

  // 마디별로 그룹핑 (실제 존재하는 마디만)
  const notesByMeasure = new Map<number, NoteData[]>();
  const measureIndices = new Set<number>();

  notes.forEach(note => {
    if (!note.isRest) {
      const measure = note.measureIndex;
      measureIndices.add(measure);
      if (!notesByMeasure.has(measure)) {
        notesByMeasure.set(measure, []);
      }
      notesByMeasure.get(measure)!.push(note);
    }
  });

  const result: NoteData[] = [];

  // 실제 존재하는 마디만 처리 (0부터 순회하지 않음)
  for (const measureIndex of Array.from(measureIndices).sort((a, b) => a - b)) {
    const measureNotes = notesByMeasure.get(measureIndex) || [];

    // 슬롯 점유 상태 추적 (0~15)
    const occupied: boolean[] = new Array(SLOTS_PER_MEASURE).fill(false);

    // 음표가 차지하는 슬롯 마킹 (슬롯 오버플로우 방지)
    measureNotes.forEach(note => {
      // slotIndex와 slotCount 범위 제한
      const safeSlotIndex = Math.max(0, Math.min(note.slotIndex, SLOTS_PER_MEASURE - 1));
      const maxSlotCount = SLOTS_PER_MEASURE - safeSlotIndex;
      const safeSlotCount = Math.max(1, Math.min(note.slotCount, maxSlotCount));

      // 범위가 수정되었으면 노트도 수정
      const fixedNote = (safeSlotIndex !== note.slotIndex || safeSlotCount !== note.slotCount)
        ? { ...note, slotIndex: safeSlotIndex, slotCount: safeSlotCount, duration: slotCountToDuration(safeSlotCount) }
        : note;

      for (let i = fixedNote.slotIndex; i < fixedNote.slotIndex + fixedNote.slotCount; i++) {
        occupied[i] = true;
      }
      result.push(fixedNote);
    });

    // 빈 슬롯을 쉼표로 채우기 (연속된 빈 슬롯은 하나의 쉼표로)
    let gapStart = -1;
    for (let slot = 0; slot <= SLOTS_PER_MEASURE; slot++) {
      const isOccupied = slot < SLOTS_PER_MEASURE ? occupied[slot] : true; // 마지막은 항상 종료

      if (!isOccupied && gapStart === -1) {
        // 빈 구간 시작
        gapStart = slot;
      } else if (isOccupied && gapStart !== -1) {
        // 빈 구간 종료 → 쉼표 생성
        const gapLength = slot - gapStart;
        const restNote: NoteData = {
          pitch: 'rest',
          duration: slotCountToDuration(gapLength),
          beat: measureIndex * 4 + gapStart / 4,
          measureIndex,
          slotIndex: gapStart,
          slotCount: gapLength,
          isRest: true,
          confidence: 'high'
        };
        result.push(restNote);
        gapStart = -1;
      }
    }
  }

  // measureIndex와 slotIndex로 정렬
  result.sort((a, b) => {
    if (a.measureIndex !== b.measureIndex) return a.measureIndex - b.measureIndex;
    return a.slotIndex - b.slotIndex;
  });

  console.log('[FeedbackStore] fillGapsWithRests:', {
    inputNotes: notes.length,
    outputNotes: result.length,
    rests: result.filter(n => n.isRest).length
  });

  return result;
}

// 충돌 처리: 이동/리사이즈된 음표와 겹치는 다른 음표들을 잘라냄
function handleCollisions(
  notes: NoteData[],
  movedNoteIndex: number,
  movedNoteStart: number,  // slotIndex
  movedNoteEnd: number,    // slotIndex + slotCount
  movedNoteMeasure: number
): { notes: NoteData[]; trimmedIndices: number[]; trimmedBefore: Partial<NoteData>[]; trimmedAfter: Partial<NoteData>[] } {
  const newNotes = [...notes];
  const trimmedIndices: number[] = [];
  const trimmedBefore: Partial<NoteData>[] = [];
  const trimmedAfter: Partial<NoteData>[] = [];

  newNotes.forEach((note, idx) => {
    // 자기 자신은 제외
    if (idx === movedNoteIndex) return;
    // 쉼표는 제외
    if (note.isRest) return;
    // 다른 마디는 제외
    if (note.measureIndex !== movedNoteMeasure) return;

    const noteStart = note.slotIndex;
    const noteEnd = note.slotIndex + note.slotCount;

    // 겹침 확인
    if (noteStart < movedNoteEnd && noteEnd > movedNoteStart) {
      // 충돌 발생!
      trimmedIndices.push(idx);
      // Undo를 위해 원본 데이터 전체 저장 (pitch, isRest 포함)
      trimmedBefore.push({
        slotIndex: note.slotIndex,
        slotCount: note.slotCount,
        duration: note.duration,
        pitch: note.pitch,
        isRest: note.isRest,
        confidence: note.confidence
      });

      // Case 1: 이동된 음표가 완전히 덮음 → 삭제 (쉼표로 변환)
      if (movedNoteStart <= noteStart && movedNoteEnd >= noteEnd) {
        newNotes[idx] = { ...note, pitch: 'rest', isRest: true, confidence: 'high' };
        trimmedAfter.push({ pitch: 'rest', isRest: true, confidence: 'high' });
      }
      // Case 2: 왼쪽에서 겹침 → 오른쪽으로 밀고 줄임
      else if (movedNoteStart <= noteStart && movedNoteEnd > noteStart) {
        const newStart = movedNoteEnd;
        const newCount = noteEnd - newStart;
        if (newCount < 1) {
          newNotes[idx] = { ...note, pitch: 'rest', isRest: true, confidence: 'high' };
          trimmedAfter.push({ pitch: 'rest', isRest: true, confidence: 'high' });
        } else {
          newNotes[idx] = {
            ...note,
            slotIndex: newStart,
            slotCount: newCount,
            duration: slotCountToDuration(newCount),
            beat: note.measureIndex * 4 + newStart / 4
          };
          trimmedAfter.push({ slotIndex: newStart, slotCount: newCount, duration: slotCountToDuration(newCount) });
        }
      }
      // Case 3: 오른쪽에서 겹침 → 길이만 줄임
      else if (movedNoteStart < noteEnd && movedNoteEnd >= noteEnd) {
        const newCount = movedNoteStart - noteStart;
        if (newCount < 1) {
          newNotes[idx] = { ...note, pitch: 'rest', isRest: true, confidence: 'high' };
          trimmedAfter.push({ pitch: 'rest', isRest: true, confidence: 'high' });
        } else {
          newNotes[idx] = {
            ...note,
            slotCount: newCount,
            duration: slotCountToDuration(newCount)
          };
          trimmedAfter.push({ slotCount: newCount, duration: slotCountToDuration(newCount) });
        }
      }
      // Case 4: 중간에 겹침 (이동된 음표가 기존 음표 안에 있음) → 앞부분만 남김
      else {
        const newCount = movedNoteStart - noteStart;
        if (newCount < 1) {
          newNotes[idx] = { ...note, pitch: 'rest', isRest: true, confidence: 'high' };
          trimmedAfter.push({ pitch: 'rest', isRest: true, confidence: 'high' });
        } else {
          newNotes[idx] = {
            ...note,
            slotCount: newCount,
            duration: slotCountToDuration(newCount)
          };
          trimmedAfter.push({ slotCount: newCount, duration: slotCountToDuration(newCount) });
        }
      }
    }
  });

  return { notes: newNotes, trimmedIndices, trimmedBefore, trimmedAfter };
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  // 초기 상태
  isEditMode: false,
  showEditPanel: false,
  selectedNoteIndices: [],
  originalNotes: [],
  editedNotes: [],
  undoStack: [],
  redoStack: [],
  isDragging: false,
  dragPreview: null,
  conversionState: INITIAL_CONVERSION_STATE,
  instrumentOnlyMode: false,

  // 모드 전환
  setEditMode: (mode) => set({
    isEditMode: mode,
    showEditPanel: mode,
    selectedNoteIndices: mode ? get().selectedNoteIndices : []
  }),

  toggleEditPanel: () => set((state) => ({
    showEditPanel: !state.showEditPanel,
    isEditMode: !state.showEditPanel
  })),

  // 선택
  selectNote: (index, multiSelect = false) => set((state) => {
    console.log('[Store] selectNote called:', { index, multiSelect, currentSelection: state.selectedNoteIndices });
    if (multiSelect) {
      const isSelected = state.selectedNoteIndices.includes(index);
      const newSelection = isSelected
        ? state.selectedNoteIndices.filter(i => i !== index)
        : [...state.selectedNoteIndices, index];
      console.log('[Store] Multi-select result:', newSelection);
      return { selectedNoteIndices: newSelection };
    }
    console.log('[Store] Single select result:', [index]);
    return { selectedNoteIndices: [index] };
  }),

  selectNotesByArea: (startSlot, endSlot, measureIndex) => set((state) => {
    const minSlot = Math.min(startSlot, endSlot);
    const maxSlot = Math.max(startSlot, endSlot);

    const selectedIndices = state.editedNotes
      .map((note, index) => ({ note, index }))
      .filter(({ note }) =>
        note.measureIndex === measureIndex &&
        !note.isRest &&
        note.slotIndex >= minSlot &&
        note.slotIndex < maxSlot
      )
      .map(({ index }) => index);

    return { selectedNoteIndices: selectedIndices };
  }),

  clearSelection: () => set({ selectedNoteIndices: [] }),

  // 음정 조정
  updateNotePitch: (direction) => set((state) => {
    if (state.selectedNoteIndices.length === 0) return state;

    const before: Partial<NoteData>[] = [];
    const after: Partial<NoteData>[] = [];
    const newNotes = [...state.editedNotes];

    for (const index of state.selectedNoteIndices) {
      const note = newNotes[index];
      if (note.isRest) continue;

      const newPitch = shiftPitch(note.pitch, direction);
      if (!newPitch) continue;

      before.push({ pitch: note.pitch });
      after.push({ pitch: newPitch });

      newNotes[index] = { ...note, pitch: newPitch };
    }

    if (before.length === 0) return state;

    const action: EditAction = {
      type: 'pitch',
      noteIndices: state.selectedNoteIndices.filter(i => !state.editedNotes[i].isRest),
      before,
      after
    };

    return {
      editedNotes: newNotes,
      undoStack: [...state.undoStack.slice(-MAX_UNDO_STEPS + 1), action],
      redoStack: []
    };
  }),

  // 위치 조정 (충돌 처리 포함)
  updateNotePosition: (direction) => set((state) => {
    if (state.selectedNoteIndices.length === 0) return state;

    const before: Partial<NoteData>[] = [];
    const after: Partial<NoteData>[] = [];
    let newNotes = [...state.editedNotes];
    const delta = direction === 'right' ? 1 : -1;

    // 모든 충돌 처리 기록
    const allTrimmedIndices: number[] = [];
    const allTrimmedBefore: Partial<NoteData>[] = [];
    const allTrimmedAfter: Partial<NoteData>[] = [];

    for (const index of state.selectedNoteIndices) {
      const note = newNotes[index];
      if (note.isRest) continue;

      let newSlotIndex = note.slotIndex + delta;
      let newMeasureIndex = note.measureIndex;

      // 마디 경계 처리
      if (newSlotIndex < 0) {
        newSlotIndex = SLOTS_PER_MEASURE - 1;
        newMeasureIndex--;
      } else if (newSlotIndex >= SLOTS_PER_MEASURE) {
        newSlotIndex = 0;
        newMeasureIndex++;
      }

      // 음수 마디는 허용하지 않음
      if (newMeasureIndex < 0) continue;

      before.push({ slotIndex: note.slotIndex, measureIndex: note.measureIndex });
      after.push({ slotIndex: newSlotIndex, measureIndex: newMeasureIndex });

      newNotes[index] = {
        ...note,
        slotIndex: newSlotIndex,
        measureIndex: newMeasureIndex,
        beat: newMeasureIndex * 4 + newSlotIndex / 4
      };

      // 충돌 처리
      const collision = handleCollisions(
        newNotes,
        index,
        newSlotIndex,
        newSlotIndex + note.slotCount,
        newMeasureIndex
      );
      newNotes = collision.notes;

      // 충돌 기록 저장 (Undo용)
      collision.trimmedIndices.forEach((ti, i) => {
        if (!allTrimmedIndices.includes(ti)) {
          allTrimmedIndices.push(ti);
          allTrimmedBefore.push(collision.trimmedBefore[i]);
          allTrimmedAfter.push(collision.trimmedAfter[i]);
        }
      });
    }

    if (before.length === 0) return state;

    const action: EditAction = {
      type: 'position',
      noteIndices: [...state.selectedNoteIndices.filter(i => !state.editedNotes[i].isRest), ...allTrimmedIndices],
      before: [...before, ...allTrimmedBefore],
      after: [...after, ...allTrimmedAfter]
    };

    return {
      editedNotes: newNotes,
      undoStack: [...state.undoStack.slice(-MAX_UNDO_STEPS + 1), action],
      redoStack: []
    };
  }),

  // 선택된 음표들 길이 조정 (Shift + 화살표)
  updateSelectedNotesDuration: (direction) => set((state) => {
    if (state.selectedNoteIndices.length === 0) return state;

    const delta = direction === 'increase' ? 1 : -1;
    const before: Partial<NoteData>[] = [];
    const after: Partial<NoteData>[] = [];
    let newNotes = [...state.editedNotes];

    // 모든 충돌 처리 기록
    const allTrimmedIndices: number[] = [];
    const allTrimmedBefore: Partial<NoteData>[] = [];
    const allTrimmedAfter: Partial<NoteData>[] = [];

    for (const index of state.selectedNoteIndices) {
      const note = newNotes[index];
      if (note.isRest) continue;

      const newSlotCount = Math.max(1, Math.min(16, note.slotCount + delta));
      if (newSlotCount === note.slotCount) continue;

      before.push({ slotCount: note.slotCount, duration: note.duration });
      after.push({ slotCount: newSlotCount, duration: slotCountToDuration(newSlotCount) });

      newNotes[index] = {
        ...note,
        slotCount: newSlotCount,
        duration: slotCountToDuration(newSlotCount)
      };

      // 충돌 처리
      const collision = handleCollisions(
        newNotes,
        index,
        note.slotIndex,
        note.slotIndex + newSlotCount,
        note.measureIndex
      );
      newNotes = collision.notes;

      // 충돌 기록 저장
      collision.trimmedIndices.forEach((ti, i) => {
        if (!allTrimmedIndices.includes(ti)) {
          allTrimmedIndices.push(ti);
          allTrimmedBefore.push(collision.trimmedBefore[i]);
          allTrimmedAfter.push(collision.trimmedAfter[i]);
        }
      });
    }

    if (before.length === 0) return state;

    const action: EditAction = {
      type: 'duration',
      noteIndices: [...state.selectedNoteIndices.filter(i => !state.editedNotes[i].isRest), ...allTrimmedIndices],
      before: [...before, ...allTrimmedBefore],
      after: [...after, ...allTrimmedAfter]
    };

    return {
      editedNotes: newNotes,
      undoStack: [...state.undoStack.slice(-MAX_UNDO_STEPS + 1), action],
      redoStack: []
    };
  }),

  // 길이 조정 (충돌 처리 포함)
  updateNoteDuration: (noteIndex, newSlotCount) => set((state) => {
    if (newSlotCount < 1) newSlotCount = 1;
    if (newSlotCount > 16) newSlotCount = 16;

    const note = state.editedNotes[noteIndex];
    if (!note || note.isRest) return state;

    const before: Partial<NoteData>[] = [{ slotCount: note.slotCount, duration: note.duration }];
    const after: Partial<NoteData>[] = [{ slotCount: newSlotCount, duration: slotCountToDuration(newSlotCount) }];

    let newNotes = [...state.editedNotes];
    newNotes[noteIndex] = {
      ...note,
      slotCount: newSlotCount,
      duration: slotCountToDuration(newSlotCount)
    };

    // 충돌 처리
    const collision = handleCollisions(
      newNotes,
      noteIndex,
      note.slotIndex,
      note.slotIndex + newSlotCount,
      note.measureIndex
    );
    newNotes = collision.notes;

    const action: EditAction = {
      type: 'duration',
      noteIndices: [noteIndex, ...collision.trimmedIndices],
      before: [...before, ...collision.trimmedBefore],
      after: [...after, ...collision.trimmedAfter]
    };

    return {
      editedNotes: newNotes,
      undoStack: [...state.undoStack.slice(-MAX_UNDO_STEPS + 1), action],
      redoStack: []
    };
  }),

  // 음표 이동 (충돌 처리 포함)
  moveNote: (noteIndex, newSlotIndex, newMeasureIndex) => set((state) => {
    const note = state.editedNotes[noteIndex];
    if (!note || note.isRest) return state;

    const targetMeasure = newMeasureIndex ?? note.measureIndex;

    const before: Partial<NoteData>[] = [{ slotIndex: note.slotIndex, measureIndex: note.measureIndex }];
    const after: Partial<NoteData>[] = [{ slotIndex: newSlotIndex, measureIndex: targetMeasure }];

    let newNotes = [...state.editedNotes];
    newNotes[noteIndex] = {
      ...note,
      slotIndex: newSlotIndex,
      measureIndex: targetMeasure,
      beat: targetMeasure * 4 + newSlotIndex / 4
    };

    // 충돌 처리
    const collision = handleCollisions(
      newNotes,
      noteIndex,
      newSlotIndex,
      newSlotIndex + note.slotCount,
      targetMeasure
    );
    newNotes = collision.notes;

    const action: EditAction = {
      type: 'position',
      noteIndices: [noteIndex, ...collision.trimmedIndices],
      before: [...before, ...collision.trimmedBefore],
      after: [...after, ...collision.trimmedAfter]
    };

    return {
      editedNotes: newNotes,
      undoStack: [...state.undoStack.slice(-MAX_UNDO_STEPS + 1), action],
      redoStack: []
    };
  }),

  // 삭제
  deleteSelectedNotes: () => set((state) => {
    console.log('[Store] deleteSelectedNotes called:', { selectedNoteIndices: state.selectedNoteIndices });
    if (state.selectedNoteIndices.length === 0) {
      console.log('[Store] No notes selected, returning');
      return state;
    }

    const before: Partial<NoteData>[] = [];
    const after: Partial<NoteData>[] = [];
    const newNotes = [...state.editedNotes];

    for (const index of state.selectedNoteIndices) {
      const note = newNotes[index];
      if (note.isRest) {
        console.log('[Store] Note is already rest, skipping:', index);
        continue;
      }

      console.log('[Store] Deleting note:', { index, pitch: note.pitch });
      before.push({ ...note });
      after.push({
        pitch: 'rest',
        isRest: true,
        confidence: 'high'
      });

      // 쉼표로 변환
      newNotes[index] = {
        ...note,
        pitch: 'rest',
        isRest: true,
        confidence: 'high'
      };
    }

    if (before.length === 0) {
      console.log('[Store] No notes to delete');
      return state;
    }

    const action: EditAction = {
      type: state.selectedNoteIndices.length > 1 ? 'multi-delete' : 'delete',
      noteIndices: state.selectedNoteIndices.filter(i => !state.editedNotes[i].isRest),
      before,
      after
    };

    console.log('[Store] Delete complete, remaining non-rest notes:', newNotes.filter(n => !n.isRest).length);
    return {
      editedNotes: newNotes,
      selectedNoteIndices: [],
      undoStack: [...state.undoStack.slice(-MAX_UNDO_STEPS + 1), action],
      redoStack: []
    };
  }),

  // Undo
  undo: () => set((state) => {
    if (state.undoStack.length === 0) return state;

    const action = state.undoStack[state.undoStack.length - 1];
    const newNotes = [...state.editedNotes];

    // before 상태로 복원
    action.noteIndices.forEach((noteIndex, i) => {
      newNotes[noteIndex] = { ...newNotes[noteIndex], ...action.before[i] };
    });

    return {
      editedNotes: newNotes,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, action]
    };
  }),

  // Redo
  redo: () => set((state) => {
    if (state.redoStack.length === 0) return state;

    const action = state.redoStack[state.redoStack.length - 1];
    const newNotes = [...state.editedNotes];

    // after 상태로 복원
    action.noteIndices.forEach((noteIndex, i) => {
      newNotes[noteIndex] = { ...newNotes[noteIndex], ...action.after[i] };
    });

    return {
      editedNotes: newNotes,
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, action]
    };
  }),

  // 리셋
  reset: () => set((state) => ({
    editedNotes: [...state.originalNotes],
    undoStack: [],
    redoStack: [],
    selectedNoteIndices: []
  })),

  // 드래그
  setDragPreview: (preview) => set({ dragPreview: preview }),
  setIsDragging: (dragging) => set({ isDragging: dragging }),

  // 초기화 (빈 슬롯을 쉼표로 채움, 일반모드로 리셋)
  initializeNotes: (notes) => {
    const filledNotes = fillGapsWithRests(notes);
    return set({
      originalNotes: [...filledNotes],
      editedNotes: [...filledNotes],
      undoStack: [],
      redoStack: [],
      selectedNoteIndices: [],
      isEditMode: false,
      showEditPanel: false
    });
  },

  // 편집 확정용: 정리된 음표+쉼표 반환 (겹침 제거, 연속 쉼표 병합)
  getCleanedNotes: () => {
    return cleanupNotesAndRests(get().editedNotes);
  },

  // 악기 변환 상태 설정
  setConversionState: (state) => set((prev) => ({
    conversionState: { ...prev.conversionState, ...state }
  })),

  // 악기만 듣기 토글
  toggleInstrumentOnlyMode: () => set((prev) => ({
    instrumentOnlyMode: !prev.instrumentOnlyMode
  })),

  // 변환 상태 리셋
  resetConversionState: () => set({
    conversionState: INITIAL_CONVERSION_STATE,
    instrumentOnlyMode: false
  })
}));

export default useFeedbackStore;
