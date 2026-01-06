/**
 * 곡 데이터 정의
 * Single/Feedback 페이지에서 사용하는 곡 정보
 */

import { ChordData, StructureData, AudioUrls, TimeSignature } from '@/types/music';

// 섹션 정의 (Single/Feedback용)
export interface SongSection {
    id: string;
    label: string;
    isJamSection: boolean;
    measures: { chord: string }[];
}

// 곡 메타데이터
export interface SongMeta {
    id: string;
    title: string;
    artist: string;
    bpm: number;
    time_signature: TimeSignature;
    key: string;  // Phase 113: Scale Mapping용 키 정보 (예: "Gm", "C", "Am")
}

// 전체 곡 데이터
export interface SongData {
    meta: SongMeta;
    audioUrls: AudioUrls;
    sections: SongSection[];
    chordData: ChordData;
    structureData: StructureData;
}

/**
 * Autumn Leaves - Jazz Standard (Gm key)
 *
 * 구조: Intro (8) + Chorus AABA (32) + Outro (8) = 48마디
 *
 * A section (8 bars):
 * | Cm7 | F7 | Bbmaj7 | Ebmaj7 | Am7b5 | D7 | Gm6 | Gm6 |
 *
 * B section (8 bars):
 * | Am7b5 | D7 | Gm6 | Gm6 | Cm7 | F7 | Bbmaj7 | Ebmaj7 |
 */

// A section 코드 (8마디)
const AUTUMN_LEAVES_A = ['Cm7', 'F7', 'Bbmaj7', 'Ebmaj7', 'Am7b5', 'D7', 'Gm6', 'Gm6'];

// B section 코드 (8마디)
const AUTUMN_LEAVES_B = ['Am7b5', 'D7', 'Gm6', 'Gm6', 'Cm7', 'F7', 'Bbmaj7', 'Ebmaj7'];

// Intro (A section 사용)
const AUTUMN_LEAVES_INTRO = [...AUTUMN_LEAVES_A];

// Chorus: AABA (32마디)
const AUTUMN_LEAVES_CHORUS = [
    ...AUTUMN_LEAVES_A, // A (1-8)
    ...AUTUMN_LEAVES_A, // A (9-16)
    ...AUTUMN_LEAVES_B, // B (17-24)
    ...AUTUMN_LEAVES_A, // A (25-32)
];

// Outro (A section 사용)
const AUTUMN_LEAVES_OUTRO = [...AUTUMN_LEAVES_A];

// 마디별 코드 객체 배열로 변환
const toMeasures = (chords: string[]): { chord: string }[] =>
    chords.map(chord => ({ chord }));

export const AUTUMN_LEAVES: SongData = {
    meta: {
        id: 'autumn-leaves',
        title: 'Autumn Leaves',
        artist: 'Jazz Standard',
        bpm: 142,
        time_signature: '4/4',
        key: 'Gm',  // G minor
    },
    audioUrls: {
        intro: 'https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/autumn-leaves/intro.mp3',
        chorus: 'https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/autumn-leaves/chorus.mp3',
        outro: 'https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/autumn-leaves/outro.mp3',
    },
    sections: [
        {
            id: 'intro',
            label: 'Intro',
            isJamSection: false,
            measures: toMeasures(AUTUMN_LEAVES_INTRO)
        },
        {
            id: 'chorus',
            label: 'Chorus',
            isJamSection: true,
            measures: toMeasures(AUTUMN_LEAVES_CHORUS)
        },
        {
            id: 'outro',
            label: 'Outro',
            isJamSection: false,
            measures: toMeasures(AUTUMN_LEAVES_OUTRO)
        },
    ],
    chordData: {
        intro: AUTUMN_LEAVES_INTRO,
        chorus: AUTUMN_LEAVES_CHORUS,
        outro: AUTUMN_LEAVES_OUTRO,
    },
    structureData: {
        introMeasures: 8,
        outroMeasures: 8,
        chorusMeasures: 32,
        totalMeasures: 48,
        feedTotalMeasures: 48,
        chorusPattern: 'AABA',
        sections: [
            { name: 'intro', label: 'Intro', startMeasure: 1, endMeasure: 8 },
            { name: 'chorus', label: 'Chorus', startMeasure: 9, endMeasure: 40 },
            { name: 'outro', label: 'Outro', startMeasure: 41, endMeasure: 48 },
        ],
    },
};

/**
 * All of Me - Jazz Standard (C key)
 *
 * 구조: Intro (8) + Chorus AABA (32) + Outro (8) = 48마디
 *
 * A section (8 bars):
 * | C | E7 | A7 | A7 | Dm | Dm | E7 | E7 |
 *
 * B section (8 bars):
 * | Am | Am | D7 | D7 | Dm7 | G7 | C | C |
 */
const ALL_OF_ME_A = ['C', 'E7', 'A7', 'A7', 'Dm', 'Dm', 'E7', 'E7'];
const ALL_OF_ME_B = ['Am', 'Am', 'D7', 'D7', 'Dm7', 'G7', 'C', 'C'];
const ALL_OF_ME_INTRO = [...ALL_OF_ME_A];
const ALL_OF_ME_CHORUS = [
    ...ALL_OF_ME_A, // A (1-8)
    ...ALL_OF_ME_A, // A (9-16)
    ...ALL_OF_ME_B, // B (17-24)
    ...ALL_OF_ME_A, // A (25-32)
];
const ALL_OF_ME_OUTRO = [...ALL_OF_ME_A];

