# DEV_MEMO: W04 Task 2 - BPM 기반 오디오 Seek 시스템 구현

**작성일**: 2025-11-25  
**Task ID**: W04-T2  
**작업명**: Z/X 키보드 컨트롤로 measure 단위 오디오 seek  
**복잡도**: 8-9/10 (초기 6/10에서 상향)  
**예상 소요시간**: 3-4시간 (초기 1.5-2시간에서 상향)

---

## 📋 Executive Summary

단순 키보드 컨트롤 추가 작업이 **음악 앱 전체의 시간 처리 시스템 재설계**로 확장됨. 고정 초 단위 seek에서 BPM 기반 measure(마디) 단위 계산으로 전환하여 음악적 정확성 확보. 이는 향후 chord progression, section navigation, tempo sync 등 모든 음악적 기능의 기반이 됨.

---

## 🎯 문제 정의 및 범위 확장

### 초기 계획 (WTL 작성 시)
- Z 키: 2초 뒤로 이동
- X 키: 2초 앞으로 이동
- 복잡도 6/10, 1.5-2시간

### 실제 필요사항 (구현 중 발견)
- **음악적 단위 사용 필수**: 고정 초가 아닌 BPM 기반 measure 계산
- **곡별 가변 데이터**: 각 곡마다 다른 BPM, 박자, 구조
- **Dynamic progressSections**: 하드코딩된 시간값 → 실시간 계산
- **데이터베이스 확장**: Supabase 스키마에 음악 메타데이터 추가

### 왜 고정 초가 안 되는가?

**문제점**:
```
BPM 120, 4/4박자: 1마디 = 2초
BPM 180, 4/4박자: 1마디 = 1.33초
BPM 90, 4/4박자: 1마디 = 2.67초

→ "2초 seek"는 어떤 곡에서는 1마디, 어떤 곡에서는 1.5마디
→ 음악적으로 의미 없는 위치로 이동
```

**올바른 방식**:
```
사용자 의도: "한 마디 뒤로"
시스템 동작: BPM 계산 → 해당 곡에서 1마디 = N초 → N초 seek
```

---

## 🗄️ 1단계: Supabase 스키마 확장

### 현재 songs 테이블 구조
```sql
CREATE TABLE songs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  artist text NOT NULL,
  audio_url text,
  image_url text,
  duration integer,
  created_at timestamp with time zone DEFAULT now()
);
```

### 추가 필요 컬럼

```sql
ALTER TABLE songs
ADD COLUMN bpm integer NOT NULL DEFAULT 120,
ADD COLUMN time_signature text NOT NULL DEFAULT '4/4',
ADD COLUMN structure_data jsonb;

COMMENT ON COLUMN songs.bpm IS 'Beats Per Minute - 템포';
COMMENT ON COLUMN songs.time_signature IS '박자표 (4/4, 3/4, 6/8 등)';
COMMENT ON COLUMN songs.structure_data IS '곡 구조 정보 (intro/outro 마디, 섹션 구성)';
```

### structure_data JSONB 스키마

```json
{
  "introMeasures": 8,
  "outroMeasures": 8,
  "sections": [
    {
      "name": "Intro",
      "startMeasure": 1,
      "endMeasure": 8,
      "label": "Intro (8 bars)"
    },
    {
      "name": "A",
      "startMeasure": 9,
      "endMeasure": 40,
      "label": "A Section (32 bars)"
    },
    {
      "name": "A",
      "startMeasure": 41,
      "endMeasure": 72,
      "label": "A Section (32 bars)"
    },
    {
      "name": "B",
      "startMeasure": 73,
      "endMeasure": 104,
      "label": "B Section (32 bars)"
    },
    {
      "name": "A",
      "startMeasure": 105,
      "endMeasure": 136,
      "label": "A Section (32 bars)"
    },
    {
      "name": "Outro",
      "startMeasure": 137,
      "endMeasure": 144,
      "label": "Outro (8 bars)"
    }
  ],
  "totalMeasures": 144
}
```

### 3개 곡 실제 데이터 예시

