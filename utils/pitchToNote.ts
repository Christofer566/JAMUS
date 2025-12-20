import { PitchFrame } from '@/types/pitch';
import { NoteData } from '@/types/note';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQ = 440;
const A4_MIDI = 69;

// MacLeod 알고리즘 최적화 파라미터
const CONFIDENCE_THRESHOLD = 0.2; // 정확도 유지
const MIN_NOTE_DURATION_SEC = 0.08; // 80ms
const MEDIAN_WINDOW = 5; // 노이즈 필터링
const MIN_BEATS_FOR_NOTE = 0.25; // 0.25박 이상
const MAX_NOTES_PER_MEASURE = 12; // 마디당 적절한 음표 수

// 악보 표시 적정 범위 (오선지 중심)
const TARGET_MIN_OCTAVE = 4; // C4 이상
const TARGET_MAX_OCTAVE = 5; // C6 미만

export function frequencyToNote(hz: number, octaveShift: number = 0): string {
  if (hz <= 0) return 'rest';

  const midiNote = Math.round(12 * Math.log2(hz / A4_FREQ) + A4_MIDI);
  const octave = Math.floor(midiNote / 12) - 1 + octaveShift;
  const noteIndex = ((midiNote % 12) + 12) % 12;

  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

// 주파수에서 옥타브만 추출
function frequencyToOctave(hz: number): number {
  if (hz <= 0) return -1;
  const midiNote = Math.round(12 * Math.log2(hz / A4_FREQ) + A4_MIDI);
  return Math.floor(midiNote / 12) - 1;
}

export function frequencyToMidi(hz: number): number {
  if (hz <= 0) return -1;
  return Math.round(12 * Math.log2(hz / A4_FREQ) + A4_MIDI);
}

// pitch 문자열에서 MIDI 번호 추출
function pitchToMidi(pitch: string): number {
  if (pitch === 'rest') return -1;

  const match = pitch.match(/^([A-G])([#b]?)(\d)$/);
  if (!match) return -1;

  const [, noteName, accidental, octave] = match;
  const noteIndex = NOTE_NAMES.indexOf(noteName + (accidental === '#' ? '#' : ''));
  if (noteIndex === -1) {
    // flat 처리
    const baseIndex = NOTE_NAMES.indexOf(noteName);
    if (accidental === 'b' && baseIndex > 0) {
      return (parseInt(octave) + 1) * 12 + baseIndex - 1;
    }
    return -1;
  }

  return (parseInt(octave) + 1) * 12 + noteIndex;
}

// 반음 차이 이내인지 확인
function isSimilarPitch(pitch1: string, pitch2: string): boolean {
  if (pitch1 === 'rest' || pitch2 === 'rest') return pitch1 === pitch2;

  const midi1 = pitchToMidi(pitch1);
  const midi2 = pitchToMidi(pitch2);

  if (midi1 === -1 || midi2 === -1) return false;

  return Math.abs(midi1 - midi2) <= 1; // 반음 차이 이내
}

function beatsToDuration(beats: number): string | null {
  // MIN_BEATS_FOR_NOTE 미만은 무시 (null 반환)
  if (beats < MIN_BEATS_FOR_NOTE) return null;

  // 8분음표까지 허용
  if (beats >= 3) return 'w';     // 온음표 (3박 이상)
  if (beats >= 1.5) return 'h';   // 2분음표 (1.5박 이상)
  if (beats >= 0.7) return 'q';   // 4분음표 (0.7박 이상)
  return '8';                      // 8분음표 (0.3박 이상)
}

// 미디언 필터로 노이즈 제거
function medianFilter(frames: PitchFrame[], windowSize: number): PitchFrame[] {
  const result: PitchFrame[] = [];
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < frames.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(frames.length, i + halfWindow + 1);

    // 해당 윈도우의 주파수들 (0이 아닌 것만)
    const freqs = frames.slice(start, end)
      .filter(f => f.frequency > 0 && f.confidence >= CONFIDENCE_THRESHOLD)
      .map(f => f.frequency)
      .sort((a, b) => a - b);

    if (freqs.length === 0) {
      result.push({ ...frames[i], frequency: 0, confidence: 0 });
    } else {
      const medianFreq = freqs[Math.floor(freqs.length / 2)];
      result.push({ ...frames[i], frequency: medianFreq });
    }
  }

  return result;
}

// 마디당 음표 수 제한 (가장 짧은 음표를 인접 음표에 병합)
function limitNotesPerMeasure(notes: NoteData[], beatsPerMeasure: number): NoteData[] {
  // 마디별로 그룹화
  const measureGroups: Map<number, NoteData[]> = new Map();

  for (const note of notes) {
    const measureIndex = Math.floor(note.startBeat / beatsPerMeasure);
    if (!measureGroups.has(measureIndex)) {
      measureGroups.set(measureIndex, []);
    }
    measureGroups.get(measureIndex)!.push(note);
  }

  const result: NoteData[] = [];

  for (const [, measureNotes] of measureGroups) {
    let currentNotes = [...measureNotes];

    // 마디당 최대 음표 수 초과시 병합
    while (currentNotes.length > MAX_NOTES_PER_MEASURE) {
      // duration을 beats로 변환하여 가장 짧은 음표 찾기
      let shortestIdx = 0;
      let shortestBeats = Infinity;

      for (let i = 0; i < currentNotes.length; i++) {
        const note = currentNotes[i];
        const beats = note.duration === 'w' ? 4 :
                      note.duration === 'h' ? 2 :
                      note.duration === 'q' ? 1 : 0.5;
        if (beats < shortestBeats && !note.isRest) {
          shortestBeats = beats;
          shortestIdx = i;
        }
      }

      // 가장 짧은 음표를 이전 또는 다음 음표에 병합
      if (shortestIdx > 0) {
        // 이전 음표에 병합
        const prevNote = currentNotes[shortestIdx - 1];
        const currNote = currentNotes[shortestIdx];
        const prevBeats = prevNote.duration === 'w' ? 4 :
                          prevNote.duration === 'h' ? 2 :
                          prevNote.duration === 'q' ? 1 : 0.5;
        const currBeats = currNote.duration === 'w' ? 4 :
                          currNote.duration === 'h' ? 2 :
                          currNote.duration === 'q' ? 1 : 0.5;
        const newDuration = beatsToDuration(prevBeats + currBeats);
        if (newDuration) {
          prevNote.duration = newDuration;
        }
        currentNotes.splice(shortestIdx, 1);
      } else if (currentNotes.length > 1) {
        // 다음 음표에 병합
        currentNotes.splice(0, 1);
      } else {
        break;
      }
    }

    result.push(...currentNotes);
  }

  // startBeat 순으로 정렬
  result.sort((a, b) => a.startBeat - b.startBeat);

  return result;
}

export function convertToNotes(frames: PitchFrame[], bpm: number): NoteData[] {
  console.log('[PitchToNote] 변환 시작:', { 입력프레임수: frames.length, bpm });

  if (frames.length === 0) {
    console.log('[PitchToNote] 입력 프레임 없음');
    return [];
  }

  const safeBpm = bpm > 0 ? bpm : 120;
  const beatDuration = 60 / safeBpm;
  const beatsPerMeasure = 4; // 4/4 박자 가정

  // confidence 분포 확인
  const highConfFrames = frames.filter(f => f.confidence >= CONFIDENCE_THRESHOLD);
  console.log('[PitchToNote] confidence 필터링:', {
    threshold: CONFIDENCE_THRESHOLD,
    전체: frames.length,
    'threshold이상': highConfFrames.length,
    비율: ((highConfFrames.length / frames.length) * 100).toFixed(1) + '%'
  });

  // 자동 옥타브 조정: 유효 프레임들의 평균 옥타브 계산
  const validFrames = frames.filter(f => f.confidence >= CONFIDENCE_THRESHOLD && f.frequency > 0);
  let octaveShift = 0;

  if (validFrames.length > 0) {
    const avgOctave = validFrames.reduce((sum, f) => sum + frequencyToOctave(f.frequency), 0) / validFrames.length;
    const targetCenter = (TARGET_MIN_OCTAVE + TARGET_MAX_OCTAVE) / 2; // 4.5
    octaveShift = Math.round(targetCenter - avgOctave);

    console.log('[PitchToNote] 옥타브 자동 조정:', {
      평균옥타브: avgOctave.toFixed(1),
      목표범위: `${TARGET_MIN_OCTAVE}~${TARGET_MAX_OCTAVE}`,
      조정값: octaveShift > 0 ? `+${octaveShift}` : octaveShift
    });
  }

  // 1. 미디언 필터 적용
  const filteredFrames = medianFilter(frames, MEDIAN_WINDOW);

  // 2. 프레임을 노트로 변환 (옥타브 조정 적용)
  const rawNotes: NoteData[] = [];
  let currentPitch: string | null = null;
  let currentStartTime = 0;
  let currentStartBeat = 0;

  for (const frame of filteredFrames) {
    const isRest = frame.confidence < CONFIDENCE_THRESHOLD || frame.frequency <= 0;
    const pitch = isRest ? 'rest' : frequencyToNote(frame.frequency, octaveShift);

    if (pitch !== currentPitch && currentPitch !== null) {
      const durationSeconds = frame.time - currentStartTime;
      const durationBeats = durationSeconds / beatDuration;
      const duration = beatsToDuration(durationBeats);

      // 0.8박 미만은 무시
      if (duration !== null) {
        rawNotes.push({
          pitch: currentPitch,
          duration,
          startBeat: currentStartBeat,
          isRest: currentPitch === 'rest'
        });
      }

      currentStartTime = frame.time;
      currentStartBeat = frame.time / beatDuration;
    }

    if (currentPitch === null) {
      currentStartTime = frame.time;
      currentStartBeat = frame.time / beatDuration;
    }

    currentPitch = pitch;
  }

  // 마지막 노트 추가
  if (currentPitch !== null && filteredFrames.length > 0) {
    const lastFrame = filteredFrames[filteredFrames.length - 1];
    const durationSeconds = lastFrame.time - currentStartTime + 0.023;
    const durationBeats = durationSeconds / beatDuration;
    const duration = beatsToDuration(durationBeats);

    if (duration !== null) {
      rawNotes.push({
        pitch: currentPitch,
        duration,
        startBeat: currentStartBeat,
        isRest: currentPitch === 'rest'
      });
    }
  }

  // 3. 너무 짧은 노트 필터링 및 반음 차이 이내 병합
  const minDurationBeats = MIN_NOTE_DURATION_SEC / beatDuration;
  const mergedNotes: NoteData[] = [];

  for (const note of rawNotes) {
    const durationBeats = note.duration === 'w' ? 4 :
                          note.duration === 'h' ? 2 :
                          note.duration === 'q' ? 1 : 0.5; // 8분음표 포함

    // 너무 짧은 노트는 건너뛰기 (쉼표 제외)
    if (!note.isRest && durationBeats < minDurationBeats) {
      continue;
    }

    // 이전 노트와 반음 차이 이내면 병합
    if (mergedNotes.length > 0) {
      const lastNote = mergedNotes[mergedNotes.length - 1];
      if (isSimilarPitch(lastNote.pitch, note.pitch) && !note.isRest && !lastNote.isRest) {
        // 길이 업데이트
        const lastBeats = lastNote.duration === 'w' ? 4 :
                          lastNote.duration === 'h' ? 2 :
                          lastNote.duration === 'q' ? 1 : 0.5;
        const combinedBeats = (note.startBeat - lastNote.startBeat) + durationBeats;
        const newDuration = beatsToDuration(Math.max(lastBeats, combinedBeats));
        if (newDuration) {
          lastNote.duration = newDuration;
        }
        continue;
      }
    }

    mergedNotes.push(note);
  }

  // 4. 마디당 최대 음표 수 제한
  const limitedNotes = limitNotesPerMeasure(mergedNotes, beatsPerMeasure);

  console.log('[PitchToNote] 변환 결과:', {
    rawNotes수: rawNotes.length,
    병합후: mergedNotes.length,
    최종음표수: limitedNotes.length
  });

  // 최종 음표 상세 로그
  if (limitedNotes.length > 0) {
    console.log('[PitchToNote] 최종 음표 목록:');
    limitedNotes.forEach((note, i) => {
      console.log(`  [${i}] ${note.pitch} (${note.duration}) @ beat ${note.startBeat.toFixed(2)}`);
    });
  }

  return limitedNotes;
}
