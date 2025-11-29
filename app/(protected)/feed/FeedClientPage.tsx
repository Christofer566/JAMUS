'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import FeedContainer from '@/components/feed/FeedContainer';
import Billboard from '@/components/feed/Billboard';
import PlayerBar from '@/components/feed/PlayerBar';
import { useStageContext } from '@/contexts/StageContext';

import { SongWithMusicData, ProgressSection, StructureData, ChordData } from '@/types/music';
import { generateProgressSections, calculateMeasureDuration, getMeasureStartTime, generateFeedChordProgression } from '@/utils/musicCalculations';
import { useWebAudio } from '@/hooks/useWebAudio';

// 🧪 임시 테스트용 audio_urls (Autumn Leaves)
const TEST_AUDIO_URLS = {
  intro: "https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/autumn-leaves/intro.mp3",
  chorus: "https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/autumn-leaves/chorus.mp3",
  outro: "https://hzgfbmdqmhjiomwrkukw.supabase.co/storage/v1/object/public/jamus-audio/autumn-leaves/outro.mp3"
};

interface FeedClientPageProps {
  initialSongs: any[];
}

// 🎵 JAM 세트 데이터 (4명씩 그룹)
// 각 JAM 세트는 Chorus A/B/C/D를 연주하는 4명의 연주자
// 각 세트별로 확실히 다른 색상 팔레트 사용
const JAM_SETS = [
  // JAM 세트 0: 따뜻한 톤 (빨강/주황/노랑/핑크)
  [
    { name: "RhythmMasterX", instrument: "Guitar", color: "#FF4757" },  // 빨강
    { name: "PianoMaestro", instrument: "Piano", color: "#FF6348" },   // 주황
    { name: "DrummerBoy", instrument: "Drums", color: "#FFA502" },     // 노랑
    { name: "BassQueen", instrument: "Bass", color: "#FF6B81" },       // 핑크
  ],
  // JAM 세트 1: 차가운 톤 (파랑/청록/보라/남색)
  [
    { name: "JazzCat99", instrument: "Saxophone", color: "#3742FA" },   // 파랑
    { name: "MelodyMaker", instrument: "Violin", color: "#2ED573" },    // 청록
    { name: "GrooveMaster", instrument: "Bass", color: "#A55EEA" },     // 보라
    { name: "SaxKing", instrument: "Saxophone", color: "#1E90FF" },     // 남색
  ],
  // JAM 세트 2: 자연 톤 (초록/청록/민트/라임)
  [
    { name: "BebopKing", instrument: "Trumpet", color: "#26DE81" },     // 초록
    { name: "ChordQueen", instrument: "Piano", color: "#00D2D3" },      // 청록
    { name: "SwingDancer", instrument: "Drums", color: "#54A0FF" },     // 하늘
    { name: "BlueNote", instrument: "Guitar", color: "#5F27CD" },       // 진보라
  ],
];

const COLOR_PALETTE = ['#FF7B7B', '#FFD166', '#3DDF85', '#B794F6'];

/**
 * JAM 세트에서 performers 배열 생성
 * JAMUS(Intro) + 4명의 Chorus 연주자 + JAMUS(Outro)
 * 총 6개 섹션
 *
 * @param jamSetIndex - JAM 세트 인덱스
 * @param structureData - 곡의 구조 데이터 (introMeasures, chorusMeasures, outroMeasures)
 * @param measureDuration - 1마디 길이 (초)
 */
