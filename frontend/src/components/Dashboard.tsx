// ─── Dashboard Layout — Light Theme ──────────────────────────────────────────

import { useState } from "react";
import InputPanel from "./InputPanel";
import OutputPanel from "./OutputPanel";
import { analyzeWater } from "../api/mockApi";
import type { SensorInputs, AnalysisResponse } from "../types";

const DEFAULT_INPUTS: SensorInputs = {
  ph: 7.54,
  temperature_c: 24.1,
  tds_ppm: 450,
  turbidity: 14.5,
  source_k_factor: 0.67,
};

export default function Dashboard() {
  const [inputs, setInputs] = useState<SensorInputs>(DEFAULT_INPUTS);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const response = await analyzeWater(inputs);
      setResult(response);
    } catch (err) {
      console.error("Analysis failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 min-h-screen">
      {/* Header */}
      <header className="pt-8 pb-4 px-6 md:px-12 opacity-0 animate-fade-in">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-heading text-slate-800 tracking-tight">
            Aqua<span className="text-blue-600">Lens</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1 font-body tracking-wide">
            Real-Time Water Quality Intelligence Platform
          </p>
        </div>
      </header>

      {/* Two-column grid */}
      <main className="px-6 md:px-12 pb-16">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Left — Input */}
          <div className="lg:col-span-5 xl:col-span-4">
            <InputPanel
              inputs={inputs}
              onChange={setInputs}
              onSubmit={handleAnalyze}
              loading={loading}
            />
          </div>

          {/* Right — Output */}
          <div className="lg:col-span-7 xl:col-span-8">
            <OutputPanel data={result} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center pb-8 text-xs text-slate-300 font-body">
        AquaLens Water Quality Monitoring System · InnoHack 2026
      </footer>
    </div>
  );
}
