import { createClient } from '@supabase/supabase-js';
import FeedClientPage from './FeedClientPage';
import { StageProvider } from '@/contexts/StageContext';

export const dynamic = 'force-dynamic';

export default async function FeedPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: songs } = await supabase
    .from('songs')
    .select('*')
    .order('id', { ascending: true });

  return (
    <StageProvider>
      <FeedClientPage initialSongs={songs || []} />
    </StageProvider>
  );
}
