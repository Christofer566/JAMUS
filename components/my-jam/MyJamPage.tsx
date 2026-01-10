'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import MyJamProfile from './MyJamProfile';
import PurchasedSources from './PurchasedSources';
import MyJamList from './MyJamList';
import MiniPlayerBar from './MiniPlayerBar';
import { AIReportPanel } from './report';
import { useMyJamData } from '@/hooks/useMyJamData';
import { usePlayerStore } from '@/stores/playerStore';
import { useReportPanelStore } from '@/stores/reportPanelStore';
import { useToast } from '@/contexts/ToastContext';
import { SortType, FilterType } from '@/types/my-jam';
import { Loader2 } from 'lucide-react';

const MyJamPage: React.FC = () => {
  const router = useRouter();
  const { showToast } = useToast();
  const { profile, purchasedSources, myJams, isLoading, error, deleteJam } = useMyJamData();

  const [activeSort, setActiveSort] = useState<SortType>('latest');
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');

  // Player Store
  const { playJam, currentJam, togglePlay } = usePlayerStore();

  // Report Panel Store
  const { isOpen: isReportOpen, openPanel, closePanel } = useReportPanelStore();

  // 구매소스 클릭 → Single 모드 이동
  const handleSourceClick = useCallback((sourceId: string) => {
    router.push(`/single?songId=${sourceId}`);
  }, [router]);

  // JAM 재생
  const handleJamPlay = useCallback((jamId: string) => {
    const jam = myJams.find(j => j.id === jamId);
    if (!jam) return;

    if (!jam.audioUrl) {
      showToast('error', '오디오 파일을 찾을 수 없습니다');
      return;
    }

    // 같은 JAM이면 토글, 다른 JAM이면 새로 재생
    if (currentJam?.id === jam.id) {
      togglePlay();
    } else {
      playJam({
        id: jam.id,
        name: jam.name || null,
        audioUrl: jam.audioUrl,
        songTitle: jam.title,
        songArtist: jam.artist,
        coverUrl: jam.coverUrl || null,
        backingTrackUrl: jam.backingTrackUrl,
      });
    }
  }, [myJams, currentJam, playJam, togglePlay, showToast]);

  // 리포트 보기/생성 - 패널 열기 + 데이터 로드
  const handleViewReport = useCallback((jamId: string) => {
    const jam = myJams.find(j => j.id === jamId);
    if (!jam) return;

    // songId 추출 (jams 테이블에서 song_id 참조)
    const songId = jam.songId || 'autumn-leaves'; // fallback
    openPanel(jamId, songId);
  }, [myJams, openPanel]);

  // 리포트 생성 (MVP: 동일 동작)
  const handleCreateReport = useCallback((jamId: string) => {
    handleViewReport(jamId);
  }, [handleViewReport]);

  // 다시 연습하기 - Single 모드로 이동
  const handlePracticeAgain = useCallback((songId: string) => {
    closePanel();
    router.push(`/single?songId=${songId}`);
  }, [closePanel, router]);

  // View All 핸들러
  const handleViewAllSources = useCallback(() => {
    console.log('[MyJam] View All Sources');
    showToast('info', '전체 보기 기능은 준비 중입니다');
  }, [showToast]);

  const handleViewAllJams = useCallback(() => {
    console.log('[MyJam] View All JAMs');
    showToast('info', '전체 보기 기능은 준비 중입니다');
  }, [showToast]);

  // JAM 삭제
  const handleDeleteJam = useCallback(async (jamId: string) => {
    const success = await deleteJam(jamId);
    if (success) {
      showToast('success', 'JAM이 삭제되었습니다');
    } else {
      showToast('error', 'JAM 삭제에 실패했습니다');
    }
  }, [deleteJam, showToast]);

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p>데이터를 불러오는 중...</p>
      </div>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
        <p className="text-red-400 mb-2">오류가 발생했습니다</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  // 프로필 없음
  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
        <p>프로필 정보를 찾을 수 없습니다</p>
      </div>
    );
  }

  // 정렬된 구매소스
  const sortedSources = [...purchasedSources].sort((a, b) => {
    switch (activeSort) {
      case 'title':
        return a.title.localeCompare(b.title);
      case 'artist':
        return a.artist.localeCompare(b.artist);
      case 'latest':
      default:
        return 0;
    }
  });

  // 필터된 JAM 목록
  const filteredJams = myJams.filter(jam => {
    if (activeFilter === 'All') return true;
    return jam.type === activeFilter;
  });

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* Main Content - 50:50 레이아웃 */}
      <main className={`flex-1 overflow-y-auto px-8 py-8 transition-all duration-700 ease-in-out scroll-smooth ${
        isReportOpen
          ? 'w-1/2 scale-[0.97] opacity-70'
          : 'w-full'
      }`}>
        <div className="max-w-6xl mx-auto space-y-16 pb-20">
          {/* Section 1: Profile */}
          <section>
            <MyJamProfile {...profile} />
          </section>

          {/* Section 2: Purchased Sources */}
          <section>
            <PurchasedSources
              sources={sortedSources}
              activeSort={activeSort}
              onSortChange={setActiveSort}
              onViewAll={handleViewAllSources}
              onSourceClick={handleSourceClick}
            />
          </section>

          {/* Section 3: My JAM List */}
          <section>
            <MyJamList
              jams={filteredJams}
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              onViewAll={handleViewAllJams}
              onPlay={handleJamPlay}
              onViewReport={handleViewReport}
              onCreateReport={handleCreateReport}
              onDelete={handleDeleteJam}
            />
          </section>

          {/* Mini Player - My JAM 페이지 전용 */}
          <MiniPlayerBar />
        </div>
      </main>

      {/* AI Report Side Panel */}
      <AIReportPanel onPracticeAgain={handlePracticeAgain} />
    </div>
  );
};

export default MyJamPage;
