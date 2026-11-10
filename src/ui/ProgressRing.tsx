export interface ProgressRingProps {
  value: number; // 0 to 100
  size?: number; // size in px, default 48
  strokeWidth?: number; // default 4
  className?: string;
  showLabel?: boolean;
}

export function ProgressRing({
  value,
  size = 48,
  strokeWidth = 4,
  className = '',
  showLabel = true,
}: ProgressRingProps) {
  const clampedValue = Math.min(100, Math.max(0, Math.round(value)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference;

  return (
    <div
      role="progressbar"
      aria-valuenow={clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Readiness score: ${clampedValue}%`}
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
        aria-hidden="true"
      >
        {/* Track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-border-subtle"
        />
        {/* Value circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="text-accent-brass transition-all duration-300 ease-out"
        />
      </svg>
      {showLabel && (
        <span
          className="absolute font-mono text-[11px] font-semibold text-text-primary"
          aria-hidden="true"
        >
          {clampedValue}%
        </span>
      )}
    </div>
  );
}
