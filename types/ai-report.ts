/**
 * AI Report 타입 정의
 *
 * 문제 구간 판정 로직:
 * - confidence === 'excluded' + 사용자 수정함 → 'system_limit'
 * - confidence !== 'excluded' + 사용자 수정함 → 'user_error'
 * - confidence !== 'excluded' + 수정 안 함 → 'accurate'
 * - confidence === 'excluded' + 수정 안 함 → 'unconfirmed'
 */

// 문제 구간 타입
export type ProblemAreaType = 'system_limit' | 'user_error' | 'accurate' | 'unconfirmed';

// 제안 우선순위
export type SuggestionPriority = 'high' | 'medium' | 'low';

/**
 * 마디별 점수
 */
export interface MeasureScore {
  measureStart: number;
  measureEnd: number;
  accuracy: number;        // 0-100
  totalNotes: number;
  accurateNotes: number;
}

/**
 * 문제 구간 (히트맵 하이라이트용)
 */
export interface ProblemArea {
  measureStart: number;
  measureEnd: number;
  type: ProblemAreaType;
  description: string;
  noteCount: number;       // 해당 구간의 문제 음표 수
}

/**
 * AI 제안
 */
export interface AISuggestion {
  type: 'system_limit' | 'user_error' | 'range' | 'timing' | 'general';
  title: string;
  description: string;
  priority: SuggestionPriority;
  relatedMeasures?: number[];  // 관련 마디 번호
}

/**
 * 음역대별 분석
 */
export interface RangeAnalysis {
  low: {
    range: string;      // "D2-G2"
    accuracy: number;   // 0-100
    totalNotes: number;
    accurateNotes: number;
  };
  mid: {
    range: string;      // "A2-D3"
    accuracy: number;
    totalNotes: number;
    accurateNotes: number;
  };
  high: {
    range: string;      // "E3-C4"
    accuracy: number;
    totalNotes: number;
    accurateNotes: number;
  };
}

/**
 * 수정 통계
 */
export interface EditStats {
  totalNotes: number;       // 전체 음표 수 (쉼표 제외)
  editedNotes: number;      // 수정된 음표 수
  editRate: number;         // 수정률 (0-100)
  pitchEdits: number;       // 음정 수정 횟수
  timingEdits: number;      // 위치 수정 횟수
  durationEdits: number;    // 길이 수정 횟수
  deletedNotes: number;     // 삭제된 음표 수
  addedNotes: number;       // 추가된 음표 수
}

/**
 * AI 리포트 전체 데이터
 */
export interface AIReportData {
  // 기본 점수 (0-100)
  overallScore: number;          // 종합 정확도
  pitchAccuracy: number;         // 음정 정확도
  timingAccuracy: number;        // 타이밍 정확도
  durationAccuracy: number;      // 길이 정확도
  recoveryRate: number;          // 회수율 (AI가 검출한 음표 중 유지된 비율)

  // 구간별 분석 (4마디 단위)
  measureAnalysis: MeasureScore[];

  // 음역대별 분석
  rangeAnalysis: RangeAnalysis;

  // 수정 통계
  editStats: EditStats;

  // 문제 구간 (하이라이트용)
  problemAreas: ProblemArea[];

  // AI 제안
  suggestions: AISuggestion[];

  // 메타데이터
  jamId: string;
  songId: string;
  calculatedAt: string;
}

/**
 * 음표 판정 결과 (내부 계산용)
 */
export interface NoteJudgment {
  noteIndex: number;
  measureIndex: number;
  slotIndex: number;
  pitch: string;
  confidence: 'high' | 'medium' | 'excluded';
  wasEdited: boolean;
  editTypes: ('pitch' | 'position' | 'duration')[];
  judgment: ProblemAreaType;
}

/**
 * 리포트 계산 입력 (feedback_sessions 데이터)
 */
export interface ReportCalculationInput {
  jamId: string;
  songId: string;
  autoDetectedNotes: any[];     // NoteData[]
  finalEditedNotes: any[];      // NoteData[]
  noteChanges: any[];           // NoteChange[]
  metrics: {
    totalOriginalNotes: number;
    totalFinalNotes: number;
    pitchChangedNotes: number;
    positionChangedNotes: number;
    durationChangedNotes: number;
    deletedNotes: number;
    addedNotes: number;
    unchangedNotes: number;
  };
}

/**
 * 주파수 → 음역대 판정
 */
export function getFrequencyRange(pitch: string): 'low' | 'mid' | 'high' | null {
  if (!pitch || pitch === 'rest') return null;

  // 음정에서 옥타브와 음 이름 추출
  const match = pitch.match(/^([A-G]#?)(\d)$/);
  if (!match) return null;

  const [, note, octaveStr] = match;
  const octave = parseInt(octaveStr);

  // MIDI 번호로 변환 (대략적)
  const noteOrder = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteIndex = noteOrder.indexOf(note);
  if (noteIndex === -1) return null;

  const midi = (octave + 1) * 12 + noteIndex;

  // 음역대 판정
  // 저음역: D2(38) - G2(43) → 73-98Hz
  // 중음역: A2(45) - D3(50) → 110-147Hz
  // 고음역: E3(52) - C4(60) → 165-262Hz
  if (midi >= 38 && midi <= 43) return 'low';
  if (midi >= 45 && midi <= 50) return 'mid';
  if (midi >= 52 && midi <= 60) return 'high';

  // 범위 밖은 가장 가까운 범위로
  if (midi < 38) return 'low';
  if (midi > 60) return 'high';
  return 'mid';
}

export default AIReportData;
