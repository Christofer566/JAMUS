/**
 * 사용자 피드백 수집 타입 정의
 * Pitch detection 정확도 개선을 위한 편집 데이터 수집
 *
 * 핵심: undoStack 횟수가 아닌 원본 vs 최종 비교
 */

import { NoteData } from './note';

/**
 * 개별 음표의 변경 내역
 */
export interface NoteChange {
  noteIndex: number;
  original: {
    pitch: string;
    slotIndex: number;
    slotCount: number;
    measureIndex: number;
  };
  final: {
    pitch: string;
    slotIndex: number;
    slotCount: number;
    measureIndex: number;
  };
  changes: ('pitch' | 'position' | 'duration')[];
}

/**
 * 편집 메트릭 (음표 단위)
 */
export interface FeedbackMetrics {
  totalOriginalNotes: number;   // 원본 음표 수 (쉼표 제외)
  totalFinalNotes: number;      // 최종 음표 수 (쉼표 제외)
  pitchChangedNotes: number;    // 음정 변경된 음표 수
  positionChangedNotes: number; // 위치 변경된 음표 수
  durationChangedNotes: number; // 길이 변경된 음표 수
  deletedNotes: number;         // 삭제된 음표 수
  addedNotes: number;           // 추가된 음표 수
  unchangedNotes: number;       // 변경 없는 음표 수
}

/**
 * 피드백 세션 (녹음 1회당 1개)
 */
export interface FeedbackSession {
  id?: string;
  jamId?: string;
  userId: string;
  songId: string;

  // 검출 결과 (전체 저장)
  autoDetectedNotes: NoteData[];
  finalEditedNotes: NoteData[];

  // 변경 내역 (개별 음표별)
  noteChanges: NoteChange[];
  metrics: FeedbackMetrics;

  // 메타데이터
  bpm: number;
  key: string;
  recordingDuration: number;
  editDuration: number;

  createdAt?: string;
}

/**
 * Supabase에 저장할 형태 (snake_case)
 */
export interface FeedbackSessionRecord {
  id?: string;
  jam_id?: string;
  user_id: string;
  song_id: string;
  auto_detected_notes: NoteData[];
  final_edited_notes: NoteData[];
  note_changes: NoteChange[];
  total_original_notes: number;
  total_final_notes: number;
  pitch_changed_notes: number;
  position_changed_notes: number;
  duration_changed_notes: number;
  deleted_notes: number;
  added_notes: number;
  unchanged_notes: number;
  bpm: number;
  key: string;
  recording_duration: number;
  edit_duration: number;
  created_at?: string;
}

/**
 * FeedbackSession → FeedbackSessionRecord 변환
 */
export function toRecord(session: FeedbackSession): FeedbackSessionRecord {
  return {
    jam_id: session.jamId,
    user_id: session.userId,
    song_id: session.songId,
    auto_detected_notes: session.autoDetectedNotes,
    final_edited_notes: session.finalEditedNotes,
    note_changes: session.noteChanges,
    total_original_notes: session.metrics.totalOriginalNotes,
    total_final_notes: session.metrics.totalFinalNotes,
    pitch_changed_notes: session.metrics.pitchChangedNotes,
    position_changed_notes: session.metrics.positionChangedNotes,
    duration_changed_notes: session.metrics.durationChangedNotes,
    deleted_notes: session.metrics.deletedNotes,
    added_notes: session.metrics.addedNotes,
    unchanged_notes: session.metrics.unchangedNotes,
    bpm: session.bpm,
    key: session.key,
    recording_duration: session.recordingDuration,
    edit_duration: session.editDuration,
  };
}
