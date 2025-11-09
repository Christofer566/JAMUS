'use client';

import React from "react";

type Performer = {
  name: string;
  color: string;
  playRange: [number, number];
};

type BillboardProps = {
  songTitle: string;
  artist: string;
  performers: Performer[];
  chordProgression: string[][];
};

export default function Billboard({
  songTitle,
  artist,
  performers,
  chordProgression,
}: BillboardProps) {
  return (
    <section className="flex flex-1 items-center justify-center p-8">
      <div className="flex h-full w-full max-w-[900px] flex-col rounded-2xl border border-gray-700/50 bg-[#252736]">
        <header className="flex items-center justify-between border-b border-gray-700/50 px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-gray-700/50" />
            <div>
              <h2 className="text-xl font-bold text-white">{songTitle}</h2>
              <p className="text-sm text-gray-400">{artist}</p>
            </div>
          </div>
          <button className="rounded-full bg-white px-6 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100">
            이 JAM에 참여하기
          </button>
        </header>

        <div className="flex flex-1 gap-6 p-6">
          <aside className="flex w-48 flex-col gap-4">
            {performers.map((performer) => (
              <div key={performer.name} className="flex flex-col items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ backgroundColor: performer.color }}
                >
                  {performer.name.charAt(0).toUpperCase()}
                </div>
                <p className="text-sm text-gray-400">{performer.name}</p>
                <button className="text-gray-500 transition-colors hover:text-pink-500">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </aside>

          <div className="flex flex-1 rounded-lg bg-[#1B1C26] p-6">
            <div className="flex w-full flex-col gap-3">
              {chordProgression.map((line, lineIndex) => (
                <div key={lineIndex} className="flex h-16 items-stretch">
                  <div className="w-[3px] bg-gray-500" />
                  {line.map((chord, chordIndex) => (
                    <React.Fragment key={chordIndex}>
                      <div className="flex min-w-[100px] flex-1 items-center pl-4">
                        <span className="text-base text-white">{chord}</span>
                      </div>
                      <div
                        className={
                          chordIndex === line.length - 1
                            ? "w-[3px] bg-gray-500"
                            : "w-[1px] bg-gray-600"
                        }
                      />
                    </React.Fragment>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}