```sql
-- Autumn Leaves (BPM 140, 4/4, AABA 구조)
UPDATE songs 
SET 
  bpm = 140,
  time_signature = '4/4',
  structure_data = '{
    "introMeasures": 8,
    "outroMeasures": 8,
    "sections": [
      {"name": "Intro", "startMeasure": 1, "endMeasure": 8, "label": "Intro (8 bars)"},
      {"name": "A", "startMeasure": 9, "endMeasure": 40, "label": "A Section (32 bars)"},
      {"name": "A", "startMeasure": 41, "endMeasure": 72, "label": "A Section (32 bars)"},
      {"name": "B", "startMeasure": 73, "endMeasure": 104, "label": "B Section (32 bars)"},
      {"name": "A", "startMeasure": 105, "endMeasure": 136, "label": "A Section (32 bars)"},
      {"name": "Outro", "startMeasure": 137, "endMeasure": 144, "label": "Outro (8 bars)"}
    ],
    "totalMeasures": 144
  }'::jsonb
WHERE title = 'Autumn Leaves';

-- Blue Bossa (BPM 130, 4/4, 16마디 반복)
UPDATE songs 
SET 
  bpm = 130,
  time_signature = '4/4',
  structure_data = '{
    "introMeasures": 4,
    "outroMeasures": 4,
    "sections": [
      {"name": "Intro", "startMeasure": 1, "endMeasure": 4, "label": "Intro (4 bars)"},
      {"name": "A", "startMeasure": 5, "endMeasure": 20, "label": "A Section (16 bars)"},
      {"name": "A", "startMeasure": 21, "endMeasure": 36, "label": "A Section (16 bars)"},
      {"name": "A", "startMeasure": 37, "endMeasure": 52, "label": "A Section (16 bars)"},
      {"name": "A", "startMeasure": 53, "endMeasure": 68, "label": "A Section (16 bars)"},
      {"name": "A", "startMeasure": 69, "endMeasure": 84, "label": "A Section (16 bars)"},
      {"name": "A", "startMeasure": 85, "endMeasure": 100, "label": "A Section (16 bars)"},
      {"name": "A", "startMeasure": 101, "endMeasure": 116, "label": "A Section (16 bars)"},
      {"name": "A", "startMeasure": 117, "endMeasure": 132, "label": "A Section (16 bars)"},
      {"name": "Outro", "startMeasure": 133, "endMeasure": 136, "label": "Outro (4 bars)"}
    ],
    "totalMeasures": 136
  }'::jsonb
WHERE title = 'Blue Bossa';

-- All of Me (BPM 120, 4/4, AABA 구조)
UPDATE songs 
SET 
  bpm = 120,
  time_signature = '4/4',
  structure_data = '{
    "introMeasures": 8,
    "outroMeasures": 8,
    "sections": [
      {"name": "Intro", "startMeasure": 1, "endMeasure": 8, "label": "Intro (8 bars)"},
      {"name": "A", "startMeasure": 9, "endMeasure": 16, "label": "A Section (8 bars)"},
      {"name": "A", "startMeasure": 17, "endMeasure": 24, "label": "A Section (8 bars)"},
      {"name": "B", "startMeasure": 25, "endMeasure": 32, "label": "B Section (8 bars)"},
      {"name": "A", "startMeasure": 33, "endMeasure": 40, "label": "A Section (8 bars)"},
      {"name": "Outro", "startMeasure": 41, "endMeasure": 48, "label": "Outro (8 bars)"}
    ],
    "totalMeasures": 48
  }'::jsonb
WHERE title = 'All of Me';
```

---

## 🔧 2단계: TypeScript 타입 정의

### types/music.ts (신규 파일)

