export const dynamic = 'force-dynamic';

import FeedClientPage from './FeedClientPage';
import { StageProvider } from '@/contexts/StageContext';

export default function FeedPage() {
  return (
    <StageProvider>
      <FeedClientPage />
    </StageProvider>
  );
}
