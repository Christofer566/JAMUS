/**
 * 음표 데이터를 위한 타입 정의
 * 16슬롯 그리드 기반 Hybrid Pitch Tracking 시스템
 */

export interface NoteData {
  pitch: string;           // "C4", "D#5" 등
  duration: string;        // "w", "h", "q", "8", "16"
  beat: number;            // 시작 박자 (전체 기준)
  measureIndex: number;    // 마디 번호 (0부터)
  slotIndex: number;       // 마디 내 슬롯 위치 (0-15)
  slotCount: number;       // 차지하는 슬롯 수 (1,2,4,8,16)
  confidence: 'high' | 'medium';  // 신뢰도 (high: 70%+, medium: 50-70%)
  isRest: boolean;         // 쉼표 여부
}

/**
 * confidence 기준:
 * - high: 그리드에 정확히 맞고 (±15% 이내) + 음정 점유율 70% 이상 → 흰색
 * - medium: 그리드 오차 있거나 음정 점유율 50-70% → 노란색
 * - 점유율 50% 미만 → 음표 생성 안 함
 */