```typescript
/**
 * 음악적 시간 계산을 위한 타입 정의
 */

export type TimeSignature = '4/4' | '3/4' | '6/8' | '2/4' | '5/4';

export interface MusicSection {
  name: string;
  startMeasure: number;
  endMeasure: number;
  label: string;
}

export interface StructureData {
  introMeasures: number;
  outroMeasures: number;
  sections: MusicSection[];
  totalMeasures: number;
}

export interface SongWithMusicData {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  image_url: string;
  duration: number;
  bpm: number;
  time_signature: TimeSignature;
  structure_data: StructureData;
}

export interface ProgressSection {
  value: number;
  label: string;
}

export interface MusicCalculationResult {
  measureDuration: number;
  beatsPerMeasure: number;
  currentMeasure: number;
  totalMeasures: number;
  progressSections: ProgressSection[];
}
```

---

## 🧮 3단계: Musical Calculation Utilities

### utils/musicCalculations.ts (신규 파일)

```typescript
import { TimeSignature, StructureData, ProgressSection, MusicCalculationResult } from '@/types/music';

/**
 * 박자표에서 한 마디의 박자 수 추출
 */
export function getBeatsPerMeasure(timeSignature: TimeSignature): number {
  const map: Record<TimeSignature, number> = {
    '4/4': 4,
    '3/4': 3,
    '6/8': 2, // 6/8박자는 큰 박이 2개 (8분음표 6개를 2그룹으로)
    '2/4': 2,
    '5/4': 5,
  };
  return map[timeSignature] || 4;
}

/**
 * 한 마디의 지속 시간 계산 (초 단위)
 * @param bpm - Beats Per Minute
 * @param timeSignature - 박자표
 * @returns 1마디의 초 단위 길이
 * 
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
 * @param measureNumber - 마디 번호 (1부터 시작)
 * @param measureDuration - 한 마디의 길이 (초)
 * @returns 해당 마디의 시작 시간
 */
export function getMeasureStartTime(
  measureNumber: number,
  measureDuration: number
): number {
  return (measureNumber - 1) * measureDuration;
}

/**
 * 현재 재생 시간에서 마디 번호 계산
 * @param currentTime - 현재 재생 시간 (초)
 * @param measureDuration - 한 마디의 길이 (초)
 * @returns 현재 마디 번호 (1부터 시작)
 */
export function getCurrentMeasure(
  currentTime: number,
  measureDuration: number
): number {
  return Math.floor(currentTime / measureDuration) + 1;
}

/**
 * N개 마디 뒤/앞으로 이동했을 때의 시간 계산
 * @param currentTime - 현재 재생 시간 (초)
 * @param measureOffset - 이동할 마디 수 (음수면 뒤로, 양수면 앞으로)
 * @param measureDuration - 한 마디의 길이 (초)
 * @param totalDuration - 곡 전체 길이 (초)
 * @returns 이동 후 재생 시간 (0 ~ totalDuration 범위 내)
 */
export function seekByMeasures(
  currentTime: number,
  measureOffset: number,
  measureDuration: number,
  totalDuration: number
): number {
  const currentMeasure = getCurrentMeasure(currentTime, measureDuration);
  const targetMeasure = currentMeasure + measureOffset;
  
  // 마디 번호를 시간으로 변환
  let targetTime = getMeasureStartTime(targetMeasure, measureDuration);
  
  // 범위 제한
  targetTime = Math.max(0, Math.min(targetTime, totalDuration));
  
  return targetTime;
}

/**
 * structure_data로부터 progressSections 동적 생성
 * @param structureData - Supabase의 structure_data
 * @param measureDuration - 한 마디의 길이 (초)
 * @returns PlayerBar에서 사용할 progressSections 배열
 */
export function generateProgressSections(
  structureData: StructureData,
  measureDuration: number
): ProgressSection[] {
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
 * 종합 계산 함수 - 필요한 모든 음악적 계산 수행
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
```

### utils/musicCalculations.test.ts (테스트 파일)

