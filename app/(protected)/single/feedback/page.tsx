import { Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import FeedbackClientPage from './FeedbackClientPage';

export const dynamic = 'force-dynamic';

function FeedbackLoading() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#0D1B2A] text-white">
      Loading Feedback...
    </div>
  );
}

export default async function FeedbackPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Supabase에서 곡 목록 조회
  const { data: songs } = await supabase
    .from('songs')
    .select('*')
    .order('id', { ascending: true });

  return (
    <Suspense fallback={<FeedbackLoading />}>
      <FeedbackClientPage initialSongs={songs || []} />
    </Suspense>
  );
}