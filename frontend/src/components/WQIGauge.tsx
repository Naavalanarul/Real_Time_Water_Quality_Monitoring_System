// ─── Circular WQI Gauge — Light Theme ────────────────────────────────────────

interface WQIGaugeProps {
  value: number;
  size?: number;
}

function getWQIColor(v: number): string {
  if (v >= 80) return "#16a34a"; // green-600
  if (v >= 60) return "#65a30d"; // lime-600
  if (v >= 40) return "#ca8a04"; // yellow-600
  if (v >= 20) return "#ea580c"; // orange-600
  return "#dc2626";              // red-600
}

function getWQILabel(v: number): string {
  if (v >= 80) return "Excellent";
  if (v >= 60) return "Good";
  if (v >= 40) return "Fair";
  if (v >= 20) return "Poor";
  return "Critical";
}

export default function WQIGauge({ value, size = 160 }: WQIGaugeProps) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(value, 0), 100);
  const offset = circumference - (progress / 100) * circumference;
  const color = getWQIColor(progress);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e2e8f0"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 0.8s ease-out, stroke 0.5s ease",
              filter: `drop-shadow(0 0 4px ${color}50)`,
            }}
          />
        </svg>

        {/* Centre label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold font-body" style={{ color }}>
            {progress.toFixed(0)}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-slate-400">
            WQI
          </span>
        </div>
      </div>

      {/* Status badge */}
      <span
        className="text-xs font-semibold tracking-wider uppercase px-3 py-1 rounded-full"
        style={{
          backgroundColor: `${color}15`,
          color,
          border: `1px solid ${color}30`,
        }}
      >
        {getWQILabel(progress)}
      </span>
    </div>
  );
}