```typescript
import {
  getBeatsPerMeasure,
  calculateMeasureDuration,
  getMeasureStartTime,
  getCurrentMeasure,
  seekByMeasures,
} from './musicCalculations';

describe('Music Calculations', () => {
  describe('getBeatsPerMeasure', () => {
    it('4/4박자는 4박', () => {
      expect(getBeatsPerMeasure('4/4')).toBe(4);
    });
    
    it('3/4박자는 3박', () => {
      expect(getBeatsPerMeasure('3/4')).toBe(3);
    });
    
    it('6/8박자는 2박 (큰 박 기준)', () => {
      expect(getBeatsPerMeasure('6/8')).toBe(2);
    });
  });
  
  describe('calculateMeasureDuration', () => {
    it('BPM 120, 4/4박자 → 1마디 2초', () => {
      expect(calculateMeasureDuration(120, '4/4')).toBe(2);
    });
    
    it('BPM 180, 4/4박자 → 1마디 1.33초', () => {
      expect(calculateMeasureDuration(180, '4/4')).toBeCloseTo(1.33, 2);
    });
    
    it('BPM 90, 3/4박자 → 1마디 2초', () => {
      expect(calculateMeasureDuration(90, '3/4')).toBe(2);
    });
  });
  
  describe('getMeasureStartTime', () => {
    const measureDuration = 2; // 2초/마디
    
    it('1마디 시작 = 0초', () => {
      expect(getMeasureStartTime(1, measureDuration)).toBe(0);
    });
    
    it('5마디 시작 = 8초', () => {
      expect(getMeasureStartTime(5, measureDuration)).toBe(8);
    });
  });
  
  describe('getCurrentMeasure', () => {
    const measureDuration = 2; // 2초/마디
    
    it('0초 = 1마디', () => {
      expect(getCurrentMeasure(0, measureDuration)).toBe(1);
    });
    
    it('3초 = 2마디', () => {
      expect(getCurrentMeasure(3, measureDuration)).toBe(2);
    });
    
    it('8초 = 5마디', () => {
      expect(getCurrentMeasure(8, measureDuration)).toBe(5);
    });
  });
  
  describe('seekByMeasures', () => {
    const measureDuration = 2; // 2초/마디
    const totalDuration = 100; // 곡 길이 100초
    
    it('10초에서 +1마디 = 12초', () => {
      expect(seekByMeasures(10, 1, measureDuration, totalDuration)).toBe(12);
    });
    
    it('10초에서 -1마디 = 8초', () => {
      expect(seekByMeasures(10, -1, measureDuration, totalDuration)).toBe(8);
    });
    
    it('범위 초과 시 0초로 제한', () => {
      expect(seekByMeasures(1, -5, measureDuration, totalDuration)).toBe(0);
    });
    
    it('범위 초과 시 totalDuration으로 제한', () => {
      expect(seekByMeasures(98, 5, measureDuration, totalDuration)).toBe(100);
    });
  });
});
```

---

## 🎨 4단계: FeedClientPage 수정

### app/(protected)/feed/page.tsx

```typescript
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import PlayerBar from '@/components/feed/PlayerBar';
import { SongWithMusicData, ProgressSection } from '@/types/music';
import { generateProgressSections, calculateMeasureDuration } from '@/utils/musicCalculations';

export default function FeedClientPage() {
  const [songs, setSongs] = useState<SongWithMusicData[]>([]);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Supabase에서 곡 데이터 가져오기
  useEffect(() => {
    async function fetchSongs() {
      try {
        const { data, error } = await supabase
          .from('songs')
          .select('*')
          .order('created_at', { ascending: true });

        if (error) throw error;

        // 데이터 변환 및 유효성 검사
        const validSongs = data.filter(song => 
          song.bpm && 
          song.time_signature && 
          song.structure_data &&
          song.audio_url
        ) as SongWithMusicData[];

        setSongs(validSongs);
      } catch (error) {
        console.error('Error fetching songs:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSongs();
  }, []);

  // 현재 곡의 progressSections 동적 생성
  const currentSong = songs[currentSongIndex];
  const progressSections: ProgressSection[] = currentSong 
    ? generateProgressSections(
        currentSong.structure_data,
        calculateMeasureDuration(currentSong.bpm, currentSong.time_signature)
      )
    : [];

  // 키보드 이벤트: 화살표 위/아래로 곡 전환
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentSongIndex(prev => 
          prev > 0 ? prev - 1 : songs.length - 1
        );
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentSongIndex(prev => 
          prev < songs.length - 1 ? prev + 1 : 0
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [songs.length]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (songs.length === 0) {
    return <div>No songs available</div>;
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Feed content area */}
      <div className="flex-1 overflow-y-auto">
        {/* 여기에 Feed 콘텐츠 렌더링 */}
        <div className="p-4">
          <h2 className="text-2xl font-bold">{currentSong.title}</h2>
          <p className="text-gray-600">{currentSong.artist}</p>
          <p className="text-sm text-gray-500 mt-2">
            BPM: {currentSong.bpm} | {currentSong.time_signature} | 
            {currentSong.structure_data.totalMeasures} measures
          </p>
        </div>
      </div>

      {/* PlayerBar - 음악 메타데이터 전달 */}
      <PlayerBar
        song={currentSong}
        progressSections={progressSections}
      />
    </div>
  );
}
```

