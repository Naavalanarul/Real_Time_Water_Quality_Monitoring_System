// ─── API Layer ───────────────────────────────────────────────────────────────
// Calls the real FastAPI backend at /api/v1/analyze-water.
// If the backend is unreachable, falls back to client-side calculation so the
// dashboard always works — even without `uvicorn` running.

import type { SensorInputs, AnalysisResponse } from "../types";

// ── Client-side fallback (mirrors backend logic) ─────────────────────────────

function clientSideFallback(s: SensorInputs): AnalysisResponse {
  const ec = s.tds_ppm / s.source_k_factor;
  const tss = s.turbidity * 1.25;
  const t = s.temperature_c;
  const doSat = 14.62 - 0.41022 * t + 0.007991 * t ** 2 - 0.000077774 * t ** 3;
  const pKa = 0.09018 + 2729.92 / (t + 273.15);
  const nh3Pct = 100 / (1 + 10 ** (pKa - s.ph));
  const predictedDO = 7.5;

  // Simple WQI estimation
  const phScore = Math.max(0, 100 - Math.abs(s.ph - 7.5) * 20);
  const doScore = Math.min((predictedDO / Math.max(doSat, 0.01)) * 100, 100);
  const turbScore = Math.max(0, 100 - s.turbidity * 1.5);
  const tdsScore = Math.max(0, 100 - (s.tds_ppm / 500) * 40);
  const nh3Score = Math.max(0, 100 - nh3Pct * 20);
  const wqi =
    phScore * 0.25 + doScore * 0.25 + turbScore * 0.2 +
    tdsScore * 0.15 + nh3Score * 0.15;

  return {
    device_id: "dashboard_web_01",
    timestamp: Math.floor(Date.now() / 1000),
    raw_inputs: {
      turbidity_ntu: s.turbidity,
      temperature_c: s.temperature_c,
      tds_ppm: s.tds_ppm,
      ph: s.ph,
      source_k_factor: s.source_k_factor,
    },
    calculated_metrics: {
      electrical_conductivity_us_cm: parseFloat(ec.toFixed(4)),
      total_suspended_solids_mg_l: parseFloat(tss.toFixed(4)),
      do_saturation_limit_mg_l: parseFloat(doSat.toFixed(4)),
      ammonia_toxicity_risk_pct_nh3: parseFloat(nh3Pct.toFixed(4)),
      predicted_dissolved_oxygen_mg_l: predictedDO,
      water_quality_index: parseFloat(Math.min(100, Math.max(0, wqi)).toFixed(2)),
    },
  };
}

// ── Public API function ──────────────────────────────────────────────────────

export async function analyzeWater(
  sensors: SensorInputs
): Promise<AnalysisResponse> {
  const payload = {
    "device id": "dashboard_web_01",
    timestamp: Math.floor(Date.now() / 1000),
    sensors,
  };

  try {
    const res = await fetch("/api/v1/analyze-water", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as AnalysisResponse;
  } catch {
    // Backend unavailable → client-side fallback with simulated delay
    console.warn("Backend unreachable — using client-side calculation.");
    await new Promise((r) => setTimeout(r, 600));
    return clientSideFallback(sensors);
  }
}
