const BARS = [34, 58, 82, 46, 68, 96, 56, 76, 42, 88, 64, 38, 72, 92, 50, 66, 36, 78, 54, 86, 44, 62, 32, 70];

export function WaveMark({ className = "", bars = BARS.length }: { className?: string; bars?: number }) {
  return (
    <span className={`flex h-16 items-center gap-1 ${className}`} aria-hidden="true">
      {BARS.slice(0, bars).map((height, i) => (
        <span
          key={i}
          className="w-1.5 shrink-0 rounded-full bg-current"
          style={{ height: `${height}%` }}
        />
      ))}
    </span>
  );
}
