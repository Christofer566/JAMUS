
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
  songId: string; // song_id from jams table
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
  onDelete: (id: string) => void;
}

// ===== AI Report Types =====

export type MeasureStatus = 'accurate' | 'user_error' | 'system_limit' | 'unconfirmed';

export interface MeasureAnalysis {
  measureStart: number;
  measureEnd: number;
  accuracy: number;
  status: MeasureStatus;
}

export interface RangeAnalysis {
  label: string;
  range: string;
  value: number;
  color: string;
}

export interface EditStats {
  totalNotes: number;
  editedNotes: number;
  pitchEdits: number;
  timingEdits: number;
  lengthEdits: number;
}

export type SuggestionType = 'user' | 'system' | 'positive';

export interface AISuggestion {
  type: SuggestionType;
  title: string;
  description: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface AIReportData {
  jamId: string;
  
  // 기본 점수
  overallScore: number;
  pitchAccuracy: number;
  timingAccuracy: number;
  durationAccuracy: number;
  recoveryRate: number;
  
  // 구간별 분석
  measureAnalysis: MeasureAnalysis[];
  
  // 음역대별 분석
  rangeAnalysis: RangeAnalysis[];
  
  // 수정 통계
  editStats: EditStats;
  
  // AI 제안
  suggestions: AISuggestion[];
  
  // 메타데이터
  createdAt: string;
  updatedAt: string;
}
