'use client';

interface RecordingCompleteModalProps {
  isOpen: boolean;
  onReplay: () => void;
  onSave: () => void;
}

export default function RecordingCompleteModal({
  isOpen,
  onReplay,
  onSave,
}: RecordingCompleteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative z-10 bg-[#1B1C26] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-[#7BA7FF]/20 flex items-center justify-center">
            <span className="text-3xl">🎉</span>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-white text-center mb-2">
          녹음 완료!
        </h2>

        {/* Message */}
        <p className="text-gray-400 text-center mb-6">
          다시 들어보시겠습니까?
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onReplay}
            className="flex-1 py-3 px-4 rounded-xl bg-[#7BA7FF] text-white font-semibold hover:bg-[#6B97EF] transition-colors"
          >
            네
          </button>
          <button
            onClick={onSave}
            className="flex-1 py-3 px-4 rounded-xl border-2 border-[#7BA7FF] text-[#7BA7FF] font-semibold hover:bg-[#7BA7FF]/10 transition-colors"
          >
            아니요 (저장)
          </button>
        </div>
      </div>
    </div>
  );
}
