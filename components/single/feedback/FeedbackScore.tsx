// components/single/feedback/FeedbackScore.tsx
import React from 'react';

type Grade = {
  level: string;
  emoji: string;
  color: string;
};

type FeedbackScoreProps = {
  score: number;
  comment: string;
};

const getGradeDetails = (score: number): Grade => {
  if (score >= 90)
    return { level: 'Mastering', emoji: '💎', color: 'text-yellow-400' };
  if (score >= 75)
    return { level: 'Expressive', emoji: '🔴', color: 'text-red-500' };
  if (score >= 60)
    return { level: 'Developing', emoji: '🟡', color: 'text-yellow-500' };
  if (score >= 40)
    return { level: 'Exploring', emoji: '🟣', color: 'text-purple-500' };
  return { level: 'Learning', emoji: '⚪', color: 'text-white' };
};

const FeedbackScore = ({ score, comment }: FeedbackScoreProps) => {
  const { level, emoji, color } = getGradeDetails(score);

  return (
    <div
      data-testid="feedback-score"
      className="flex flex-col items-center justify-center text-white bg-white/5 border border-white/10 rounded-xl p-8 w-full max-w-md mx-auto"
    >
      <div className="text-center">
        <p className="text-sm text-gray-400">Total Score</p>
        <div className="flex items-center justify-center mt-2">
          <p className="text-[72px] font-bold text-[#1E6FFB] leading-none">{score}</p>
          <div
            data-testid="feedback-grade"
            className={`ml-4 text-xl font-semibold flex items-center ${color}`}
          >
            <span>{level}</span>
            <span className="ml-2">{emoji}</span>
          </div>
        </div>
      </div>
      <p data-testid="feedback-comment" className="mt-4 text-gray-400 text-center">
        "{comment}"
      </p>
    </div>
  );
};

export default FeedbackScore;