export const ALL_OF_ME: SongData = {
    meta: {
        id: 'all-of-me',
        title: 'All of Me',
        artist: 'Jazz Standard',
        bpm: 126,
        time_signature: '4/4',
        key: 'C',
    },
    audioUrls: {
        intro: 'https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/all-of-me/intro.mp3',
        chorus: 'https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/all-of-me/chorus.mp3',
        outro: 'https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/all-of-me/outro.mp3',
    },
    sections: [
        { id: 'intro', label: 'Intro', isJamSection: false, measures: toMeasures(ALL_OF_ME_INTRO) },
        { id: 'chorus', label: 'Chorus', isJamSection: true, measures: toMeasures(ALL_OF_ME_CHORUS) },
        { id: 'outro', label: 'Outro', isJamSection: false, measures: toMeasures(ALL_OF_ME_OUTRO) },
    ],
    chordData: {
        intro: ALL_OF_ME_INTRO,
        chorus: ALL_OF_ME_CHORUS,
        outro: ALL_OF_ME_OUTRO,
    },
    structureData: {
        introMeasures: 8,
        outroMeasures: 8,
        chorusMeasures: 32,
        totalMeasures: 48,
        feedTotalMeasures: 48,
        chorusPattern: 'AABA',
        sections: [
            { name: 'intro', label: 'Intro', startMeasure: 1, endMeasure: 8 },
            { name: 'chorus', label: 'Chorus', startMeasure: 9, endMeasure: 40 },
            { name: 'outro', label: 'Outro', startMeasure: 41, endMeasure: 48 },
        ],
    },
};

/**
 * Blue Bossa - Kenny Dorham (Cm key)
 *
 * 구조: Intro (8) + Chorus (16x2=32) + Outro (8) = 48마디
 * 라틴 보사노바 스타일
 *
 * 16바 form (반복):
 * | Cm7 | Cm7 | Fm7 | Fm7 | Dm7b5 | G7 | Cm7 | Cm7 |
 * | Ebm7 | Ab7 | Dbmaj7 | Dbmaj7 | Dm7b5 | G7 | Cm7 | Cm7 |
 */
const BLUE_BOSSA_FORM = [
    'Cm7', 'Cm7', 'Fm7', 'Fm7', 'Dm7b5', 'G7', 'Cm7', 'Cm7',
    'Ebm7', 'Ab7', 'Dbmaj7', 'Dbmaj7', 'Dm7b5', 'G7', 'Cm7', 'Cm7'
];
const BLUE_BOSSA_INTRO = BLUE_BOSSA_FORM.slice(0, 8);
const BLUE_BOSSA_CHORUS = [...BLUE_BOSSA_FORM, ...BLUE_BOSSA_FORM]; // 2회 반복 = 32마디
const BLUE_BOSSA_OUTRO = BLUE_BOSSA_FORM.slice(0, 8);

export const BLUE_BOSSA: SongData = {
    meta: {
        id: 'blue-bossa',
        title: 'Blue Bossa',
        artist: 'Kenny Dorham',
        bpm: 150,
        time_signature: '4/4',
        key: 'Cm',
    },
    audioUrls: {
        intro: 'https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/blue-bossa/intro.mp3',
        chorus: 'https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/blue-bossa/chorus.mp3',
        outro: 'https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/blue-bossa/outro.mp3',
    },
    sections: [
        { id: 'intro', label: 'Intro', isJamSection: false, measures: toMeasures(BLUE_BOSSA_INTRO) },
        { id: 'chorus', label: 'Chorus', isJamSection: true, measures: toMeasures(BLUE_BOSSA_CHORUS) },
        { id: 'outro', label: 'Outro', isJamSection: false, measures: toMeasures(BLUE_BOSSA_OUTRO) },
    ],
    chordData: {
        intro: BLUE_BOSSA_INTRO,
        chorus: BLUE_BOSSA_CHORUS,
        outro: BLUE_BOSSA_OUTRO,
    },
    structureData: {
        introMeasures: 8,
        outroMeasures: 8,
        chorusMeasures: 32,
        totalMeasures: 48,
        feedTotalMeasures: 48,
        chorusPattern: 'AA',
        sections: [
            { name: 'intro', label: 'Intro', startMeasure: 1, endMeasure: 8 },
            { name: 'chorus', label: 'Chorus', startMeasure: 9, endMeasure: 40 },
            { name: 'outro', label: 'Outro', startMeasure: 41, endMeasure: 48 },
        ],
    },
};

// 모든 곡 목록
export const ALL_SONGS: Record<string, SongData> = {
    'autumn-leaves': AUTUMN_LEAVES,
    'all-of-me': ALL_OF_ME,
    'blue-bossa': BLUE_BOSSA,
};

// 곡 ID로 곡 데이터 가져오기
export function getSongById(songId: string): SongData | undefined {
    return ALL_SONGS[songId];
}

// 기본 곡 (현재는 Autumn Leaves)
export const DEFAULT_SONG = AUTUMN_LEAVES;