const getPerformersForJamSet = (
  jamSetIndex: number,
  structureData?: { introMeasures: number; chorusMeasures: number; outroMeasures: number },
  measureDuration: number = 2 // 기본값 2초 (120 BPM, 4/4박자)
) => {
  const jamSet = JAM_SETS[jamSetIndex] || JAM_SETS[0];

  // 기본값 (structureData 없을 경우)
  const introMeasures = structureData?.introMeasures ?? 8;
  const chorusMeasures = structureData?.chorusMeasures ?? 32;
  const outroMeasures = structureData?.outroMeasures ?? 8;

  // 각 섹션의 시작/종료 시간 (초) 계산
  const introStart = 0;
  const introEnd = introMeasures * measureDuration;

  const chorusAStart = introEnd;
  const chorusAEnd = chorusAStart + chorusMeasures * measureDuration;

  const chorusBStart = chorusAEnd;
  const chorusBEnd = chorusBStart + chorusMeasures * measureDuration;

  const chorusCStart = chorusBEnd;
  const chorusCEnd = chorusCStart + chorusMeasures * measureDuration;

  const chorusDStart = chorusCEnd;
  const chorusDEnd = chorusDStart + chorusMeasures * measureDuration;

  const outroStart = chorusDEnd;
  const outroEnd = outroStart + outroMeasures * measureDuration;

  console.log('🎵 [getPerformersForJamSet] 구조:', {
    introMeasures, chorusMeasures, outroMeasures,
    measureDuration: measureDuration.toFixed(2) + 's',
    sections: {
      intro: `0 - ${introEnd.toFixed(1)}s`,
      A: `${chorusAStart.toFixed(1)} - ${chorusAEnd.toFixed(1)}s`,
      B: `${chorusBStart.toFixed(1)} - ${chorusBEnd.toFixed(1)}s`,
      C: `${chorusCStart.toFixed(1)} - ${chorusCEnd.toFixed(1)}s`,
      D: `${chorusDStart.toFixed(1)} - ${chorusDEnd.toFixed(1)}s`,
      outro: `${outroStart.toFixed(1)} - ${outroEnd.toFixed(1)}s`,
    }
  });

  return [
    // Intro: JAMUS
    { name: 'JAMUS', color: '#7BA7FF', playRange: [introStart, introEnd] as [number, number] },
    // Chorus A
    { name: jamSet[0].name, color: jamSet[0].color, playRange: [chorusAStart, chorusAEnd] as [number, number] },
    // Chorus B
    { name: jamSet[1].name, color: jamSet[1].color, playRange: [chorusBStart, chorusBEnd] as [number, number] },
    // Chorus C
    { name: jamSet[2].name, color: jamSet[2].color, playRange: [chorusCStart, chorusCEnd] as [number, number] },
    // Chorus D
    { name: jamSet[3].name, color: jamSet[3].color, playRange: [chorusDStart, chorusDEnd] as [number, number] },
    // Outro: JAMUS
    { name: 'JAMUS', color: '#7BA7FF', playRange: [outroStart, outroEnd] as [number, number] },
  ];
};

