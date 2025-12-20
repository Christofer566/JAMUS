/**
 * 음표 데이터를 위한 타입 정의
 */

export interface NoteData {
  pitch: string;       // "C4", "D4", "rest" 등
  duration: string;    // "q" (4분), "8" (8분), "h" (2분)
  startBeat: number;   // 시작 박자 (0부터)
  isRest: boolean;     // 쉼표 여부
}
