/**
 * 코드 파싱 및 포맷팅 유틸리티
 * - 다중 코드 분리: "Dm7G7" → ["Dm7", "G7"]
 * - 음악적 표기법: Eb → E♭, F# → F♯, 7#5 → 7<sup>♯5</sup>
 */

import { ReactNode, Fragment, createElement } from 'react';

/**
 * 코드 입력을 개별 코드 배열로 분리
 * - 배열 입력: ['Cm7'] → ['Cm7'], ['Dm7', 'G7'] → ['Dm7', 'G7']
 * - 문자열 입력: "Dm7G7" → ["Dm7", "G7"], "C6Ebdim7" → ["C6", "Ebdim7"]
 * 파싱 실패 시 원본 반환
 */
export function parseChordString(chordInput: string | string[] | null | undefined): string[] {
    // 안전성 검사
    if (!chordInput) {
        return [];
    }

    // 배열인 경우: 각 요소를 다시 파싱 (혹시 "Dm7G7" 같은 합쳐진 코드가 있을 수 있음)
    if (Array.isArray(chordInput)) {
        const result: string[] = [];
        for (const item of chordInput) {
            if (typeof item === 'string' && item.trim() !== '') {
                const parsed = parseChordStringInternal(item);
                result.push(...parsed);
            }
        }
        return result.length > 0 ? result : [];
    }

    // 문자열인 경우
    if (typeof chordInput === 'string') {
        return parseChordStringInternal(chordInput);
    }

    return [];
}

/**
 * 문자열 코드 파싱 (내부 함수)
 */
function parseChordStringInternal(chordString: string): string[] {
    const trimmed = chordString.trim();
    if (trimmed === '') {
        return [];
    }

    try {
        // 코드 패턴: 루트음(A-G) + 옵션(#/b) + 나머지(m, M, 7, dim, aug 등)
        // 다음 대문자(A-G)가 나올 때까지를 하나의 코드로 인식
        const chordPattern = /([A-G][#b]?)([^A-G]*)/g;
        const chords: string[] = [];
        let match;

        while ((match = chordPattern.exec(trimmed)) !== null) {
            const root = match[1]; // A-G + 옵션 #/b
            const suffix = match[2]; // 나머지 (m7, dim7, 7#5 등)
            if (root) {
                chords.push(root + suffix);
            }
        }

        // 매칭 결과가 있으면 반환, 없으면 원본 반환
        return chords.length > 0 ? chords : [trimmed];
    } catch (e) {
        console.error('🎵 [parseChordString] 파싱 에러:', chordString, e);
        return [trimmed];
    }
}

/**
 * 코드를 음악적 표기법으로 포맷팅 (ReactNode 반환)
 *
 * 규칙:
 * - 루트음 (C, D, E, F, G, A, B): 기본 크기
 * - 루트음 변화 (♭, ♯): 기본 크기 (루트음 바로 뒤)
 * - 코드 품질 (m, M, dim, aug, sus): 윗첨자
 * - 숫자 (6, 7, 9, 11, 13): 윗첨자
 * - 텐션 (♭5, ♯5, ♭9, ♯9): 윗첨자
 * - 베이스음 (/G, /B♭): 기본 크기
 *
 * 예: "Cm7" → C<sup>m7</sup>
 * 예: "Ebdim7" → E♭<sup>dim7</sup>
 * 예: "Cm7b5" → C<sup>m7♭5</sup>
 * 예: "Cm7/Bb" → C<sup>m7</sup>/B♭
 */
export function formatChordDisplay(chord: string | null | undefined): ReactNode {
    // 안전성 검사
    if (!chord || typeof chord !== 'string') {
        return '';
    }

    const trimmed = chord.trim();
    if (trimmed === '') {
        return '';
    }

    try {
        // 1. 루트음 추출 (A-G + 옵션 #/b)
        const rootMatch = trimmed.match(/^([A-G])([#b])?/);
        if (!rootMatch) return trimmed;

        const rootNote = rootMatch[1];
        const rootAccidental = rootMatch[2]
            ? (rootMatch[2] === 'b' ? '♭' : '♯')
            : '';

        // 2. 나머지 부분 (품질 + 숫자 + 텐션)
        const rest = trimmed.slice(rootMatch[0].length);

        // 3. 나머지 부분의 b/#을 ♭/♯로 변환
        const formattedRest = rest
            .replace(/b/g, '♭')
            .replace(/#/g, '♯');

        // 4. 베이스음 처리 (/G, /Bb 등)
        const slashMatch = formattedRest.match(/^(.*)\/([A-G][♭♯]?)$/);
        if (slashMatch) {
            const [, quality, bassNote] = slashMatch;
            if (quality) {
                // 품질 + 베이스음: C<sup>m7</sup>/B♭
                return createElement(Fragment, null,
                    rootNote,
                    rootAccidental,
                    createElement('sup', { className: 'text-[0.7em]' }, quality),
                    '/',
                    bassNote
                );
            }
            // 루트음만 + 베이스음: C/G
            return createElement(Fragment, null,
                rootNote,
                rootAccidental,
                '/',
                bassNote
            );
        }

        // 5. 일반 코드: 루트음 + 윗첨자(나머지)
        if (formattedRest) {
            return createElement(Fragment, null,
                rootNote,
                rootAccidental,
                createElement('sup', { className: 'text-[0.7em]' }, formattedRest)
            );
        }

        // 6. 루트음만 (C, E♭ 등)
        return createElement(Fragment, null, rootNote, rootAccidental);

    } catch (e) {
        console.error('🎵 [formatChordDisplay] 포맷팅 에러:', chord, e);
        return chord; // 에러 시 원본 반환
    }
}

/**
 * 마디의 코드를 렌더링 (다중 코드 분리 + 포맷팅)
 * - 단일 코드: 중앙 정렬
 * - 다중 코드: 균등 분할 (좌/우)
 * - 배열/문자열 모두 지원
 */
export function renderChordMeasure(chordData: string | string[] | null | undefined): {
    nodes: ReactNode[];
    count: number;
    isEmpty: boolean;
} {
    const chords = parseChordString(chordData);

    if (chords.length === 0) {
        return { nodes: [], count: 0, isEmpty: true };
    }

    const nodes = chords.map((chord, index) =>
        createElement('span', { key: index }, formatChordDisplay(chord))
    );

    return {
        nodes,
        count: chords.length,
        isEmpty: false
    };
}
