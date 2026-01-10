'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import {
  MyJamProfileProps,
  PurchasedSource,
  JamItem,
  TierType,
  JamType,
} from '@/types/my-jam';

interface UseMyJamDataReturn {
  profile: MyJamProfileProps | null;
  purchasedSources: PurchasedSource[];
  myJams: JamItem[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  deleteJam: (jamId: string) => Promise<boolean>;
}

export function useMyJamData(): UseMyJamDataReturn {
  const [profile, setProfile] = useState<MyJamProfileProps | null>(null);
  const [purchasedSources, setPurchasedSources] = useState<PurchasedSource[]>([]);
  const [myJams, setMyJams] = useState<JamItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    console.log('[MyJam] 데이터 로드 시작...');

    try {
      const supabase = createClient();

      // 1. 현재 사용자 확인
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      console.log('[MyJam] 사용자 확인:', { user: user?.email, error: userError?.message });

      if (userError || !user) {
        setError('로그인이 필요합니다');
        setIsLoading(false);
        return;
      }

      // 2. 프로필 조회
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      console.log('[MyJam] 프로필 조회:', { data: profileData, error: profileError?.message });

      // 3. 구매소스 조회 (MVP: songs 테이블의 모든 곡을 '구매한 소스'로 표시)
      // M-05: audio_urls도 가져오기 (믹싱 재생용)
      const { data: songsData, error: songsError } = await supabase
        .from('songs')
        .select('id, title, artist, image_url, audio_urls')
        .order('id', { ascending: true });

      console.log('[MyJam] 곡 목록 조회:', { count: songsData?.length, error: songsError?.message, data: songsData });

      // 4. 사용자의 JAM 목록 조회 (songs와 JOIN 없이 단독 조회)
      const { data: jamsData, error: jamsError } = await supabase
        .from('jams')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      console.log('[MyJam] JAM 목록 조회:', { count: jamsData?.length, error: jamsError?.message, data: jamsData });

      // 5. feedback_sessions 조회 (V-13: hasReport 판단용)
      const jamIds = (jamsData || []).map((j: any) => j.id);
      let feedbackJamIds: Set<string> = new Set();

      if (jamIds.length > 0) {
        const { data: feedbackData } = await supabase
          .from('feedback_sessions')
          .select('jam_id')
          .in('jam_id', jamIds);

        feedbackJamIds = new Set((feedbackData || []).map((f: any) => f.jam_id));
        console.log('[MyJam] feedback_sessions 조회:', { count: feedbackJamIds.size });
      }

      // 6. 프로필 데이터 매핑
      const mappedProfile: MyJamProfileProps = {
        nickname: profileData?.nickname || user.email?.split('@')[0] || 'User',
        oderId: `JAM_${user.id.substring(0, 8).toUpperCase()}`,
        tier: mapTier(profileData?.stage),
        hasPremium: profileData?.has_pro_badge || false,
        hasEarlyBird: profileData?.has_early_bird_badge || false,
        topJam: null, // MVP: Top JAM은 좋아요 기능 미구현으로 null
      };

      // 7. JAM 목록 매핑 (songsData에서 곡 정보 찾기)
      const songsMap = new Map((songsData || []).map((s: any) => [s.id, s]));

      // M-05: start_measure 기반으로 backing track URL 결정
      const getBackingTrackUrl = (song: any, startMeasure: number): string | undefined => {
        if (!song?.audio_urls) return undefined;
        const audioUrls = song.audio_urls;
        // 녹음 시작 마디로 섹션 판단 (Autumn Leaves 48마디 기준)
        if (startMeasure <= 8) return audioUrls.intro;
        if (startMeasure <= 40) return audioUrls.chorus;
        return audioUrls.outro;
      };

      const mappedJams: JamItem[] = (jamsData || []).map((jam: any) => {
        const song = songsMap.get(jam.song_id);
        return {
          id: jam.id,
          songId: jam.song_id, // AI Report용
          name: jam.name || undefined,
          title: song?.title || `JAM ${jam.song_id}`,
          artist: song?.artist || mappedProfile.nickname,
          coverUrl: song?.image_url || 'https://picsum.photos/200/200?random=1',
          recordedAt: new Date(jam.created_at).toISOString().split('T')[0],
          type: 'Single' as JamType, // MVP: Single만 지원
          hasReport: feedbackJamIds.has(jam.id), // V-13: feedback_sessions 존재 여부
          audioUrl: jam.audio_url,
          backingTrackUrl: getBackingTrackUrl(song, jam.start_measure || 9), // M-05
          startMeasure: jam.start_measure, // M-05
        };
      });

      // 8. 구매소스 매핑 (MVP: songs 테이블의 모든 곡을 '구매한 소스'로 표시)
      const mappedPurchasedSources: PurchasedSource[] = (songsData || []).map((song: any) => ({
        id: song.id,
        title: song.title,
        artist: song.artist,
        seller: 'JAMUS', // MVP: 모든 곡의 seller를 JAMUS로 표시
        coverUrl: song.image_url || 'https://picsum.photos/200/200?random=1',
      }));

      setProfile(mappedProfile);
      setMyJams(mappedJams);
      setPurchasedSources(mappedPurchasedSources);

      console.log('[MyJam] 데이터 로드 완료:', {
        profile: mappedProfile.nickname,
        jamsCount: mappedJams.length,
        sourcesCount: mappedPurchasedSources.length,
      });

    } catch (err: any) {
      console.error('[MyJam] 데이터 로드 오류:', err);
      setError(err.message || '데이터를 불러오는 중 오류가 발생했습니다');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * JAM 삭제
   * - jams 테이블에서 삭제
   * - 연관된 feedback_sessions도 함께 삭제됨 (CASCADE 또는 수동)
   */
  const deleteJam = useCallback(async (jamId: string): Promise<boolean> => {
    console.log('[MyJam] JAM 삭제 시작:', jamId);

    try {
      const supabase = createClient();

      // 1. feedback_sessions 삭제 (있는 경우)
      const { error: feedbackError } = await supabase
        .from('feedback_sessions')
        .delete()
        .eq('jam_id', jamId);

      if (feedbackError) {
        console.warn('[MyJam] feedback_sessions 삭제 실패 (무시):', feedbackError.message);
      }

      // 2. jams 테이블에서 삭제
      const { error: jamError } = await supabase
        .from('jams')
        .delete()
        .eq('id', jamId);

      if (jamError) {
        console.error('[MyJam] JAM 삭제 실패:', jamError);
        setError('JAM 삭제에 실패했습니다');
        return false;
      }

      // 3. 로컬 상태 업데이트 (낙관적 업데이트)
      setMyJams((prev) => prev.filter((jam) => jam.id !== jamId));

      console.log('[MyJam] JAM 삭제 완료:', jamId);
      return true;
    } catch (err: any) {
      console.error('[MyJam] JAM 삭제 오류:', err);
      setError(err.message || 'JAM 삭제 중 오류가 발생했습니다');
      return false;
    }
  }, []);

  return {
    profile,
    purchasedSources,
    myJams,
    isLoading,
    error,
    refetch: fetchData,
    deleteJam,
  };
}

/**
 * Supabase stage를 TierType으로 매핑
 */
function mapTier(stage: string | null | undefined): TierType {
  switch (stage?.toLowerCase()) {
    case 'mid':
    case 'intermediate':
      return 'Mid';
    case 'free':
      return 'Free';
    case 'beginner':
    default:
      return 'Beginner';
  }
}

export default useMyJamData;
