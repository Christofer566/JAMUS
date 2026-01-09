
export type TierType = 'Beginner' | 'Mid' | 'Free';

export interface TopJam {
  title: string;
  artist: string;
  coverUrl: string;
  likes: number;
}

export interface MyJamProfileProps {
  nickname: string;
  oderId: string;
  tier: TierType;
  hasPremium: boolean;
  hasEarlyBird: boolean;
  topJam: TopJam | null;
}

export interface PurchasedSource {
  id: string;
  title: string;
  artist: string;
  seller: string;
  coverUrl: string;
}

export type SortType = 'latest' | 'title' | 'artist';

export interface PurchasedSourcesProps {
  sources: PurchasedSource[];
  activeSort: SortType;
  onSortChange: (sort: SortType) => void;
  onViewAll: () => void;
  onSourceClick?: (sourceId: string) => void;
}

export type JamType = 'Single' | 'Multi';
export type FilterType = 'All' | 'Single' | 'Multi';

export interface JamItem {
  id: string;
  name?: string; // JAM name (optional for compatibility)
  title: string;
  artist: string;
  coverUrl: string;
  recordedAt: string;
  type: JamType;
  hasReport: boolean;
  audioUrl: string;
  backingTrackUrl?: string; // M-05: 믹싱 재생용 backing track URL
  startMeasure?: number; // 녹음 시작 마디
}

export interface MyJamListProps {
  jams: JamItem[];
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  onViewAll: () => void;
  onPlay: (id: string) => void;
  onViewReport: (id: string) => void;
  onCreateReport: (id: string) => void;
}
