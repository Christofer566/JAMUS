/**
 * 음정 분석을 위한 타입 정의
 */

export interface PitchFrame {
  time: number;                 // 초 단위
  frequency: number;            // Hz (0이면 무음)
  confidence: number;           // 0-1
  isMpmCorrected?: boolean;     // MPM 서브하모닉 검출로 보정되었는가?
  originalFrequency?: number;   // 보정 전 원본 주파수
  correctionFactor?: number;    // 보정 배수 (2, 3, 4, 5 등)
}
