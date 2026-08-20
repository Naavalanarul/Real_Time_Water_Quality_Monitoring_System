// ─── Left Column: Data Input Node — Light Theme ──────────────────────────────

import type { SensorInputs } from "../types";
import { WATER_SOURCES } from "../types";

interface InputPanelProps {
  inputs: SensorInputs;
  onChange: (next: SensorInputs) => void;
  onSubmit: () => void;
  loading: boolean;
}

/** Labelled slider + number input pair. */
function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-600 font-body">
          {label}
        </label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            className="w-20 bg-white/80 border border-slate-200 rounded-lg px-2 py-1
                       text-right text-sm text-slate-700 font-body outline-none
                       focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          />
          <span className="text-xs text-slate-400 w-10">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <div className="flex justify-between text-[10px] text-slate-300 font-body">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export default function InputPanel({
  inputs,
  onChange,
  onSubmit,
  loading,
}: InputPanelProps) {
  const update = (patch: Partial<SensorInputs>) =>
    onChange({ ...inputs, ...patch });

  return (
    <div className="glass-strong p-6 md:p-8 space-y-6 opacity-0 animate-slide-up">
      {/* Section header */}
      <div>
        <h2 className="text-2xl font-heading text-slate-800 tracking-tight">
          Data Input Node
        </h2>
        <p className="text-sm text-slate-400 mt-1 font-body">
          Configure raw sensor readings for analysis
        </p>
      </div>

      <div className="h-px bg-slate-200/70" />

      {/* pH */}
      <SliderField
        label="pH Level"
        value={inputs.ph}
        min={0}
        max={14}
        step={0.01}
        unit="pH"
        onChange={(v) => update({ ph: v })}
      />

      {/* Temperature */}
      <SliderField
        label="Temperature"
        value={inputs.temperature_c}
        min={-10}
        max={50}
        step={0.1}
        unit="°C"
        onChange={(v) => update({ temperature_c: v })}
      />

      {/* TDS */}
      <SliderField
        label="Total Dissolved Solids"
        value={inputs.tds_ppm}
        min={0}
        max={2000}
        step={1}
        unit="ppm"
        onChange={(v) => update({ tds_ppm: v })}
      />

      {/* Turbidity */}
      <SliderField
        label="Turbidity"
        value={inputs.turbidity}
        min={0}
        max={500}
        step={0.1}
        unit="NTU"
        onChange={(v) => update({ turbidity: v })}
      />

      <div className="h-px bg-slate-200/70" />

      {/* Water Source Dropdown */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-600 font-body">
          Water Source Type
        </label>
        <select
          value={inputs.source_k_factor}
          onChange={(e) =>
            update({ source_k_factor: parseFloat(e.target.value) })
          }
          className="w-full bg-white/80 border border-slate-200 rounded-lg px-4 py-2.5
                     text-sm text-slate-700 font-body outline-none cursor-pointer
                     focus:border-blue-400 focus:ring-2 focus:ring-blue-100
                     transition-all appearance-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2364748b' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 12px center",
          }}
        >
          {WATER_SOURCES.map((src) => (
            <option key={src.k} value={src.k}>
              {src.label} (k = {src.k})
            </option>
          ))}
        </select>
      </div>

      {/* CTA Button */}
      <button
        onClick={onSubmit}
        disabled={loading}
        className="w-full relative overflow-hidden rounded-xl py-3.5 font-semibold text-sm
                   tracking-wider uppercase font-body text-white
                   bg-gradient-to-r from-blue-600 to-blue-500
                   hover:from-blue-500 hover:to-blue-400
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all duration-300
                   shadow-lg shadow-blue-500/20 hover:shadow-blue-400/30
                   active:scale-[0.98]"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
            </svg>
            Analyzing…
          </span>
        ) : (
          "⚡ Analyze Ecosystem"
        )}
      </button>
    </div>
  );
}
