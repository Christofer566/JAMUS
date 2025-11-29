import { TimeSignature, StructureData, ProgressSection, MusicCalculationResult, ChordData } from '@/types/music';
import { ReactNode, createElement, Fragment } from 'react';

/**
 * 한 마디의 코드 문자열을 개별 코드로 분리
 * 예: "Dm7G7" → ["Dm7", "G7"]
 * 예: "C6Ebdim7" → ["C6", "Ebdim7"]
 * 예: "Am7" → ["Am7"]
 */
export function parseChords(chordString: string | undefined | null): string[] {
    // 타입 가드: 문자열이 아니거나 빈 경우 처리
    if (!chordString || typeof chordString !== 'string' || chordString.trim() === '') {
        return [''];
    }

    // 코드 패턴: 루트음(A-G) + 옵션(#/b) + 나머지(m, M, 7, dim, aug 등)
    // 정규식: 대문자(A-G)로 시작하고, 다음 대문자(A-G)가 나올 때까지를 하나의 코드로 인식
    // 단, 루트음 바로 뒤의 #/b는 루트음의 일부로 처리
    const chordPattern = /([A-G][#b]?)([^A-G]*)/g;
    const chords: string[] = [];
    let match;

    while ((match = chordPattern.exec(chordString)) !== null) {
        const root = match[1]; // A-G + 옵션 #/b
        const suffix = match[2]; // 나머지 (m7, dim7, 7#5 등)
        if (root) {
            chords.push(root + suffix);
        }
    }

    return chords.length > 0 ? chords : [chordString];
}

/**
 * 코드를 음악적 표기법으로 포맷팅 (문자열 반환 - 간단한 변환만)
 * - 루트음의 #/b를 ♯/♭로 변환
 *
 * 예: "Ebdim7" → "E♭dim7"
 * 예: "F#m7" → "F♯m7"
 */
export function formatChordSimple(chord: string | undefined | null): string {
    // 타입 가드: 문자열이 아니거나 빈 경우 처리
    if (!chord || typeof chord !== 'string' || chord.trim() === '') {
        return '';
    }

    // 루트음의 #/b를 ♯/♭로 변환 (루트음 바로 뒤에 오는 것만)
    return chord.replace(/^([A-G])b/, '$1♭').replace(/^([A-G])#/, '$1♯');
}

/**
 * 코드를 음악적 표기법으로 포맷팅 (ReactNode 반환 - 텐션 윗첨자 포함)
 * - 루트음의 #/b를 ♯/♭로 변환
 * - 텐션/알터레이션(#5, b5, #9, b9 등)을 윗첨자로
 *
 * 예: "D7#5" → D7<sup>♯5</sup>
 * 예: "Am7b5" → Am7<sup>♭5</sup>
 * 예: "Ebdim7" → E♭dim7
 * 예: "F#m7" → F♯m7
 */
export function formatChord(chord: string | undefined | null): ReactNode {
    // 타입 가드: 문자열이 아니거나 빈 경우 처리
    if (!chord || typeof chord !== 'string' || chord.trim() === '') {
        return '';
    }

    try {
        // 1단계: 루트음의 #/b를 ♯/♭로 변환 (루트음 바로 뒤에 오는 것만)
        const formatted = chord.replace(/^([A-G])b/, '$1♭').replace(/^([A-G])#/, '$1♯');

        // 2단계: 코드 끝부분의 텐션/알터레이션 찾기
        // 패턴: 숫자 뒤에 오는 #숫자 또는 b숫자 (예: 7#5, 7b5, 9#11, 13b9)
        const tensionMatch = formatted.match(/^(.+?)([#♯b♭]\d+)$/);

        if (tensionMatch) {
            const [, base, tension] = tensionMatch;
            // 텐션의 #/b도 기호로 변환
            const formattedTension = tension
                .replace(/b/g, '♭')
                .replace(/#/g, '♯');

            // React Fragment로 감싸서 반환
            return createElement(Fragment, null,
                base,
                createElement('sup', { className: 'text-[0.65em]' }, formattedTension)
            );
        }

        return formatted;
    } catch (e) {
        // 에러 발생 시 원본 문자열 반환
        console.error('🎵 [formatChord] 에러:', chord, e);
        return chord;
    }
}

/**
 * 코드 배열을 포맷팅된 ReactNode 배열로 변환
 * parseChords + formatChord 조합
 */
export function formatChordMeasure(chordString: string | undefined | null): { chords: ReactNode[], count: number } {
    try {
        const parsed = parseChords(chordString);
        const formatted = parsed.map(chord => formatChord(chord));
        return {
            chords: formatted,
            count: parsed.length
        };
    } catch (e) {
        console.error('🎵 [formatChordMeasure] 에러:', chordString, e);
        // 에러 시 원본 문자열 그대로 반환
        return {
            chords: [chordString || ''],
            count: 1
        };
    }
}

/**
 * 박자표에서 한 마디의 박자 수 추출
 */
export function getBeatsPerMeasure(timeSignature: TimeSignature): number {
    // 6/8박자 설명:
    // 재즈 스탠다드에서는 6/8을 2박(점4분음표 2개)으로 세는 경우가 많음 (Compound Duple Meter).
    // BPM이 점4분음표 기준이라고 가정하면 2박이 됨.
    const map: Record<TimeSignature, number> = {
        '4/4': 4,
        '3/4': 3,
        '6/8': 2,
        '2/4': 2,
        '5/4': 5,
    };
    return map[timeSignature] || 4;
}

/**
 * 한 마디의 지속 시간 계산 (초 단위)
 * 공식: measureDuration = (60 / BPM) × beatsPerMeasure
 * 예: BPM 120, 4/4박자 → (60 / 120) × 4 = 2초
 */
export function calculateMeasureDuration(
    bpm: number,
    timeSignature: TimeSignature
): number {
    const beatsPerMeasure = getBeatsPerMeasure(timeSignature);
    const secondsPerBeat = 60 / bpm;
    return secondsPerBeat * beatsPerMeasure;
}

/**
 * 특정 마디의 시작 시간 계산 (초 단위)
 */
export function getMeasureStartTime(
    measureNumber: number,
    measureDuration: number
): number {
    return (measureNumber - 1) * measureDuration;
}

/**
 * 현재 재생 시간에서 마디 번호 계산
 */
export function getCurrentMeasure(
    currentTime: number,
    measureDuration: number
): number {
    if (measureDuration === 0) return 1;
    return Math.floor(currentTime / measureDuration) + 1;
}

/**
 * N개 마디 뒤/앞으로 이동했을 때의 시간 계산
 */
export function seekByMeasures(
    currentTime: number,
    measureOffset: number,
    measureDuration: number,
    totalDuration: number
): number {
    const currentMeasure = getCurrentMeasure(currentTime, measureDuration);
    const targetMeasure = currentMeasure + measureOffset;

    // 1마디 미만으로 가면 0초(1마디 시작)로
    if (targetMeasure < 1) return 0;

    let targetTime = getMeasureStartTime(targetMeasure, measureDuration);

    // 전체 길이를 초과하면 전체 길이로 제한 (또는 마지막 마디 시작으로 제한할 수도 있음)
    // 여기서는 전체 길이로 제한
    targetTime = Math.max(0, Math.min(targetTime, totalDuration));

    return targetTime;
}

/**
 * structure_data로부터 progressSections 동적 생성
 */
export function generateProgressSections(
    structureData: StructureData,
    measureDuration: number
): ProgressSection[] {
    if (!structureData || !structureData.sections) return [];

    const sections: ProgressSection[] = [];

    structureData.sections.forEach((section) => {
        const startTime = getMeasureStartTime(section.startMeasure, measureDuration);
        sections.push({
            value: startTime,
            label: section.label,
        });
    });

    return sections;
}

/**
 * 종합 계산 함수
 */
export function calculateMusicMetrics(
    currentTime: number,
    bpm: number,
    timeSignature: TimeSignature,
    duration: number,
    structureData: StructureData
): MusicCalculationResult {
    const measureDuration = calculateMeasureDuration(bpm, timeSignature);
    const beatsPerMeasure = getBeatsPerMeasure(timeSignature);
    const currentMeasure = getCurrentMeasure(currentTime, measureDuration);
    const progressSections = generateProgressSections(structureData, measureDuration);

    return {
        measureDuration,
        beatsPerMeasure,
        currentMeasure,
        totalMeasures: structureData.totalMeasures,
        progressSections,
    };
}

/**
 * Feed용 코드 진행 생성
 * 구조: intro + chorus×4 + outro
 *
 * @param chordData - Supabase chord_data (intro, chorus, outro 각각의 코드 배열)
 * @param structureData - structure_data (마디 수 정보)
 * @returns 2D 배열 - Billboard용 코드 진행 (4마디씩 그룹핑)
 *
 * 예시 (Autumn Leaves 144마디):
 * - intro 8마디 → 2줄
 * - chorus 32마디 × 4 = 128마디 → 32줄
 * - outro 8마디 → 2줄
 * - 총 36줄
 */
export function generateFeedChordProgression(
    chordData: ChordData | undefined,
    structureData: StructureData | undefined
): string[][] {
    // 기본 더미 데이터 (chord_data가 없는 경우)
    const DEFAULT_PROGRESSION: string[][] = [
        ['C', 'G', 'Am', 'F'],
        ['C', 'Am', 'F', 'G'],
        ['C', 'F', 'G', 'C'],
        ['Dm', 'G', 'C', 'Am'],
        ['Dm', 'G', 'C', 'C'],
        ['F', 'G', 'Em', 'Am'],
        ['F', 'G', 'C', 'C'],
        ['Em', 'Am', 'Dm', 'G'],
        ['Em', 'F', 'G', 'C'],
        ['F', 'G', 'C', 'C'],
    ];

    if (!chordData || !structureData) {
        console.log('🎵 [generateFeedChordProgression] No chord_data, using default');
        return DEFAULT_PROGRESSION;
    }

    console.log('🎵 [generateFeedChordProgression] Input:', {
        intro: chordData.intro?.length || 0,
        chorus: chordData.chorus?.length || 0,
        outro: chordData.outro?.length || 0,
        introMeasures: structureData.introMeasures,
        chorusMeasures: structureData.chorusMeasures,
        outroMeasures: structureData.outroMeasures,
    });

    // 모든 마디의 코드를 순서대로 모음
    const allChords: string[] = [];

    // 1. Intro 코드 추가
    if (chordData.intro && chordData.intro.length > 0) {
        allChords.push(...chordData.intro);
    }

    // 2. Chorus × 4 추가
    if (chordData.chorus && chordData.chorus.length > 0) {
        for (let i = 0; i < 4; i++) {
            allChords.push(...chordData.chorus);
        }
    }

    // 3. Outro 코드 추가
    if (chordData.outro && chordData.outro.length > 0) {
        allChords.push(...chordData.outro);
    }

    console.log('🎵 [generateFeedChordProgression] Total chords:', allChords.length);

    // 4마디씩 그룹핑 (Billboard 표시용)
    const result: string[][] = [];
    for (let i = 0; i < allChords.length; i += 4) {
        const fourChords = allChords.slice(i, i + 4);
        // 4개 미만이면 빈 문자열로 패딩
        while (fourChords.length < 4) {
            fourChords.push('');
        }
        result.push(fourChords);
    }

    console.log('🎵 [generateFeedChordProgression] Output lines:', result.length);
    console.log('🎵 [generateFeedChordProgression] First 3 lines:', result.slice(0, 3));

    return result.length > 0 ? result : DEFAULT_PROGRESSION;
}
