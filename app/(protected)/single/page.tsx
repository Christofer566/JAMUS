import { Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import SingleClientPage from './SingleClientPage';

export const dynamic = 'force-dynamic';

function SingleLoading() {
  return (
    <div className="min-h-screen bg-[#1B1C26] flex items-center justify-center">
      <div className="text-white">Loading...</div>
    </div>
  );
}

export default async function SinglePage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Supabase에서 곡 목록 조회 (Feed와 동일)
  const { data: songs } = await supabase
    .from('songs')
    .select('*')
    .order('id', { ascending: true });

  console.log('🎵 [Single] Supabase songs 조회:', songs?.map(s => ({
    id: s.id,
    title: s.title,
    bpm: s.bpm,
    structure: s.structure_data
  })));

  return (
    <Suspense fallback={<SingleLoading />}>
      <SingleClientPage initialSongs={songs || []} />
    </Suspense>
  );
}