---

## 🎛️ 5단계: PlayerBar 컴포넌트 수정

### components/feed/PlayerBar.tsx

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { SongWithMusicData, ProgressSection } from '@/types/music';
import { 
  calculateMeasureDuration, 
  seekByMeasures,
  getCurrentMeasure 
} from '@/utils/musicCalculations';

interface PlayerBarProps {
  song: SongWithMusicData;
  progressSections: ProgressSection[];
}

export default function PlayerBar({ song, progressSections }: PlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentMeasure, setCurrentMeasure] = useState(1);

  // 음악 메타데이터 계산
  const measureDuration = calculateMeasureDuration(song.bpm, song.time_signature);

  // 오디오 로드
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.src = song.audio_url;
    audio.load();
    
    // 재생 중이었다면 계속 재생
    if (isPlaying) {
      audio.play().catch(console.error);
    }

    // 상태 초기화
    setCurrentTime(0);
    setCurrentMeasure(1);
  }, [song.audio_url]);

  // 오디오 이벤트 리스너
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      
      // 현재 마디 계산
      const measure = getCurrentMeasure(time, measureDuration);
      setCurrentMeasure(measure);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setCurrentMeasure(1);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [measureDuration]);

  // 재생/일시정지
  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
    setIsPlaying(!isPlaying);
  };

  // Measure 기반 seek 함수
  const handleSeekByMeasures = (measureOffset: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = seekByMeasures(
      currentTime,
      measureOffset,
      measureDuration,
      duration
    );

    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Section 클릭으로 이동
  const handleSectionClick = (sectionTime: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = sectionTime;
    setCurrentTime(sectionTime);
  };

  // 키보드 컨트롤: Z/X (measure 단위), ← → (5초 단위)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // input/textarea에서는 동작하지 않음
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        
        // Z키: 1마디 뒤로
        case 'z':
          e.preventDefault();
          handleSeekByMeasures(-1);
          break;
        
        // X키: 1마디 앞으로
        case 'x':
          e.preventDefault();
          handleSeekByMeasures(1);
          break;
        
        // 화살표 좌: 5초 뒤로 (기존 동작 유지)
        case 'arrowleft':
          e.preventDefault();
          if (audioRef.current) {
            audioRef.current.currentTime = Math.max(0, currentTime - 5);
          }
          break;
        
        // 화살표 우: 5초 앞으로 (기존 동작 유지)
        case 'arrowright':
          e.preventDefault();
          if (audioRef.current) {
            audioRef.current.currentTime = Math.min(duration, currentTime + 5);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentTime, duration, measureDuration]);

  // 시간 포맷팅
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 진행률 계산
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      <audio ref={audioRef} />
      
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        {/* Progress Sections */}
        <div className="relative h-1 bg-gray-200">
          {/* Section markers */}
          {progressSections.map((section, index) => {
            const position = (section.value / duration) * 100;
            return (
              <button
                key={index}
                className="absolute top-0 h-full w-0.5 bg-blue-400 hover:bg-blue-600 cursor-pointer group"
                style={{ left: `${position}%` }}
                onClick={() => handleSectionClick(section.value)}
              >
                {/* Tooltip */}
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  {section.label}
                </span>
              </button>
            );
          })}
          
          {/* Current progress */}
          <div
            className="absolute top-0 left-0 h-full bg-blue-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Player controls */}
        <div className="flex items-center justify-between px-4 py-3">
          {/* 곡 정보 */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{song.title}</h3>
            <p className="text-sm text-gray-600 truncate">{song.artist}</p>
            <p className="text-xs text-gray-500">
              Measure {currentMeasure} / {song.structure_data.totalMeasures}
            </p>
          </div>

          {/* 컨트롤 버튼 */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => handleSeekByMeasures(-1)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              title="1 measure backward (Z key)"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              onClick={togglePlayPause}
              className="p-3 bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
              title="Play/Pause (Space key)"
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 text-white" />
              ) : (
                <Play className="w-6 h-6 text-white" />
              )}
            </button>

            <button
              onClick={() => handleSeekByMeasures(1)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              title="1 measure forward (X key)"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* 시간 표시 */}
          <div className="flex-1 text-right">
            <p className="text-sm text-gray-600">
              {formatTime(currentTime)} / {formatTime(duration)}
            </p>
            <p className="text-xs text-gray-500">
              BPM {song.bpm} | {song.time_signature}
            </p>
          </div>
        </div>

        {/* 키보드 단축키 가이드 */}
        <div className="px-4 pb-2 text-xs text-gray-500 border-t border-gray-100">
          <span className="mr-4">Space: Play/Pause</span>
          <span className="mr-4">Z: -1 measure</span>
          <span className="mr-4">X: +1 measure</span>
          <span className="mr-4">← →: ±5 sec</span>
          <span>↑ ↓: Change song</span>
        </div>
      </div>
    </>
  );
}
```

---

## ✅ 6단계: 테스트 시나리오

### 단위 테스트
```bash
npm test utils/musicCalculations.test.ts
```

### 통합 테스트 (수동)

1. **BPM 계산 검증**
   - Autumn Leaves (BPM 140) 재생
   - 2초 경과 시 Measure 2로 표시되는지 확인
   - Blue Bossa (BPM 130) 재생
   - 동일 2초 경과 시 Measure 2로 표시되는지 확인 (약간 다른 위치)

2. **Z/X 키 동작**
   - Z 키: 정확히 1마디 뒤로 이동
   - X 키: 정확히 1마디 앞으로 이동
   - 마디 번호 표시가 정확히 ±1 변경되는지 확인

3. **Section 클릭**
   - Progress bar의 section marker 클릭
   - 해당 section 시작 위치로 정확히 이동하는지 확인
   - Tooltip에 올바른 label 표시되는지 확인

4. **Edge case**
   - 곡 시작(0초)에서 Z 키 → 0초 유지
   - 곡 끝에서 X 키 → duration 초과 안 함
   - 곡 전환 시 measure 카운트 초기화

---

## 📊 성능 고려사항

### 계산 최적화
```typescript
// ❌ 나쁜 예: 매 렌더링마다 재계산
function PlayerBar({ song }) {
  const measureDuration = calculateMeasureDuration(song.bpm, song.time_signature);
  const progressSections = generateProgressSections(song.structure_data, measureDuration);
  // ...
}

