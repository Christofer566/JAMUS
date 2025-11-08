export default function FeedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="max-w-lg rounded-2xl border border-[#2A2B39]/40 bg-[#1E1F2B] p-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="rounded-full bg-[#5B8DEF]/20 p-4">
            <svg
              className="h-12 w-12 text-[#5B8DEF]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
        </div>

        <h1 className="mb-2 text-2xl font-semibold text-[#F7F8FB]">
          Feed 화면 준비 중
        </h1>
        <p className="text-[#A0A0A0]">
          곧 친구들의 음악 취향을 확인할 수 있어요
        </p>

        <div className="mt-6 space-y-2">
          <div className="flex items-center gap-2 text-sm text-[#3DDF85]">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            로그인 성공!
          </div>
          <div className="flex items-center gap-2 text-sm text-[#3DDF85]">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            profiles 테이블 작동 확인 완료
          </div>
        </div>
      </div>
    </div>
  );
}

