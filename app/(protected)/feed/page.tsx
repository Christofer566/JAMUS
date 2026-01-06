import { createClient } from '@supabase/supabase-js';
import FeedClientPage from './FeedClientPage';
import { StageProvider } from '@/contexts/StageContext';

export const dynamic = 'force-dynamic';

export default async function FeedPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 곡 목록 조회
  const { data: songs } = await supabase
    .from('songs')
    .select('*')
    .order('id', { ascending: true });

  // Task 8: 공유된 JAM 조회
  const { data: publicJams, error: jamsError } = await supabase
    .from('jams')
    .select('*')
    .eq('is_public', true)
    .order('shared_at', { ascending: false })
    .limit(50);

  // Task 8: JAM 사용자들의 프로필 조회
  const userIds = [...new Set((publicJams || []).map(j => j.user_id))];
  let userProfiles: Record<string, { nickname: string | null; avatar_url: string | null }> = {};

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url')
      .in('id', userIds);

    if (profiles) {
      userProfiles = profiles.reduce((acc, p) => {
        acc[p.id] = { nickname: p.nickname, avatar_url: p.avatar_url };
        return acc;
      }, {} as Record<string, { nickname: string | null; avatar_url: string | null }>);
    }
  }

  // JAM에 프로필 정보 병합
  const jamsWithProfiles = (publicJams || []).map(jam => ({
    ...jam,
    profile: userProfiles[jam.user_id] || { nickname: null, avatar_url: null }
  }));

  console.log('🎵 [Feed] publicJams 조회:', {
    count: publicJams?.length || 0,
    error: jamsError,
    jamsWithProfiles: jamsWithProfiles.map(j => ({
      id: j.id,
      song_id: j.song_id,
      audio_url: j.audio_url?.substring(0, 50) + '...',
      nickname: j.profile.nickname,
      output_instrument: j.output_instrument,
      note_data_count: j.note_data?.length || 0
    }))
  });

  return (
    <StageProvider>
      <FeedClientPage initialSongs={songs || []} publicJams={jamsWithProfiles} />
    </StageProvider>
  );
}