// ✅ 좋은 예: 메모이제이션
import { useMemo } from 'react';

function PlayerBar({ song }) {
  const measureDuration = useMemo(
    () => calculateMeasureDuration(song.bpm, song.time_signature),
    [song.bpm, song.time_signature]
  );
  
  const progressSections = useMemo(
    () => generateProgressSections(song.structure_data, measureDuration),
    [song.structure_data, measureDuration]
  );
  // ...
}
```

---

## 🎯 향후 확장 가능성

이 시스템은 다음 기능들의 기반이 됩니다:

### 1. Chord Progression 표시 (W04 Task 5)
```typescript
// structure_data 확장
{
  "sections": [
    {
      "name": "A",
      "startMeasure": 9,
      "endMeasure": 40,
      "chords": [
        { "measure": 9, "chord": "Cm7" },
        { "measure": 10, "chord": "F7" },
        { "measure": 11, "chord": "BbMaj7" },
        // ...
      ]
    }
  ]
}

// 현재 마디의 코드 추출
function getCurrentChord(currentMeasure, structureData) {
  // ...
}
```

### 2. Metronome 동기화
```typescript
// 마디의 박자 위치 계산
function getBeatInMeasure(currentTime, measureDuration, beatsPerMeasure) {
  const positionInMeasure = currentTime % measureDuration;
  const beatDuration = measureDuration / beatsPerMeasure;
  return Math.floor(positionInMeasure / beatDuration) + 1;
}
```

### 3. Loop 구간 설정
```typescript
// A섹션만 반복 재생
function setLoopSection(sectionName, structureData, measureDuration) {
  const section = structureData.sections.find(s => s.name === sectionName);
  const startTime = getMeasureStartTime(section.startMeasure, measureDuration);
  const endTime = getMeasureStartTime(section.endMeasure + 1, measureDuration);
  
  audioRef.current.loop = true;
  // 커스텀 loop 로직 구현
}
```

---

## ⚠️ 주의사항 및 제약

### 1. 오디오 파일 재생성 필수
- 현재 JJazzLab 생성 파일: BPM 메타데이터 없음
- **해결**: 오디오 파일 재생성 시 정확한 BPM으로 렌더링
- 또는: 수동으로 측정한 실제 BPM 값 사용

### 2. BPM 변화 곡 미지원
- 현재: 곡 전체에 단일 BPM 가정
- 제약: Ritardando, Accelerando 등 템포 변화 반영 불가
- 향후: tempo_map 필드 추가로 확장 가능

### 3. Syncopation 한계
- 싱코페이션(당김음) 구간에서 마디 경계가 청각적으로 애매할 수 있음
- 하지만: 시스템상 계산은 정확함

### 4. 데이터 무결성
```typescript
// Supabase 데이터 검증 필수
const validSongs = data.filter(song => 
  song.bpm > 0 &&
  song.time_signature &&
  song.structure_data?.sections?.length > 0 &&
  song.audio_url
);
```

---

## 📝 Notion 기록 예시

**Task Execution Log 작성 시**:

```markdown
## W04-T2: Z/X 키보드 오디오 Seek 구현