export default function FeedClientPage({ initialSongs }: FeedClientPageProps) {
  const router = useRouter();
  const [currentJamSetIndex, setCurrentJamSetIndex] = useState(0);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true); // Set to true for auto-play
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0); // Add duration state
  const [jamOnlyMode, setJamOnlyMode] = useState(false);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(true); // 곡 변경 시 자동 재생 플래그
  const [pressedKey, setPressedKey] = useState<string | null>(null); // 시각적 피드백용 눌린 키
  const { setCurrentPerformer, setStageColor } = useStageContext();

  const audioRef = useRef<HTMLAudioElement>(null);

  // 🧪 임시 테스트: useWebAudio 훅
  const webAudio = useWebAudio();

  // 🧪 임시 테스트: 상태 로그
  useEffect(() => {
    console.log('🧪 [WebAudio Test] State:', {
      isLoading: webAudio.isLoading,
      isReady: webAudio.isReady,
      duration: webAudio.duration.toFixed(2) + 's',
      currentTime: webAudio.currentTime.toFixed(2) + 's',
    });
  }, [webAudio.isLoading, webAudio.isReady, webAudio.duration, webAudio.currentTime]);

  // 🧪 useWebAudio currentTime → UI currentTime 동기화
  useEffect(() => {
    if (webAudio.isPlaying) {
      setCurrentTime(webAudio.currentTime);
    }
  }, [webAudio.currentTime, webAudio.isPlaying]);

  // 🧪 useWebAudio duration → UI duration 동기화
  useEffect(() => {
    if (webAudio.isReady && webAudio.duration > 0) {
      setDuration(webAudio.duration);
    }
  }, [webAudio.isReady, webAudio.duration]);

  useEffect(() => {
    router.refresh();
  }, [router]);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        router.refresh();
      }
    };

    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [router]);

  const songs = useMemo(() => {
    return initialSongs.map(song => ({
      ...song,
      structure_data: song.structure_data as unknown as StructureData
    })) as SongWithMusicData[];
  }, [initialSongs]);

  // 현재 JAM 세트의 연주자들
  const currentJamSet = JAM_SETS[currentJamSetIndex] || JAM_SETS[0];
  const currentSong = songs[currentSongIndex];

  // 🎵 webAudio ref (useEffect 의존성에서 제외하기 위함)
  const webAudioRef = useRef(webAudio);
  webAudioRef.current = webAudio;

  // 🎵 곡 변경 시 Web Audio 오디오 로드 (currentSong 기반)
  // 첫 마운트 여부 추적
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (!currentSong) return;

    // 현재 곡의 audio_urls 가져오기 (없으면 테스트 URL 사용)
    const audioUrls = currentSong.audio_urls || TEST_AUDIO_URLS;

    console.log('🎵 [WebAudio] 곡 변경 감지, 새 오디오 로드:', currentSong.title);
    console.log('🎵 [WebAudio] Audio URLs:', audioUrls);
    console.log('🎵 [WebAudio] isFirstMount:', isFirstMount.current);

    // 이전 재생 완전 정지 후 새 오디오 로드
    webAudioRef.current.stop();

    // 첫 마운트가 아니면 (곡 변경 시) shouldAutoPlay를 true로 설정
    // 첫 마운트는 초기 state로 이미 true
    if (!isFirstMount.current) {
      setShouldAutoPlay(true);
    }
    isFirstMount.current = false;

    webAudioRef.current.loadAudio(audioUrls);
  }, [currentSong?.id]); // currentSong.id 변경 시만 실행

  // 🎵 Feed 구조 기반 JAM 재생 범위 계산 (early 정의 - AutoPlay에서 사용)
  const { feedIntroEndTime, feedOutroStartTime } = useMemo(() => {
    if (!currentSong?.structure_data) {
      return { feedIntroEndTime: 0, feedOutroStartTime: 0 };
    }
    const measureDuration = calculateMeasureDuration(currentSong.bpm, currentSong.time_signature);
    const introMeasures = currentSong.structure_data.introMeasures || 8;
    const chorusMeasures = currentSong.structure_data.chorusMeasures || 32;

    // Intro 끝 = Chorus A 시작
    const introEnd = introMeasures * measureDuration;
    // Outro 시작 = Chorus D 끝
    const outroStart = (introMeasures + chorusMeasures * 4) * measureDuration;

    return { feedIntroEndTime: introEnd, feedOutroStartTime: outroStart };
  }, [currentSong]);

  // 🎵 오디오 로드 완료 시 자동 재생
  useEffect(() => {
    console.log('🎵 [AutoPlay Check] isReady:', webAudio.isReady, 'shouldAutoPlay:', shouldAutoPlay);

    if (webAudio.isReady && shouldAutoPlay) {
      // jamOnlyMode면 Chorus A부터, 아니면 처음부터
      const startTime = jamOnlyMode ? feedIntroEndTime : 0;
      console.log('🎵 [AutoPlay] 오디오 로드 완료, 자동 재생 시작:', startTime.toFixed(2) + 's', jamOnlyMode ? '(JAM Only)' : '(Full)');

      if (startTime > 0) {
        webAudioRef.current.seek(startTime);
        setCurrentTime(startTime);
      }
      webAudioRef.current.play();
      setIsPlaying(true);
      setShouldAutoPlay(false); // 플래그 리셋
    }
  }, [webAudio.isReady, shouldAutoPlay, jamOnlyMode, feedIntroEndTime]); // webAudio 의존성 제거

  const sectionColors: Record<string, string> = useMemo(() => ({
    'Intro': '#7BA7FF',
    'A': COLOR_PALETTE[0],
    'B': COLOR_PALETTE[1],
    'C': COLOR_PALETTE[2],
    'D': COLOR_PALETTE[3],
    'Outro': '#7BA7FF',
  }), []);

  const progressSections = useMemo(() => {
    if (!currentSong || !currentSong.structure_data?.sections) return [];
    const measureDuration = calculateMeasureDuration(currentSong.bpm, currentSong.time_signature);
    return generateProgressSections(currentSong.structure_data, measureDuration);
  }, [currentSong]);

  const richSections = useMemo(() => {
    if (!currentSong || !currentSong.structure_data?.sections) return [];
    const measureDuration = calculateMeasureDuration(currentSong.bpm, currentSong.time_signature);
    return currentSong.structure_data.sections.map((s, i) => ({
      id: `s${i}`,
      label: s.label,
      color: sectionColors[s.name] || '#7BA7FF',
      startTime: getMeasureStartTime(s.startMeasure, measureDuration),
      duration: (s.endMeasure - s.startMeasure + 1) * measureDuration,
      measures: s.endMeasure - s.startMeasure + 1
    }));
  }, [currentSong, sectionColors]);

  // 기존 richSections 기반 (호환성 유지)
  const introEndTime = richSections.length > 0 ? richSections[0].startTime + richSections[0].duration : 0;
  const outroStartTime = richSections.length > 0 ? richSections[richSections.length - 1].startTime : 0;

  const clampTime = useCallback(
    (time: number) => {
      if (jamOnlyMode) {
        const epsilon = 0.01;
        // Feed 구조 기반 JAM 범위 사용
        const lowerBound = feedIntroEndTime;
        const upperBound = Math.max(lowerBound, feedOutroStartTime - epsilon);
        return Math.min(Math.max(time, lowerBound), upperBound);
      }

      const lowerBound = 0;
      const upperBound = duration; // Use dynamic duration
      return Math.min(Math.max(time, lowerBound), upperBound);
    },
    [duration, feedIntroEndTime, feedOutroStartTime, jamOnlyMode]
  );

  const getRandomStageColor = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * COLOR_PALETTE.length);
    return COLOR_PALETTE[randomIndex];
  }, []);

  // 🎵 JAM 세트 전환 (←→ 키)
  const handleJamSetChange = useCallback(async (direction: 'next' | 'prev') => {
    console.log('🎵 [handleJamSetChange] JAM 세트 변경:', direction);
    console.log('🎵 [handleJamSetChange] 현재 JAM 세트:', currentJamSetIndex, JAM_SETS[currentJamSetIndex]?.map(p => p.name));

    // 다음/이전 JAM 세트로 전환
    if (direction === 'next') {
      setCurrentJamSetIndex((prev) => {
        const newIndex = (prev + 1) % JAM_SETS.length;
        console.log('✅ [handleJamSetChange] 새 JAM 세트:', newIndex, JAM_SETS[newIndex]?.map(p => p.name));
        return newIndex;
      });
    } else {
      setCurrentJamSetIndex((prev) => {
        const newIndex = (prev - 1 + JAM_SETS.length) % JAM_SETS.length;
        console.log('✅ [handleJamSetChange] 새 JAM 세트:', newIndex, JAM_SETS[newIndex]?.map(p => p.name));
        return newIndex;
      });
    }

    // 재생 위치 결정: jamOnlyMode면 Chorus A부터, 아니면 처음부터
    const startTime = jamOnlyMode ? feedIntroEndTime : 0;
    console.log('🎵 [handleJamSetChange] 재생 시작 위치:', startTime.toFixed(2) + 's', jamOnlyMode ? '(JAM Only)' : '(Full)');

    webAudio.stop();
    webAudio.seek(startTime);
    setCurrentTime(startTime);
    setIsPlaying(true);
    await webAudio.play();
    setStageColor(getRandomStageColor());
  }, [currentJamSetIndex, getRandomStageColor, setStageColor, webAudio, jamOnlyMode, feedIntroEndTime]);

  const handleSongChange = useCallback((direction: 'next' | 'prev') => {
    console.log('🎵 [handleSongChange] 곡 변경 시작:', direction);
    console.log('🎵 [handleSongChange] 이전 곡:', currentSongIndex, songs[currentSongIndex]?.title);

    // 1. 현재 재생 완전 정지 및 UI 상태 초기화
    setCurrentTime(0);
    setIsPlaying(false);
    setStageColor(getRandomStageColor());

    // 2. 곡 인덱스 변경 (useEffect에서 새 오디오 자동 로드 + shouldAutoPlay 설정)
    const newSongIndex = direction === 'next'
      ? (currentSongIndex + 1) % songs.length
      : (currentSongIndex - 1 + songs.length) % songs.length;

    // 3. JAM 세트(연주자)도 함께 변경
    const newJamSetIndex = direction === 'next'
      ? (currentJamSetIndex + 1) % JAM_SETS.length
      : (currentJamSetIndex - 1 + JAM_SETS.length) % JAM_SETS.length;

    console.log('🎵 [handleSongChange] 새 곡:', newSongIndex, songs[newSongIndex]?.title);
    console.log('🎵 [handleSongChange] 새 JAM 세트:', newJamSetIndex, JAM_SETS[newJamSetIndex]?.map(p => p.name));

    // 4. 곡 인덱스 + JAM 세트 업데이트 → useEffect가 새 오디오 로드 + shouldAutoPlay=true 설정
    setCurrentSongIndex(newSongIndex);
    setCurrentJamSetIndex(newJamSetIndex);
  }, [currentSongIndex, currentJamSetIndex, getRandomStageColor, setStageColor, songs]);

  // 🧪 useWebAudio 연결: togglePlayPause
  const togglePlayPause = useCallback(() => {
    console.log('🧪 [togglePlayPause] Current state:', {
      isPlaying,
      webAudioIsPlaying: webAudio.isPlaying,
      webAudioIsReady: webAudio.isReady
    });

    if (webAudio.isPlaying) {
      console.log('🧪 [togglePlayPause] Calling webAudio.pause()');
      webAudio.pause();
      setIsPlaying(false);
    } else {
      console.log('🧪 [togglePlayPause] Calling webAudio.play()');
      webAudio.play();
      setIsPlaying(true);
    }
  }, [webAudio, isPlaying]);

  const skipForward = useCallback(() => {
    setCurrentTime((prev) => clampTime(prev + 5));
  }, [clampTime]);

  const skipBackward = useCallback(() => {
    setCurrentTime((prev) => clampTime(prev - 5));
  }, [clampTime]);

  // 🎵 마디 단위 seek (BPM 기반)
  const seekByMeasure = useCallback((offset: number) => {
    if (!currentSong?.bpm) {
      console.warn('⚠️ [seekByMeasure] No BPM data');
      return;
    }

    // 1마디 시간 계산: 60 / bpm * 4 (4/4 박자 가정)
    const measureDuration = calculateMeasureDuration(currentSong.bpm, currentSong.time_signature);
    const newTime = webAudio.currentTime + (offset * measureDuration);
    const clampedTime = Math.max(0, Math.min(newTime, webAudio.duration));

    console.log('🎵 [seekByMeasure]', {
      offset,
      bpm: currentSong.bpm,
      measureDuration: measureDuration.toFixed(2) + 's',
      currentTime: webAudio.currentTime.toFixed(2) + 's',
      newTime: clampedTime.toFixed(2) + 's',
    });

    webAudio.seek(clampedTime);
  }, [currentSong, webAudio]);

  // 🎵 섹션 시작으로 seek (JAM 전환 시 사용)
  const seekToSectionStart = useCallback((sectionIndex: number) => {
    if (!currentSong?.structure_data) {
      console.warn('⚠️ [seekToSectionStart] No structure data');
      return;
    }

    const measureDuration = calculateMeasureDuration(currentSong.bpm, currentSong.time_signature);
    const introMeasures = currentSong.structure_data.introMeasures || 8;
    const chorusMeasures = currentSong.structure_data.chorusMeasures || 32;

    // Feed 섹션별 시작 마디 계산
    let targetMeasure = 0;
    switch (sectionIndex) {
      case 0: targetMeasure = 0; break; // Intro
      case 1: targetMeasure = introMeasures; break; // Chorus A
      case 2: targetMeasure = introMeasures + chorusMeasures; break; // Chorus B
      case 3: targetMeasure = introMeasures + chorusMeasures * 2; break; // Chorus C
      case 4: targetMeasure = introMeasures + chorusMeasures * 3; break; // Chorus D
      case 5: targetMeasure = introMeasures + chorusMeasures * 4; break; // Outro
      default: targetMeasure = 0;
    }

    const targetTime = targetMeasure * measureDuration;

    console.log('🎵 [seekToSectionStart]', {
      sectionIndex,
      targetMeasure,
      targetTime: targetTime.toFixed(2) + 's',
    });

    webAudio.seek(targetTime);
  }, [currentSong, webAudio]);

  // 🎵 현재 섹션 인덱스 계산 (키보드 핸들러에서 사용)
  const getCurrentFeedSectionIndex = useCallback(() => {
    if (!currentSong?.structure_data) return 0;

    const measureDuration = calculateMeasureDuration(currentSong.bpm, currentSong.time_signature);
    const introMeasures = currentSong.structure_data.introMeasures || 8;
    const chorusMeasures = currentSong.structure_data.chorusMeasures || 32;
    const outroMeasures = currentSong.structure_data.outroMeasures || 8;

    const globalMeasure = Math.floor(webAudio.currentTime / measureDuration);

    // 섹션 범위 확인
    if (globalMeasure < introMeasures) return 0; // Intro
    if (globalMeasure < introMeasures + chorusMeasures) return 1; // A
    if (globalMeasure < introMeasures + chorusMeasures * 2) return 2; // B
    if (globalMeasure < introMeasures + chorusMeasures * 3) return 3; // C
    if (globalMeasure < introMeasures + chorusMeasures * 4) return 4; // D
    return 5; // Outro
  }, [currentSong, webAudio.currentTime]);

  // 🎹 키보드 핸들러를 ref로 저장 (의존성 변경 시 리스너 재등록 방지)
  const keyHandlersRef = useRef({
    handleSongChange,
    handleJamSetChange,
    togglePlayPause,
    seekByMeasure,
    jamOnlyMode,
    setJamOnlyMode,
    feedIntroEndTime,
    webAudio,
  });

  // ref 업데이트 (리렌더링 시 최신 함수 참조)
  useEffect(() => {
    keyHandlersRef.current = {
      handleSongChange,
      handleJamSetChange,
      togglePlayPause,
      seekByMeasure,
      jamOnlyMode,
      setJamOnlyMode,
      feedIntroEndTime,
      webAudio,
    };
  }, [handleSongChange, handleJamSetChange, togglePlayPause, seekByMeasure, jamOnlyMode, feedIntroEndTime, webAudio]);

  // 키보드 제어: ←→ (JAM 세트 전환), ↑↓ (곡 전환), ZX (마디 이동), Space (재생/정지)
  useEffect(() => {
    let isProcessing = false; // 연속 입력 방지 플래그

    const handleKeyPress = (e: KeyboardEvent) => {
      // 입력 필드에서는 무시
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // 연속 입력 방지 (50ms 디바운스)
      if (isProcessing) {
        console.log('⌨️ [KeyPress] 무시 (처리 중):', e.code);
        e.preventDefault();
        return;
      }

      const handlers = keyHandlersRef.current;
      console.log('⌨️ [KeyPress]', e.code);

      // 시각적 피드백: 키 누름 상태 설정 후 150ms 뒤 해제
      const setKeyFeedback = (key: string) => {
        setPressedKey(key);
        setTimeout(() => setPressedKey(null), 150);
      };

      switch (e.code) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          isProcessing = true;
          setKeyFeedback('down');
          console.log('⬇️ 다음 곡으로 전환');
          handlers.handleSongChange('next');
          setTimeout(() => { isProcessing = false; }, 100);
          break;

        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          isProcessing = true;
          setKeyFeedback('up');
          console.log('⬆️ 이전 곡으로 전환');
          handlers.handleSongChange('prev');
          setTimeout(() => { isProcessing = false; }, 100);
          break;

        case 'ArrowLeft':
          e.preventDefault();
          e.stopPropagation();
          isProcessing = true;
          setKeyFeedback('left');
          console.log('⬅️ 이전 JAM 세트로 전환');
          handlers.handleJamSetChange('prev');
          setTimeout(() => { isProcessing = false; }, 100);
          break;

        case 'ArrowRight':
          e.preventDefault();
          e.stopPropagation();
          isProcessing = true;
          setKeyFeedback('right');
          console.log('➡️ 다음 JAM 세트로 전환');
          handlers.handleJamSetChange('next');
          setTimeout(() => { isProcessing = false; }, 100);
          break;

        case 'KeyZ':
          e.preventDefault();
          e.stopPropagation();
          setKeyFeedback('z');
          console.log('🎹 Z키: 1마디 뒤로');
          handlers.seekByMeasure(-1);
          break;

        case 'KeyX':
          e.preventDefault();
          e.stopPropagation();
          setKeyFeedback('x');
          console.log('🎹 X키: 1마디 앞으로');
          handlers.seekByMeasure(1);
          break;

        case 'KeyS':
          e.preventDefault();
          e.stopPropagation();
          setKeyFeedback('s');
          {
            const nextJamOnly = !handlers.jamOnlyMode;
            handlers.setJamOnlyMode(nextJamOnly);
            console.log('🎛️ JAM-only 모드 토글:', nextJamOnly ? 'ON' : 'OFF');

            // JAM-only 활성화 시 Intro에 있으면 Chorus A로 이동
            if (nextJamOnly && handlers.webAudio.currentTime < handlers.feedIntroEndTime) {
              console.log('🎵 [JAM Only] Intro에서 Chorus A로 이동');
              handlers.webAudio.seek(handlers.feedIntroEndTime);
            }
          }
          break;

        case 'Space':
          e.preventDefault();
          e.stopPropagation();
          isProcessing = true;
          setKeyFeedback('space');
          console.log('⏯️ Space: 재생/일시정지 토글');
          handlers.togglePlayPause();
          setTimeout(() => { isProcessing = false; }, 100);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress, true);
    return () => window.removeEventListener('keydown', handleKeyPress, true);
  }, []); // 빈 의존성 - 리스너 한 번만 등록

  useEffect(() => {
    if (jamOnlyMode) {
      setCurrentTime((prev) => clampTime(prev));
    }
  }, [clampTime, jamOnlyMode]);

  // 🎵 JAM만 듣기 모드: 재생 범위 감시 및 자동 seek
  useEffect(() => {
    if (!jamOnlyMode || !webAudio.isPlaying) return;

    const currentPos = webAudio.currentTime;

    // Intro 구간에 있으면 Chorus A 시작으로 이동
    if (currentPos < feedIntroEndTime) {
      console.log('🎵 [JAM Only] Intro 감지 → Chorus A로 이동');
      webAudio.seek(feedIntroEndTime);
      return;
    }

    // Outro 진입 시 Chorus A로 돌아가기 (루프)
    if (currentPos >= feedOutroStartTime) {
      console.log('🎵 [JAM Only] Outro 감지 → Chorus A로 루프');
      webAudio.seek(feedIntroEndTime);
      return;
    }
  }, [jamOnlyMode, webAudio.isPlaying, webAudio.currentTime, feedIntroEndTime, feedOutroStartTime, webAudio]);

  // 🧪 주석처리: 기존 audio 태그 로드 (useWebAudio로 대체)
  // useEffect(() => {
  //   if (audioRef.current) {
  //     audioRef.current.load();
  //     if (isPlaying) {
  //       audioRef.current.play().catch(() => {
  //         setIsPlaying(false);
  //         console.log('⚠️ Auto-play blocked - user must click Play');
  //       });
  //     }
  //   }
  // }, [currentSongIndex]);

  // 기존 Single용 섹션/마디 계산 (richSections 기반)
  const getCurrentSectionAndMeasure = () => {
    for (let i = 0; i < richSections.length; i++) {
      const section = richSections[i];
      const sectionEndTime = section.startTime + section.duration;

      if (currentTime >= section.startTime && currentTime < sectionEndTime) {
        const timeInSection = currentTime - section.startTime;
        const secondsPerMeasure = section.duration / section.measures;
        const currentMeasure = Math.floor(timeInSection / secondsPerMeasure);

        const timeInMeasure = timeInSection % secondsPerMeasure;
        const measureProgress = timeInMeasure / secondsPerMeasure;
        const sectionProgress = timeInSection / section.duration;

        return {
          sectionIndex: i,
          measure: Math.min(currentMeasure, section.measures - 1),
          measureProgress,
          sectionProgress,
        };
      }
    }

    return {
      sectionIndex: richSections.length - 1,
      measure: richSections.length > 0 ? richSections[richSections.length - 1].measures - 1 : 0,
      measureProgress: 0,
      sectionProgress: 1,
    };
  };

  // 🎵 Feed용 섹션/마디 계산 (intro + chorus×4 + outro 구조)
  const getFeedSectionAndMeasure = () => {
    if (!currentSong?.structure_data) {
      return { feedSectionIndex: 0, feedMeasure: 0, feedMeasureProgress: 0, feedSectionProgress: 0 };
    }

    const measureDuration = calculateMeasureDuration(currentSong.bpm, currentSong.time_signature);
    const introMeasures = currentSong.structure_data.introMeasures || 8;
    const chorusMeasures = currentSong.structure_data.chorusMeasures || 32;
    const outroMeasures = currentSong.structure_data.outroMeasures || 8;

    // Feed 섹션 구조: [intro, chorusA, chorusB, chorusC, chorusD, outro]
    const feedSections = [
      { label: 'Intro', startMeasure: 0, measures: introMeasures },
      { label: 'A', startMeasure: introMeasures, measures: chorusMeasures },
      { label: 'B', startMeasure: introMeasures + chorusMeasures, measures: chorusMeasures },
      { label: 'C', startMeasure: introMeasures + chorusMeasures * 2, measures: chorusMeasures },
      { label: 'D', startMeasure: introMeasures + chorusMeasures * 3, measures: chorusMeasures },
      { label: 'Outro', startMeasure: introMeasures + chorusMeasures * 4, measures: outroMeasures },
    ];

    // 현재 시간에서 전체 마디 번호 계산
    const globalMeasure = Math.floor(currentTime / measureDuration);
    const timeInMeasure = currentTime % measureDuration;
    const measureProgress = timeInMeasure / measureDuration;

    // 어떤 Feed 섹션에 속하는지 찾기
    for (let i = 0; i < feedSections.length; i++) {
      const section = feedSections[i];
      const sectionEndMeasure = section.startMeasure + section.measures;

      if (globalMeasure >= section.startMeasure && globalMeasure < sectionEndMeasure) {
        const measureInSection = globalMeasure - section.startMeasure;
        const sectionProgress = measureInSection / section.measures;

        console.log('🎵 [getFeedSectionAndMeasure]', {
          globalMeasure,
          feedSectionIndex: i,
          feedSectionLabel: section.label,
          measureInSection,
          measureProgress: measureProgress.toFixed(2),
        });

        return {
          feedSectionIndex: i,
          feedMeasure: measureInSection,
          feedMeasureProgress: measureProgress,
          feedSectionProgress: sectionProgress,
        };
      }
    }

    // 끝에 도달한 경우
    return {
      feedSectionIndex: feedSections.length - 1,
      feedMeasure: feedSections[feedSections.length - 1].measures - 1,
      feedMeasureProgress: 0,
      feedSectionProgress: 1,
    };
  };

  const { sectionIndex, measure, measureProgress, sectionProgress } = getCurrentSectionAndMeasure();
  const { feedSectionIndex, feedMeasure, feedMeasureProgress, feedSectionProgress } = getFeedSectionAndMeasure();

  const currentStageColor =
    sectionIndex >= 0 && sectionIndex < richSections.length
      ? richSections[sectionIndex].color
      : '#7BA7FF';

  // 🧪 주석처리: 기존 audio 태그 재생 로직 (useWebAudio로 대체)
  // useEffect(() => {
  //   if (audioRef.current) {
  //     if (isPlaying) {
  //       audioRef.current.play().catch(() => {
  //         // Auto-play blocked by browser
  //         setIsPlaying(false);
  //         console.log('⚠️ Auto-play blocked - user must click Play');
  //       });
  //     } else {
  //       audioRef.current.pause();
  //     }
  //   }
  // }, [isPlaying]);

  // This useEffect will handle duration and ended state
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      // Optionally, start playing immediately if auto-play is desired on load
      // if (isPlaying) {
      //   audio.play();
      // }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      // Optionally, auto-play next jam/song here
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []); // Empty dependency array means this runs once on mount

  // 🧪 주석처리: 기존 currentTime 업데이트 (useWebAudio로 대체)
  // useEffect(() => {
  //   let animationFrameId: number;
  //
  //   const animate = () => {
  //     if (audioRef.current) {
  //       setCurrentTime(audioRef.current.currentTime);
  //     }
  //     animationFrameId = requestAnimationFrame(animate);
  //   };
  //
  //   if (isPlaying) {
  //     animationFrameId = requestAnimationFrame(animate);
  //   }
  //
  //   return () => {
  //     cancelAnimationFrame(animationFrameId);
  //   };
  // }, [isPlaying]);

  // 🎵 동적 코드 진행 생성 (chord_data 기반)
  const chordProgression = useMemo(() => {
    if (!currentSong) return [];

    console.log('🎵 [FeedClientPage] Generating chord progression for:', currentSong.title);
    console.log('🎵 [FeedClientPage] chord_data:', currentSong.chord_data);
    console.log('🎵 [FeedClientPage] structure_data:', currentSong.structure_data);

    const progression = generateFeedChordProgression(
      currentSong.chord_data as ChordData | undefined,
      currentSong.structure_data
    );

    console.log('🎵 [FeedClientPage] Generated progression:', progression.length, 'lines');
    return progression;
  }, [currentSong]);

  // 마디 길이 계산 (1마디 = 초)
  const measureDurationForPerformers = useMemo(() => {
    if (!currentSong) return 2; // 기본값 2초
    return calculateMeasureDuration(currentSong.bpm, currentSong.time_signature);
  }, [currentSong]);

  // 현재 JAM 세트 기반으로 performers 생성 (곡 구조 반영)
  const performers = useMemo(() => {
    const structureData = currentSong?.structure_data ? {
      introMeasures: currentSong.structure_data.introMeasures || 8,
      chorusMeasures: currentSong.structure_data.chorusMeasures || 32,
      outroMeasures: currentSong.structure_data.outroMeasures || 8,
    } : undefined;

    const result = getPerformersForJamSet(currentJamSetIndex, structureData, measureDurationForPerformers);
    console.log('🎨 [JAM 세트 전환] currentJamSetIndex:', currentJamSetIndex);
    console.log('🎨 [JAM 세트 전환] performers:', result.map(p => ({
      name: p.name,
      color: p.color,
      playRange: `${p.playRange[0].toFixed(1)}s - ${p.playRange[1].toFixed(1)}s`
    })));
    return result;
  }, [currentJamSetIndex, currentSong, measureDurationForPerformers]);

  const getCurrentPerformer = useCallback(() => {
    const currentSection = richSections[sectionIndex];
    if (!currentSection) {
      return 'JAMUS';
    }

    for (const performer of performers) {
      const [startTime, endTime] = performer.playRange;
      if (currentTime >= startTime && currentTime < endTime) {
        return performer.name;
      }
    }

    return 'JAMUS';
  }, [currentTime, performers, richSections, sectionIndex]);

  const getCurrentPerformerColor = useCallback(() => {
    for (const performer of performers) {
      const [startTime, endTime] = performer.playRange;
      if (currentTime >= startTime && currentTime < endTime) {
        return performer.color;
      }
    }

    return '#7BA7FF';
  }, [currentTime, performers]);

  const currentPerformerName = getCurrentPerformer();

  const handleTimeChange = (newTime: number) => {
    const clampedTime = clampTime(newTime);
    webAudio.seek(clampedTime);
    setCurrentTime(clampedTime);
  };

  useEffect(() => {
    setCurrentPerformer(currentPerformerName);
  }, [currentPerformerName, setCurrentPerformer]);

  useEffect(() => {
    setStageColor(getCurrentPerformerColor());
  }, [getCurrentPerformerColor, setStageColor]);

  return (
    <FeedContainer>
      <audio
        ref={audioRef}
        src={currentSong?.audio_url}
        preload="auto"
      />
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-1 min-h-0 flex-col">
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <Billboard
              key={`jamSet-${currentJamSetIndex}-song-${currentSongIndex}`}
              className="h-full"
              userName={currentJamSet[0]?.name || 'Unknown'}
              userProfile={undefined}
              instrument={currentJamSet[0]?.instrument}
              songTitle={currentSong.title}
              artistName={currentSong.artist}
              chordProgression={chordProgression}
              performers={performers}
              structureData={currentSong.structure_data ? {
                introMeasures: currentSong.structure_data.introMeasures,
                chorusMeasures: currentSong.structure_data.chorusMeasures || 32,
                outroMeasures: currentSong.structure_data.outroMeasures,
                feedTotalMeasures: currentSong.structure_data.feedTotalMeasures || currentSong.structure_data.totalMeasures,
              } : undefined}
              currentSectionIndex={feedSectionIndex}
              currentMeasure={feedMeasure}
              measureProgress={feedMeasureProgress}
              sectionProgress={feedSectionProgress}
            />
          </div>
        </div>

        <div className="mt-6 flex-shrink-0">
          <PlayerBar
            className="flex-shrink-0"
            songTitle={currentSong.title}
            artistName={currentSong.artist}
            isPlaying={isPlaying}
            onPlayPause={togglePlayPause}
            song={currentSong}
            progressSections={progressSections}
            currentTime={currentTime}
            duration={duration}
            onTimeChange={handleTimeChange}
            onNextJam={() => handleJamSetChange('next')}
            onPrevJam={() => handleJamSetChange('prev')}
            jamOnlyMode={jamOnlyMode}
            onToggleJamOnly={setJamOnlyMode}
            performers={performers}
            pressedKey={pressedKey}
            feedIntroEndTime={feedIntroEndTime}
            feedOutroStartTime={feedOutroStartTime}
          />
        </div>
      </div>
    </FeedContainer>
  );
}
