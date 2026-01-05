import { createClient } from './supabase';
import {
  FeedbackSession,
  FeedbackMetrics,
  NoteChange,
  toRecord
} from '../types/feedbackCollection';
import { NoteData } from '../types/note';

// ============================================
// Types
// ============================================
export interface SaveFeedbackParams {
  jamId?: string;
  songId: string;
  autoDetectedNotes: NoteData[];
  finalEditedNotes: NoteData[];
  bpm: number;
  key: string;
  recordingDuration: number;
  editStartTime: number;
}

export interface SaveFeedbackResult {
  success: boolean;
  data?: FeedbackSession;
  error?: string;
}

// ============================================
// Compare Original vs Final Notes
// ============================================
export function compareNotes(
  originalNotes: NoteData[],
  finalNotes: NoteData[]
): { noteChanges: NoteChange[]; metrics: FeedbackMetrics } {
  // 쉼표 제외
  const originals = originalNotes.filter(n => !n.isRest);
  const finals = finalNotes.filter(n => !n.isRest);

  const noteChanges: NoteChange[] = [];
  const matchedFinalIndices = new Set<number>();

  let pitchChangedNotes = 0;
  let positionChangedNotes = 0;
  let durationChangedNotes = 0;
  let unchangedNotes = 0;

  // 원본 음표마다 가장 가까운 최종 음표 찾기 (위치 기반 매칭)
  for (let i = 0; i < originals.length; i++) {
    const orig = originals[i];
    const origSlot = orig.measureIndex * 16 + orig.slotIndex;

    // 가장 가까운 매칭 찾기 (±4 슬롯 허용)
    let bestMatch: { index: number; note: NoteData; dist: number } | null = null;

    for (let j = 0; j < finals.length; j++) {
      if (matchedFinalIndices.has(j)) continue;

      const fin = finals[j];
      const finSlot = fin.measureIndex * 16 + fin.slotIndex;
      const dist = Math.abs(finSlot - origSlot);

      if (dist <= 4 && (!bestMatch || dist < bestMatch.dist)) {
        bestMatch = { index: j, note: fin, dist };
      }
    }

    if (bestMatch) {
      matchedFinalIndices.add(bestMatch.index);
      const fin = bestMatch.note;

      // 변경 사항 분석
      const changes: ('pitch' | 'position' | 'duration')[] = [];

      if (orig.pitch !== fin.pitch) {
        changes.push('pitch');
        pitchChangedNotes++;
      }

      if (orig.slotIndex !== fin.slotIndex || orig.measureIndex !== fin.measureIndex) {
        changes.push('position');
        positionChangedNotes++;
      }

      if (orig.slotCount !== fin.slotCount) {
        changes.push('duration');
        durationChangedNotes++;
      }

      if (changes.length > 0) {
        noteChanges.push({
          noteIndex: i,
          original: {
            pitch: orig.pitch,
            slotIndex: orig.slotIndex,
            slotCount: orig.slotCount,
            measureIndex: orig.measureIndex,
          },
          final: {
            pitch: fin.pitch,
            slotIndex: fin.slotIndex,
            slotCount: fin.slotCount,
            measureIndex: fin.measureIndex,
          },
          changes,
        });
      } else {
        unchangedNotes++;
      }
    }
    // 매칭 없으면 삭제된 것으로 간주 (아래에서 계산)
  }

  // 삭제된 음표 = 원본에 있는데 매칭 안 된 것
  const deletedNotes = originals.length - matchedFinalIndices.size -
    (originals.length - matchedFinalIndices.size > 0 ? 0 : 0);

  // 정확한 삭제 계산
  let matchedOrigCount = 0;
  for (let i = 0; i < originals.length; i++) {
    const orig = originals[i];
    const origSlot = orig.measureIndex * 16 + orig.slotIndex;
    for (let j = 0; j < finals.length; j++) {
      const fin = finals[j];
      const finSlot = fin.measureIndex * 16 + fin.slotIndex;
      if (Math.abs(finSlot - origSlot) <= 4) {
        matchedOrigCount++;
        break;
      }
    }
  }
  const actualDeletedNotes = originals.length - matchedOrigCount;

  // 추가된 음표 = 최종에 있는데 매칭 안 된 것
  const addedNotes = finals.length - matchedFinalIndices.size;

  const metrics: FeedbackMetrics = {
    totalOriginalNotes: originals.length,
    totalFinalNotes: finals.length,
    pitchChangedNotes,
    positionChangedNotes,
    durationChangedNotes,
    deletedNotes: actualDeletedNotes,
    addedNotes,
    unchangedNotes,
  };

  return { noteChanges, metrics };
}

// ============================================
// Save Feedback Session
// ============================================
export async function saveFeedbackSession(
  params: SaveFeedbackParams
): Promise<SaveFeedbackResult> {
  const {
    jamId,
    songId,
    autoDetectedNotes,
    finalEditedNotes,
    bpm,
    key,
    recordingDuration,
    editStartTime,
  } = params;

  try {
    const supabase = createClient();

    // 1. 현재 유저 확인
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.warn('⚠️ [feedbackCollection] 로그인되지 않음 - 피드백 저장 스킵');
      return { success: false, error: '로그인이 필요합니다' };
    }

    // 2. 원본 vs 최종 비교
    const { noteChanges, metrics } = compareNotes(autoDetectedNotes, finalEditedNotes);
    const editDuration = (Date.now() - editStartTime) / 1000;

    // 변경 없으면 저장 스킵
    if (noteChanges.length === 0 && metrics.deletedNotes === 0 && metrics.addedNotes === 0) {
      console.log('📊 [feedbackCollection] 변경 없음 - 피드백 저장 스킵');
      return { success: true };
    }

    // 3. 세션 데이터 구성
    const session: FeedbackSession = {
      jamId,
      userId: user.id,
      songId,
      autoDetectedNotes,
      finalEditedNotes,
      noteChanges,
      metrics,
      bpm,
      key,
      recordingDuration,
      editDuration,
    };

    // 4. Supabase에 저장
    const record = toRecord(session);

    console.log('📊 [feedbackCollection] 저장 시도:', {
      songId,
      metrics,
      changedNotes: noteChanges.length,
    });

    const { data: insertData, error: insertError } = await supabase
      .from('feedback_sessions')
      .insert(record)
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '42P01') {
        console.warn(
          '⚠️ [feedbackCollection] feedback_sessions 테이블이 없습니다. SQL 스크립트를 실행해주세요.'
        );
        return { success: false, error: '테이블이 없습니다' };
      }

      console.error('❌ [feedbackCollection] 저장 실패:', insertError);
      return { success: false, error: insertError.message };
    }

    console.log('✅ [feedbackCollection] 저장 성공:', {
      id: insertData.id,
      pitchChanged: metrics.pitchChangedNotes,
      positionChanged: metrics.positionChangedNotes,
      durationChanged: metrics.durationChangedNotes,
    });

    return { success: true, data: { ...session, id: insertData.id } };
  } catch (error) {
    console.error('❌ [feedbackCollection] 예외 발생:', error);
    return { success: false, error: '저장 중 오류가 발생했습니다' };
  }
}

// ============================================
// Get User's Feedback Sessions (for analysis)
// ============================================
export async function getUserFeedbackSessions(
  songId?: string
): Promise<FeedbackSession[]> {
  try {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
      .from('feedback_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (songId) {
      query = query.eq('song_id', songId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('getUserFeedbackSessions error:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('getUserFeedbackSessions error:', error);
    return [];
  }
}

export default {
  saveFeedbackSession,
  getUserFeedbackSessions,
  compareNotes,
};