### 실행 내용
1. Supabase 스키마 확장 (bpm, time_signature, structure_data)
2. musicCalculations.ts 유틸리티 생성 + 테스트
3. FeedClientPage dynamic progressSections 생성
4. PlayerBar measure 기반 seek 구현

### 기술적 의사결정
- ❌ 고정 2초 seek
- ✅ BPM 기반 measure 계산
- 이유: 음악적 정확성, 향후 확장성

### 학습 내용
1. 음악 앱의 시간 = 절대시간 아닌 음악적 시간
2. 도메인 특성 정확히 반영하는 데이터 구조의 중요성
3. 계산 로직의 유틸리티 분리 → 테스트 용이성

### 실제 소요시간
- 예상: 1.5-2h (복잡도 6/10)
- 실제: 3.5h (복잡도 8-9/10)
- 차이 이유: 데이터베이스 재설계 + 동적 계산 로직 추가
```

---

## 🚀 실행 체크리스트

- [ ] Supabase 스키마 변경 적용
- [ ] 3개 곡 structure_data 입력
- [ ] types/music.ts 생성
- [ ] utils/musicCalculations.ts 생성
- [ ] utils/musicCalculations.test.ts 작성 및 실행
- [ ] FeedClientPage.tsx 수정
- [ ] PlayerBar.tsx 수정
- [ ] 로컬 테스트: BPM 계산 검증
- [ ] 로컬 테스트: Z/X 키 동작
- [ ] 로컬 테스트: Section 클릭 이동
- [ ] GitHub commit & push
- [ ] Vercel 배포 확인
- [ ] 프로덕션 테스트: 3개 곡 모두 확인
- [ ] Notion WTL Task 2 체크박스 ✅
- [ ] Notion TEL 상세 기록 작성

---

**최종 산출물**: BPM 기반 음악적 시간 계산 시스템 - JAMUS 모든 음악 기능의 기반 인프라
