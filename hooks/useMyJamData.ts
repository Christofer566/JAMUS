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
      const { data: songsData, error: songsError } = await supabase
        .from('songs')
        .select('id, title, artist, image_url')
        .order('id', { ascending: true });

      console.log('[MyJam] 곡 목록 조회:', { count: songsData?.length, error: songsError?.message, data: songsData });

      // 4. 사용자의 JAM 목록 조회 (songs와 JOIN 없이 단독 조회)
      const { data: jamsData, error: jamsError } = await supabase
        .from('jams')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      console.log('[MyJam] JAM 목록 조회:', { count: jamsData?.length, error: jamsError?.message, data: jamsData });

      // 5. 프로필 데이터 매핑
      const mappedProfile: MyJamProfileProps = {
        nickname: profileData?.nickname || user.email?.split('@')[0] || 'User',
        oderId: `JAM_${user.id.substring(0, 8).toUpperCase()}`,
        tier: mapTier(profileData?.stage),
        hasPremium: profileData?.has_pro_badge || false,
        hasEarlyBird: profileData?.has_early_bird_badge || false,
        topJam: null, // MVP: Top JAM은 좋아요 기능 미구현으로 null
      };

      // 6. JAM 목록 매핑 (songsData에서 곡 정보 찾기)
      const songsMap = new Map((songsData || []).map((s: any) => [s.id, s]));

      const mappedJams: JamItem[] = (jamsData || []).map((jam: any) => {
        const song = songsMap.get(jam.song_id);
        return {
          id: jam.id,
          title: song?.title || `JAM ${jam.song_id}`,
          artist: song?.artist || mappedProfile.nickname,
          coverUrl: song?.image_url || 'https://picsum.photos/200/200?random=1',
          recordedAt: new Date(jam.created_at).toISOString().split('T')[0],
          type: 'Single' as JamType, // MVP: Single만 지원
          hasReport: false, // MVP: AI 리포트 미구현
        };
      });

      // 7. 구매소스 매핑 (MVP: songs 테이블의 모든 곡을 '구매한 소스'로 표시)
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

  return {
    profile,
    purchasedSources,
    myJams,
    isLoading,
    error,
    refetch: fetchData,
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
