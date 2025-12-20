/**
 * 편집 모드 관련 타입 정의
 */

import { NoteData } from './note';

export interface EditAction {
  type: 'pitch' | 'position' | 'duration' | 'delete' | 'multi-delete';
  noteIndices: number[];
  before: Partial<NoteData>[];
  after: Partial<NoteData>[];
}

export interface DragPreview {
  slotIndex: number;
  slotCount: number;
  measureIndex: number;
}

export type DragType = 'resize' | 'move' | null;
