'use client';

type BottomInfoProps = {
  songTitle: string;
  artist: string;
};

export default function BottomInfo({ songTitle, artist }: BottomInfoProps) {
  return (
    <section className="flex flex-col items-center justify-center space-y-2 py-6 text-center">
      <h2 className="text-xl font-medium text-white">{songTitle}</h2>
      <p className="text-sm text-[#E0E0E0]">{artist}</p>
    </section>
  );
}

