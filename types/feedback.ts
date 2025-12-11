// ============================================
// Feedback Types
// ============================================

export type FeedbackGrade =
  | 'Mastering'
  | 'Expressive'
  | 'Developing'
  | 'Exploring'
  | 'Learning';

export interface TimeSegment {
  startTime: number;  // seconds
  endTime: number;
}

export interface FeedbackData {
  score: number;           // 0-100
  grade: FeedbackGrade;
  comment: string;
  recordedSegments: TimeSegment[];
}

// ============================================
// Mock Data (MVP용)
// ============================================
// BPM=142, 4/4박자 기준: 마디당 약 1.69초
// Intro: 마디 1-8 (0 ~ 13.5초)
// Chorus: 마디 9-40 (13.5 ~ 67.6초)
export const MOCK_FEEDBACK: FeedbackData = {
  score: 72,
  grade: 'Developing',
  comment: '리듬이 안정적이에요 🎵',
  recordedSegments: [
    { startTime: 15, endTime: 25 },  // Chorus 마디 10-15 정도
    { startTime: 35, endTime: 45 }   // Chorus 마디 22-27 정도
  ]
};

// ============================================
// Grade 계산 헬퍼
// ============================================
export function getGradeFromScore(score: number): FeedbackGrade {
  if (score >= 90) return 'Mastering';
  if (score >= 75) return 'Expressive';
  if (score >= 60) return 'Developing';
  if (score >= 40) return 'Exploring';
  return 'Learning';
}

// ============================================
// Grade 색상 맵핑
// ============================================
export const GRADE_COLORS: Record<FeedbackGrade, string> = {
  Mastering: '#FFD700',   // Gold
  Expressive: '#7BA7FF',  // JAMUS Blue
  Developing: '#FFCC00',  // Yellow
  Exploring: '#FF9800',   // Orange
  Learning: '#9E9E9E'     // Gray
};

// ============================================
// Grade 이모지 맵핑
// ============================================
export const GRADE_EMOJIS: Record<FeedbackGrade, string> = {
  Mastering: '🏆',
  Expressive: '🌟',
  Developing: '🟡',
  Exploring: '🔵',
  Learning: '⚪'
};
