// ─── Right Column: Intelligence Output — Light Theme ─────────────────────────
// Displays ALL computed results from the backend, with contextual colour-coded
// feedback (green = safe, red = warning) on a light card background.

import type { AnalysisResponse } from "../types";
import WQIGauge from "./WQIGauge";
import MetricCard from "./MetricCard";

interface OutputPanelProps {
  data: AnalysisResponse | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(danger: boolean) {
  return danger ? "text-red-600" : "text-emerald-600";
}

// ── Component ────────────────────────────────────────────────────────────────

export default function OutputPanel({ data }: OutputPanelProps) {
  // ── Empty state ────────────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="glass-strong flex flex-col items-center justify-center p-12 text-center min-h-[400px] opacity-0 animate-slide-up-delay-1">
        <div className="text-5xl mb-4 opacity-40">🌊</div>
        <h2 className="text-xl font-heading text-slate-500">
          Awaiting Sensor Data
        </h2>
        <p className="text-sm text-slate-400 mt-2 font-body max-w-xs">
          Submit sensor readings from the input panel to generate a
          comprehensive water quality analysis.
        </p>
      </div>
    );
  }

  // ── Destructure backend response ───────────────────────────────────────
  const m = data.calculated_metrics;
  const wqi = m.water_quality_index;

  const doIsDangerous =
    m.predicted_dissolved_oxygen_mg_l < m.do_saturation_limit_mg_l * 0.5;
  const nh3IsDangerous = m.ammonia_toxicity_risk_pct_nh3 > 0.05;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 opacity-0 animate-slide-up-delay-1">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-heading text-slate-800 tracking-tight">
          Intelligence Output
        </h2>
        <p className="text-sm text-slate-400 mt-1 font-body">
          Device <span className="text-blue-600 font-medium">{data.device_id}</span>
          {" · "}
          {new Date(data.timestamp * 1000).toLocaleString()}
        </p>
      </div>

      {/* ── WQI Gauge Card ──────────────────────────────────────────────── */}
      <div className="glass-strong p-6 flex flex-col items-center opacity-0 animate-slide-up-delay-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-body mb-4">
          Water Quality Index
        </h3>
        <WQIGauge value={wqi} size={180} />
      </div>

      {/* ── Metric Cards Grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Dissolved Oxygen */}
        <MetricCard
          title="Dissolved Oxygen (Predicted)"
          value={m.predicted_dissolved_oxygen_mg_l.toFixed(2)}
          unit="mg/L"
          animation="animate-slide-up-delay-2"
          className={doIsDangerous ? "!border-red-400" : ""}
          icon={<span>💧</span>}
          badge={
            doIsDangerous ? (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                Low DO
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                Healthy
              </span>
            )
          }
        >
          <div className="flex items-center justify-between text-xs font-body">
            <span className="text-slate-400">DO Saturation Limit</span>
            <span className={statusColor(doIsDangerous)}>
              {m.do_saturation_limit_mg_l.toFixed(2)} mg/L
            </span>
          </div>
          {doIsDangerous && (
            <p className="text-[11px] text-red-500 mt-2 font-body">
              ⚠ Predicted DO is dangerously below the saturation limit.
              Aquatic life may be at risk.
            </p>
          )}
        </MetricCard>

        {/* Ammonia Toxicity */}
        <MetricCard
          title="Ammonia Toxicity Risk"
          value={m.ammonia_toxicity_risk_pct_nh3.toFixed(4)}
          unit="% NH₃"
          animation="animate-slide-up-delay-3"
          className={nh3IsDangerous ? "!border-red-400" : ""}
          icon={<span>☣️</span>}
          badge={
            nh3IsDangerous ? (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 animate-pulse-ring">
                High Toxicity
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                Safe
              </span>
            )
          }
        >
          {nh3IsDangerous && (
            <p className="text-[11px] text-red-500 mt-1 font-body">
              ⚠ Unionised ammonia exceeds 0.05 % — toxic to fish and
              invertebrates.
            </p>
          )}
        </MetricCard>

        {/* Electrical Conductivity */}
        <MetricCard
          title="Electrical Conductivity"
          value={m.electrical_conductivity_us_cm.toFixed(2)}
          unit="µS/cm"
          animation="animate-slide-up-delay-4"
          icon={<span>⚡</span>}
        >
          <div className="flex items-center justify-between text-xs font-body">
            <span className="text-slate-400">Source TDS</span>
            <span className="text-slate-600">{data.raw_inputs.tds_ppm} ppm</span>
          </div>
        </MetricCard>

        {/* Total Suspended Solids */}
        <MetricCard
          title="Total Suspended Solids"
          value={m.total_suspended_solids_mg_l.toFixed(2)}
          unit="mg/L"
          animation="animate-slide-up-delay-5"
          icon={<span>🔬</span>}
        >
          <div className="flex items-center justify-between text-xs font-body">
            <span className="text-slate-400">Source Turbidity</span>
            <span className="text-slate-600">{data.raw_inputs.turbidity_ntu} NTU</span>
          </div>
        </MetricCard>
      </div>
    </div>
  );
}
