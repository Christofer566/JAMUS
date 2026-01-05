import { create } from 'zustand';
import { NoteData } from '@/types/note';
import { EditAction, DragPreview } from '@/types/edit';
import { ConversionState, INITIAL_CONVERSION_STATE } from '@/types/instrument';
import { saveFeedbackSession, SaveFeedbackParams } from '@/lib/feedbackCollection';
import { SuggestedRange, SmartGuideState, initialSmartGuideState } from '@/types/suggestedRange';

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
  rawAutoNotes: NoteData[];      // Gap 분석용: 원본 자동 감지 음표 (쉼표 제외)
  originalNotes: NoteData[];
  editedNotes: NoteData[];

  // 피드백 수집용 메타데이터
  editStartTime: number;
  sessionMeta: {
    songId: string;
    bpm: number;
    key: string;
    recordingDuration: number;
  } | null;

  // Undo/Redo
  undoStack: EditAction[];
  redoStack: EditAction[];

  // 드래그
  isDragging: boolean;
  dragPreview: DragPreview | null;

  // 악기 변환
  conversionState: ConversionState;
  instrumentOnlyMode: boolean;  // true: 변환된 악기만, false: 배경음악 + 악기

  // Smart Guide (저신뢰도 구간 가이드)
  suggestedRanges: SuggestedRange[];
  smartGuide: SmartGuideState;

  // Actions
  setEditMode: (mode: boolean) => void;
  toggleEditPanel: () => void;

  selectNote: (index: number, multiSelect?: boolean) => void;
  selectNotesByArea: (startSlot: number, endSlot: number, measureIndex: number) => void;
  clearSelection: () => void;
  selectPrevNote: () => number | null;
  selectNextNote: () => number | null;
  addNote: () => { success: boolean; message?: string };

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
  setRawAutoNotes: (notes: NoteData[]) => void;  // Gap 분석용 원본 음표 설정
  initializeNotes: (notes: NoteData[]) => void;
  getCleanedNotes: () => NoteData[];  // 편집 확정용: 정리된 음표+쉼표 반환

  // 피드백 수집 Actions
  setSessionMeta: (meta: { songId: string; bpm: number; key: string; recordingDuration: number }) => void;
  saveFeedback: () => Promise<{ success: boolean; error?: string }>;

  // 악기 변환 Actions
  setConversionState: (state: Partial<ConversionState>) => void;
  toggleInstrumentOnlyMode: () => void;
  resetConversionState: () => void;

  // Smart Guide Actions
  setSuggestedRanges: (ranges: SuggestedRange[]) => void;
  setSmartGuideHover: (range: SuggestedRange | null, y: number | null, x?: number | null) => void;
  lockSmartGuidePitch: (pitch: string, midi: number) => void;
  updateSmartGuidePreview: (slotCount: number) => void;
  cancelSmartGuide: () => void;
  confirmSmartGuideNote: () => void;
  removeSuggestedRange: (measureIndex: number, startSlot: number) => void;
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
  rawAutoNotes: [],
  originalNotes: [],
  editedNotes: [],
  undoStack: [],
  redoStack: [],
  isDragging: false,
  dragPreview: null,
  conversionState: INITIAL_CONVERSION_STATE,
  instrumentOnlyMode: false,
  editStartTime: 0,
  sessionMeta: null,
  suggestedRanges: [],
  smartGuide: initialSmartGuideState,

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

  // 이전 음표 선택 (쉼표 제외) - 선택된 인덱스 반환
  selectPrevNote: () => {
    const state = get();
    const notes = state.editedNotes.filter(n => !n.isRest);
    if (notes.length === 0) return null;

    const currentIndex = state.selectedNoteIndices.length > 0 ? state.selectedNoteIndices[0] : -1;
    const currentNoteInFiltered = notes.findIndex((_, i) => state.editedNotes.indexOf(notes[i]) === currentIndex);

    let prevIndex = currentNoteInFiltered - 1;
    if (prevIndex < 0) prevIndex = notes.length - 1; // 순환

    const actualIndex = state.editedNotes.indexOf(notes[prevIndex]);
    set({ selectedNoteIndices: [actualIndex] });
    return actualIndex;
  },

  // 다음 음표 선택 (쉼표 제외) - 선택된 인덱스 반환
  selectNextNote: () => {
    const state = get();
    const notes = state.editedNotes.filter(n => !n.isRest);
    if (notes.length === 0) return null;

    const currentIndex = state.selectedNoteIndices.length > 0 ? state.selectedNoteIndices[0] : -1;
    const currentNoteInFiltered = notes.findIndex((_, i) => state.editedNotes.indexOf(notes[i]) === currentIndex);

    let nextIndex = currentNoteInFiltered + 1;
    if (nextIndex >= notes.length) nextIndex = 0; // 순환

    const actualIndex = state.editedNotes.indexOf(notes[nextIndex]);
    set({ selectedNoteIndices: [actualIndex] });
    return actualIndex;
  },

  // 새 음표 추가 (16분음표, 선택된 음표 오른쪽에 동일 음높이로 생성)
  addNote: () => {
    const state = get();

    if (state.selectedNoteIndices.length === 0) {
      console.warn('[Store] No note selected to add after');
      return { success: false, message: '음표를 먼저 선택해주세요' };
    }

    const selectedIndex = state.selectedNoteIndices[0];
    const selectedNote = state.editedNotes[selectedIndex];
    if (!selectedNote || selectedNote.isRest) {
      console.warn('[Store] Selected note is a rest');
      return { success: false, message: '쉼표에는 음표를 추가할 수 없습니다' };
    }

    // 16분음표 (slotCount = 1)
    const newSlotIndex = selectedNote.slotIndex + selectedNote.slotCount;

    // 마디 넘어가는 경우 처리
    let newMeasureIndex = selectedNote.measureIndex;
    let actualSlotIndex = newSlotIndex;
    if (newSlotIndex >= SLOTS_PER_MEASURE) {
      actualSlotIndex = newSlotIndex - SLOTS_PER_MEASURE;
      newMeasureIndex++;
    }

    // 충돌 검사: 해당 위치에 이미 음표가 있는지 확인
    const existingNote = state.editedNotes.find(n =>
      n.measureIndex === newMeasureIndex &&
      !n.isRest &&
      n.slotIndex === actualSlotIndex
    );

    if (existingNote) {
      console.warn('[Store] Note already exists at position');
      return { success: false, message: '이미 음표가 있습니다' };
    }

    const newNote: NoteData = {
      pitch: selectedNote.pitch, // 동일한 음높이
      duration: '16',
      beat: newMeasureIndex * 4 + actualSlotIndex / 4,
      measureIndex: newMeasureIndex,
      slotIndex: actualSlotIndex,
      slotCount: 1,
      isRest: false,
      confidence: 'high'
    };

    const newNotes = [...state.editedNotes];

    // 적절한 위치에 삽입 (measureIndex, slotIndex 순서대로)
    const insertIndex = newNotes.findIndex(n =>
      n.measureIndex > newMeasureIndex ||
      (n.measureIndex === newMeasureIndex && n.slotIndex > actualSlotIndex)
    );

    if (insertIndex === -1) {
      newNotes.push(newNote);
    } else {
      newNotes.splice(insertIndex, 0, newNote);
    }

    console.log('[Store] Added new note:', newNote);

    // 새로 추가된 음표 선택
    const newNoteIndex = insertIndex === -1 ? newNotes.length - 1 : insertIndex;

    set({
      editedNotes: newNotes,
      selectedNoteIndices: [newNoteIndex],
      undoStack: [...state.undoStack.slice(-MAX_UNDO_STEPS + 1), {
        type: 'add' as any,
        noteIndices: [newNoteIndex],
        before: [],
        after: [newNote]
      }],
      redoStack: []
    });

    return { success: true };
  },

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

  // 선택된 음표들 길이 조정 (Shift + 화살표) - 마디 경계 넘기 지원
  updateSelectedNotesDuration: (direction) => set((state) => {
    if (state.selectedNoteIndices.length === 0) return state;

    const delta = direction === 'increase' ? 1 : -1;
    const before: Partial<NoteData>[] = [];
    const after: Partial<NoteData>[] = [];
    let newNotes = [...state.editedNotes];
    const newlyCreatedNotes: NoteData[] = [];

    // 모든 충돌 처리 기록
    const allTrimmedIndices: number[] = [];
    const allTrimmedBefore: Partial<NoteData>[] = [];
    const allTrimmedAfter: Partial<NoteData>[] = [];

    for (const index of state.selectedNoteIndices) {
      const note = newNotes[index];
      if (note.isRest) continue;

      const maxInCurrentMeasure = SLOTS_PER_MEASURE - note.slotIndex;
      let newSlotCount = Math.max(1, Math.min(16, note.slotCount + delta));

      // 마디 경계를 넘으려고 할 때: 다음 마디에 연속 음표 생성
      if (direction === 'increase' && note.slotCount >= maxInCurrentMeasure) {
        // 현재 음표가 이미 마디 끝까지 차있으면 다음 마디에 연속 음표 생성
        const nextMeasureIndex = note.measureIndex + 1;

        // 다음 마디에 이미 같은 음의 연속 음표가 있는지 확인
        const existingContinuation = newNotes.find(n =>
          n.measureIndex === nextMeasureIndex &&
          n.slotIndex === 0 &&
          n.pitch === note.pitch &&
          !n.isRest
        );

        if (existingContinuation) {
          // 기존 연속 음표 확장
          const contIndex = newNotes.indexOf(existingContinuation);
          const newContSlotCount = Math.min(16, existingContinuation.slotCount + 1);

          if (newContSlotCount !== existingContinuation.slotCount) {
            before.push({ slotCount: existingContinuation.slotCount, duration: existingContinuation.duration });
            after.push({ slotCount: newContSlotCount, duration: slotCountToDuration(newContSlotCount) });

            newNotes[contIndex] = {
              ...existingContinuation,
              slotCount: newContSlotCount,
              duration: slotCountToDuration(newContSlotCount)
            };

            // 충돌 처리
            const collision = handleCollisions(newNotes, contIndex, 0, newContSlotCount, nextMeasureIndex);
            newNotes = collision.notes;

            collision.trimmedIndices.forEach((ti, i) => {
              if (!allTrimmedIndices.includes(ti)) {
                allTrimmedIndices.push(ti);
                allTrimmedBefore.push(collision.trimmedBefore[i]);
                allTrimmedAfter.push(collision.trimmedAfter[i]);
              }
            });
          }
        } else {
          // 새 연속 음표 생성
          const newContinuationNote: NoteData = {
            pitch: note.pitch,
            duration: 'sixteenth',
            beat: (nextMeasureIndex * 4) + 0,
            measureIndex: nextMeasureIndex,
            slotIndex: 0,
            slotCount: 1,
            isRest: false,
            confidence: note.confidence ?? 1.0
          };

          newlyCreatedNotes.push(newContinuationNote);
        }

        // 현재 음표는 변경하지 않음 (이미 최대)
        continue;
      }

      if (newSlotCount === note.slotCount) continue;

      before.push({ slotCount: note.slotCount, duration: note.duration });
      after.push({ slotCount: newSlotCount, duration: slotCountToDuration(newSlotCount) });

      newNotes[index] = {
        ...note,
        slotCount: newSlotCount,
        duration: slotCountToDuration(newSlotCount)
      };

      // 현재 마디 충돌 처리
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

    // 새로 생성된 연속 음표들 추가
    if (newlyCreatedNotes.length > 0) {
      for (const newNote of newlyCreatedNotes) {
        // 삽입 위치 찾기
        let insertIndex = newNotes.findIndex(n =>
          n.measureIndex > newNote.measureIndex ||
          (n.measureIndex === newNote.measureIndex && n.slotIndex > newNote.slotIndex)
        );

        if (insertIndex === -1) {
          newNotes.push(newNote);
        } else {
          newNotes.splice(insertIndex, 0, newNote);
        }

        // 충돌 처리
        const newNoteIndex = insertIndex === -1 ? newNotes.length - 1 : insertIndex;
        const collision = handleCollisions(newNotes, newNoteIndex, 0, 1, newNote.measureIndex);
        newNotes = collision.notes;

        collision.trimmedIndices.forEach((ti, i) => {
          if (!allTrimmedIndices.includes(ti)) {
            allTrimmedIndices.push(ti);
            allTrimmedBefore.push(collision.trimmedBefore[i]);
            allTrimmedAfter.push(collision.trimmedAfter[i]);
          }
        });
      }
    }

    if (before.length === 0 && newlyCreatedNotes.length === 0) return state;

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

  // Gap 분석용 원본 음표 설정 (쉼표 제외)
  setRawAutoNotes: (notes) => set({ rawAutoNotes: notes.filter(n => !n.isRest) }),

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
      showEditPanel: false,
      editStartTime: Date.now()
    });
  },

  // 편집 확정용: 정리된 음표+쉼표 반환 (겹침 제거, 연속 쉼표 병합)
  getCleanedNotes: () => {
    return cleanupNotesAndRests(get().editedNotes);
  },

  // 피드백 수집: 세션 메타데이터 설정
  setSessionMeta: (meta) => set({ sessionMeta: meta }),

  // 피드백 수집: 편집 데이터 저장 (원본 vs 최종 비교 방식)
  saveFeedback: async () => {
    const state = get();
    const { sessionMeta, originalNotes, editedNotes, editStartTime } = state;

    if (!sessionMeta) {
      console.warn('⚠️ [feedbackStore] sessionMeta가 설정되지 않음');
      return { success: false, error: 'sessionMeta not set' };
    }

    const params: SaveFeedbackParams = {
      songId: sessionMeta.songId,
      autoDetectedNotes: originalNotes,
      finalEditedNotes: editedNotes,
      bpm: sessionMeta.bpm,
      key: sessionMeta.key,
      recordingDuration: sessionMeta.recordingDuration,
      editStartTime,
    };

    const result = await saveFeedbackSession(params);
    return result;
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
  }),

  // ============================================
  // Smart Guide Actions
  // ============================================

  // SuggestedRanges 설정
  setSuggestedRanges: (ranges) => set({ suggestedRanges: ranges }),

  // 호버 상태 설정
  setSmartGuideHover: (range, y, x = null) => set((state) => {
    if (!range) {
      // 호버 종료
      if (state.smartGuide.step === 'hovering') {
        return { smartGuide: initialSmartGuideState };
      }
      return state; // pitch_locked 상태면 유지
    }

    return {
      smartGuide: {
        ...state.smartGuide,
        step: state.smartGuide.step === 'pitch_locked' ? 'pitch_locked' : 'hovering',
        activeRange: range,
        hoverY: y,
        hoverX: x,
      }
    };
  }),

  // 음정 확정 (1차 클릭)
  lockSmartGuidePitch: (pitch, midi) => set((state) => ({
    smartGuide: {
      ...state.smartGuide,
      step: 'pitch_locked',
      lockedPitch: pitch,
      lockedMidi: midi,
      previewSlotCount: 1,
    }
  })),

  // 길이 미리보기 업데이트
  updateSmartGuidePreview: (slotCount) => set((state) => ({
    smartGuide: {
      ...state.smartGuide,
      previewSlotCount: slotCount,
    }
  })),

  // Smart Guide 취소 (ESC)
  cancelSmartGuide: () => set({ smartGuide: initialSmartGuideState }),

  // 음표 확정 (2차 클릭) - 겹치는 음표 정리 후 새 음표 생성
  confirmSmartGuideNote: () => set((state) => {
    const { smartGuide, editedNotes, suggestedRanges, undoStack } = state;

    if (smartGuide.step !== 'pitch_locked' || !smartGuide.activeRange || !smartGuide.lockedPitch) {
      console.warn('[SmartGuide] Invalid state for confirmation');
      return state;
    }

    const { activeRange, lockedPitch, previewSlotCount, lockedMidi } = smartGuide;
    const newNotes = [...editedNotes];

    // 1. 겹치는 음표 찾기 (해당 범위 내)
    const overlappingIndices: number[] = [];
    const overlappingBefore: Partial<NoteData>[] = [];
    const overlappingAfter: Partial<NoteData>[] = [];

    newNotes.forEach((note, idx) => {
      if (note.measureIndex !== activeRange.measureIndex) return;
      if (note.isRest) return;

      const noteStart = note.slotIndex;
      const noteEnd = note.slotIndex + note.slotCount;
      const rangeStart = activeRange.startSlot;
      const rangeEnd = activeRange.startSlot + previewSlotCount;

      // 겹치는지 확인
      if (noteStart < rangeEnd && noteEnd > rangeStart) {
        overlappingIndices.push(idx);
        overlappingBefore.push({ ...note });
        // 쉼표로 변환
        newNotes[idx] = {
          ...note,
          pitch: 'rest',
          isRest: true,
          confidence: 'high'
        };
        overlappingAfter.push({ pitch: 'rest', isRest: true, confidence: 'high' });
      }
    });

    // 2. 새 음표 생성
    const newNote: NoteData = {
      pitch: lockedPitch,
      duration: slotCountToDuration(previewSlotCount),
      beat: activeRange.measureIndex * 4 + activeRange.startSlot / 4,
      measureIndex: activeRange.measureIndex,
      slotIndex: activeRange.startSlot,
      slotCount: previewSlotCount,
      isRest: false,
      confidence: 'high',
    };

    // 적절한 위치에 삽입
    let insertIndex = newNotes.findIndex(n =>
      n.measureIndex > newNote.measureIndex ||
      (n.measureIndex === newNote.measureIndex && n.slotIndex > newNote.slotIndex)
    );

    if (insertIndex === -1) {
      newNotes.push(newNote);
      insertIndex = newNotes.length - 1;
    } else {
      newNotes.splice(insertIndex, 0, newNote);
    }

    // 3. 사용된 SuggestedRange 제거
    const newRanges = suggestedRanges.filter(r =>
      !(r.measureIndex === activeRange.measureIndex && r.startSlot === activeRange.startSlot)
    );

    // 4. EditAction 생성 (단일 액션으로 번들링)
    const action: EditAction = {
      type: 'smart-guide-add',
      noteIndices: [insertIndex, ...overlappingIndices.map(i => i >= insertIndex ? i + 1 : i)],
      before: [{}, ...overlappingBefore], // 새 음표는 이전 상태 없음
      after: [newNote, ...overlappingAfter],
    };

    console.log('[SmartGuide] Note confirmed:', {
      newNote,
      overlappingRemoved: overlappingIndices.length,
      rangeUsed: activeRange,
    });

    return {
      editedNotes: newNotes,
      suggestedRanges: newRanges,
      smartGuide: initialSmartGuideState,
      selectedNoteIndices: [insertIndex],
      undoStack: [...undoStack.slice(-MAX_UNDO_STEPS + 1), action],
      redoStack: [],
    };
  }),

  // SuggestedRange 개별 제거
  removeSuggestedRange: (measureIndex, startSlot) => set((state) => ({
    suggestedRanges: state.suggestedRanges.filter(r =>
      !(r.measureIndex === measureIndex && r.startSlot === startSlot)
    )
  })),
}));

export default useFeedbackStore;
