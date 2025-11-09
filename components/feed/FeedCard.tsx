'use client';

// components/feed/FeedCard.tsx
interface FeedCardProps {
    userName: string;
    userAvatar?: string;
    instrumentColor: string; // 악기 색상 (Em, D, C 등의 배경색)
  }
  
  export default function FeedCard({ userName, instrumentColor }: FeedCardProps) {
    return (
      <div className="mb-6 last:mb-0">
        {/* 카드 전체 */}
        <div className="flex gap-4">
          {/* 왼쪽: 아바타 + 좋아요 버튼 */}
          <div className="flex flex-col items-center gap-2 pt-2">
            {/* 아바타 */}
            <div 
              className="h-12 w-12 rounded-full flex items-center justify-center text-sm font-medium"
              style={{ backgroundColor: instrumentColor }}
            >
              {userName.charAt(0).toUpperCase()}
            </div>
            
            {/* 좋아요 버튼 */}
            <button className="text-gray-500 hover:text-pink-500 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
          </div>
  
          {/* 오른쪽: 코드 진행 영역 */}
          <div className="flex-1">
            {/* 4단계에서 코드 차트 추가 예정 */}
            <div className="bg-[#2A2D3E] rounded-lg p-4 min-h-[120px]">
              <p className="text-xs text-gray-500">코드 진행 영역 (4단계)</p>
            </div>
            
            {/* 하단: 사용자 이름 */}
            <p className="text-sm text-gray-400 mt-2">{userName}</p>
          </div>
        </div>
      </div>
    );
  }