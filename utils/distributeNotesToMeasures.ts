import { NoteData } from '@/types/note';

interface DistributeOptions {
  bpm: number;
  beatsPerMeasure: number;
  startMeasure: number;
}

/**
 * 연속된 음표 데이터를 마디별로 분배
 * measureIndex는 녹음 시작 기준 상대값 (0부터)
 * startMeasure를 더해서 실제 마디 번호로 변환
 * @param notes - 음표 배열 (measureIndex는 상대값)
 * @param options - bpm, beatsPerMeasure, startMeasure
 * @returns 마디 번호를 키로 하는 음표 배열 맵
 */
export function distributeNotesToMeasures(
  notes: NoteData[],
  options: DistributeOptions
): Record<number, NoteData[]> {
  const { startMeasure } = options;
  const result: Record<number, NoteData[]> = {};

  for (const note of notes) {
    // 쉼표도 포함 (처음부터 쉼표 표시)

    // measureIndex (상대값 0부터) + startMeasure = 실제 마디 번호
    const measureNumber = note.measureIndex + startMeasure;

    // 마디 배열 초기화
    if (!result[measureNumber]) {
      result[measureNumber] = [];
    }

    // slotIndex를 박자로 변환 (16슬롯 = 4박)
    const relativeBeat = note.slotIndex / 4;

    result[measureNumber].push({
      ...note,
      measureIndex: measureNumber,  // 실제 마디 번호로 업데이트
      beat: relativeBeat
    });
  }

  return result;
}

export default distributeNotesToMeasures;
