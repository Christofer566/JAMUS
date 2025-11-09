'use client';

interface Performer {
  name: string;
  color: string;
  playRange: [number, number];
}

interface PlayerBarProps {
  songTitle: string;
  artist: string;
  duration: number;
  currentTime: number;
  performers: Performer[];
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export default function PlayerBar({
  songTitle,
  artist,
  duration,
  currentTime,
  performers,
}: PlayerBarProps) {
  const progress = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  return (
    <footer className="flex h-24 flex-col border-t border-gray-700/50 px-8 py-4">
      <div className="flex justify-center">
        <span className="text-sm text-white">
          {songTitle} · {artist}
        </span>
      </div>

      <div className="mt-4 flex flex-1 items-center justify-center">
        <button className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg shadow-blue-500/40">
          <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
        <span className="w-12 text-right">{formatTime(currentTime)}</span>

        <div className="relative h-2 flex-1 rounded-full bg-gray-700/50">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-blue-500"
            style={{ width: `${progress}%` }}
          />

          {performers.map((performer) => {
            const startPercent = Math.min((performer.playRange[0] / duration) * 100, 100);

            return (
              <div
                key={`${performer.name}-${performer.playRange.join("-")}`}
                className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-[#1B1C26]"
                style={{
                  left: `${startPercent}%`,
                  backgroundColor: performer.color,
                }}
                title={performer.name}
              />
            );
          })}
        </div>

        <span className="w-12">{formatTime(duration)}</span>
      </div>
    </footer>
  );
}

