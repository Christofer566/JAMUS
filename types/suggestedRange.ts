/**
 * Smart Range Guide 타입 정의
 * 저신뢰도 구간에서 사용자가 마우스로 음정/길이를 결정하는 2단계 확정 시스템
 */

/**
 * 피치 엔진이 제안하는 저신뢰도 구간
 * confidence === 'excluded' 슬롯들의 연속 그룹
 */
export interface SuggestedRange {
  startSlot: number;        // 0-15 (inclusive)
  endSlot: number;          // 0-15 (exclusive)
  measureIndex: number;
  suggestedPitch?: string;  // 인접 음표 기반 추천 음정
  avgConfidence: number;    // 평균 신뢰도 (0-1)
  hasFrameData: boolean;    // 프레임 데이터 존재 여부
}

/**
 * Smart Guide 상호작용 상태
 */
export interface SmartGuideState {
  step: 'idle' | 'hovering' | 'pitch_locked';
  activeRange: SuggestedRange | null;
  lockedPitch: string | null;
  lockedMidi: number | null;
  previewSlotCount: number;
  hoverY: number | null;
  hoverX: number | null;  // duration 미리보기용
}

/**
 * 초기 Smart Guide 상태
 */
export const initialSmartGuideState: SmartGuideState = {
  step: 'idle',
  activeRange: null,
  lockedPitch: null,
  lockedMidi: null,
  previewSlotCount: 1,
  hoverY: null,
  hoverX: null,
};
