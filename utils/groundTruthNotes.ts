import { NoteData } from '@/types/note';

/**
 * 14차 TEST 정답 음표
 *
 * 성민님이 남자 키로 부른 멜로디 (마디 9-16)
 * - 마디 9-13: 중음역대 멜로디 (C4, G3, A#3, F3, D3, A3 등)
 * - 마디 14-16: 저음 구간 (D2, E2, F#2, G2, A2 등)
 */
export const GROUND_TRUTH_NOTES: NoteData[] = [
  // ========================================
  // 마디 9
  // ========================================
  {
    pitch: 'rest',
    duration: 'q',
    beat: 0,
    slotIndex: 0,
    slotCount: 4,
    measureIndex: 9,
    isRest: true,
    confidence: 'high'
  },
  {
    pitch: 'C4',
    duration: 'h',
    beat: 1,
    slotIndex: 4,
    slotCount: 8,
    measureIndex: 9,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'G3',
    duration: 'q',
    beat: 3,
    slotIndex: 12,
    slotCount: 4,
    measureIndex: 9,
    isRest: false,
    confidence: 'high'
  },

  // ========================================
  // 마디 10
  // ========================================
  {
    pitch: 'A#3',
    duration: 'q',
    beat: 0,
    slotIndex: 0,
    slotCount: 4,
    measureIndex: 10,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'F3',
    duration: 'q',
    beat: 1,
    slotIndex: 4,
    slotCount: 4,
    measureIndex: 10,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'D3',
    duration: 'q',
    beat: 2,
    slotIndex: 8,
    slotCount: 4,
    measureIndex: 10,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'A3',
    duration: 'q',
    beat: 3,
    slotIndex: 12,
    slotCount: 4,
    measureIndex: 10,
    isRest: false,
    confidence: 'high'
  },

  // ========================================
  // 마디 11
  // ========================================
  {
    pitch: 'F3',
    duration: 'q',
    beat: 0,
    slotIndex: 0,
    slotCount: 4,
    measureIndex: 11,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'rest',
    duration: 'q.+e',
    beat: 1,
    slotIndex: 4,
    slotCount: 7,
    measureIndex: 11,
    isRest: true,
    confidence: 'high'
  },
  {
    pitch: 'C3',
    duration: 's',
    beat: 2.75,
    slotIndex: 11,
    slotCount: 1,
    measureIndex: 11,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'D3',
    duration: 'e.',
    beat: 3,
    slotIndex: 12,
    slotCount: 3,
    measureIndex: 11,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'A#2',
    duration: 'q+s',
    beat: 3.75,
    slotIndex: 15,
    slotCount: 5,
    measureIndex: 11,
    isRest: false,
    confidence: 'high'
  }, // [10] 연결음: 11마디 슬롯 15 (1) + 12마디 슬롯 0-3 (4)

  // ========================================
  // 마디 12
  // ========================================
  {
    pitch: 'rest',
    duration: 'q.+e',
    beat: 1,
    slotIndex: 4,
    slotCount: 7,
    measureIndex: 12,
    isRest: true,
    confidence: 'high'
  },
  {
    pitch: 'C3',
    duration: 's',
    beat: 2.75,
    slotIndex: 11,
    slotCount: 1,
    measureIndex: 12,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'D3',
    duration: 'e.',
    beat: 3,
    slotIndex: 12,
    slotCount: 3,
    measureIndex: 12,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'D#3',
    duration: 'h+s',
    beat: 3.75,
    slotIndex: 15,
    slotCount: 9,
    measureIndex: 12,
    isRest: false,
    confidence: 'high'
  }, // [13-14] 연결음: 12마디 슬롯 15 (1) + 13마디 슬롯 0-7 (8)

  // ========================================
  // 마디 13
  // ========================================
  {
    pitch: 'rest',
    duration: 'q',
    beat: 2,
    slotIndex: 8,
    slotCount: 4,
    measureIndex: 13,
    isRest: true,
    confidence: 'high'
  },
  {
    pitch: 'C3',
    duration: 'q',
    beat: 3,
    slotIndex: 12,
    slotCount: 4,
    measureIndex: 13,
    isRest: false,
    confidence: 'high'
  },

  // ========================================
  // 마디 14 (저음 구간 시작)
  // ========================================
  {
    pitch: 'D3',
    duration: 'q',
    beat: 0,
    slotIndex: 0,
    slotCount: 4,
    measureIndex: 14,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'D2',
    duration: 'q',
    beat: 1,
    slotIndex: 4,
    slotCount: 4,
    measureIndex: 14,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'E2',
    duration: 'q',
    beat: 2,
    slotIndex: 8,
    slotCount: 4,
    measureIndex: 14,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'F#2',
    duration: 'q',
    beat: 3,
    slotIndex: 12,
    slotCount: 4,
    measureIndex: 14,
    isRest: false,
    confidence: 'high'
  },

  // ========================================
  // 마디 15
  // ========================================
  {
    pitch: 'G2',
    duration: 'q',
    beat: 0,
    slotIndex: 0,
    slotCount: 4,
    measureIndex: 15,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'A2',
    duration: 'q',
    beat: 1,
    slotIndex: 4,
    slotCount: 4,
    measureIndex: 15,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'A#2',
    duration: 'q',
    beat: 2,
    slotIndex: 8,
    slotCount: 4,
    measureIndex: 15,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'C3',
    duration: 'q',
    beat: 3,
    slotIndex: 12,
    slotCount: 4,
    measureIndex: 15,
    isRest: false,
    confidence: 'high'
  },

  // ========================================
  // 마디 16
  // ========================================
  {
    pitch: 'D3',
    duration: 'q',
    beat: 0,
    slotIndex: 0,
    slotCount: 4,
    measureIndex: 16,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'F#3',
    duration: 'q',
    beat: 1,
    slotIndex: 4,
    slotCount: 4,
    measureIndex: 16,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'G3',
    duration: 'q',
    beat: 2,
    slotIndex: 8,
    slotCount: 4,
    measureIndex: 16,
    isRest: false,
    confidence: 'high'
  },
  {
    pitch: 'D3',
    duration: 'q',
    beat: 3,
    slotIndex: 12,
    slotCount: 4,
    measureIndex: 16,
    isRest: false,
    confidence: 'high'
  },
];

/**
 * 정답 음표 통계
 * - 총 음표: 27개 (쉼표 제외)
 * - 마디 범위: 9-16
 * - 음역대: D2 ~ C4
 */
export const GROUND_TRUTH_STATS = {
  totalNotes: 27,
  totalRests: 4,
  measureRange: { start: 9, end: 16 },
  pitchRange: { lowest: 'D2', highest: 'C4' }
};
