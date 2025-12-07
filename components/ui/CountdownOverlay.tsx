interface CountdownOverlayProps {
  countdown: number | null;
}

export default function CountdownOverlay({ countdown }: CountdownOverlayProps) {
  if (countdown === null || countdown < 1) {
    return null;
  }

  return (
    <div 
      data-testid="countdown-overlay"
      className="absolute inset-0 flex items-center justify-center bg-black/50 z-40 pointer-events-none"
    >
      <span key={countdown} className="text-8xl font-bold text-white animate-pulse">
        {countdown}
      </span>
    </div>
  );
}
