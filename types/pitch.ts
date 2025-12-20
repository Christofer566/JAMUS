/**
 * 음정 분석을 위한 타입 정의
 */

export interface PitchFrame {
  time: number;        // 초 단위
  frequency: number;   // Hz (0이면 무음)
  confidence: number;  // 0-1
}
