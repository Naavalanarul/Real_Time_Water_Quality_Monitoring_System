// ─── Reusable Glassmorphic Metric Card — Light Theme ─────────────────────────

import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon?: ReactNode;
  className?: string;
  badge?: ReactNode;
  animation?: string;
  children?: ReactNode;
}

export default function MetricCard({
  title,
  value,
  unit,
  icon,
  className = "",
  badge,
  animation = "animate-slide-up",
  children,
}: MetricCardProps) {
  return (
    <div
      className={`
        glass relative overflow-hidden p-5
        opacity-0 ${animation}
        transition-all duration-300 hover:scale-[1.02] hover:shadow-lg
        ${className}
      `}
    >
      {badge && (
        <div className="absolute top-3 right-3">{badge}</div>
      )}

      {/* Title */}
      <div className="flex items-center gap-2 mb-3">
        {icon && <span className="text-blue-500 text-lg">{icon}</span>}
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-body">
          {title}
        </h3>
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-slate-800 font-body">
          {value}
        </span>
        {unit && (
          <span className="text-sm text-slate-400 font-body">{unit}</span>
        )}
      </div>

      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
