// ─── Shared TypeScript Interfaces ────────────────────────────────────────────

/** Raw sensor inputs submitted from the form. */
export interface SensorInputs {
  ph: number;
  temperature_c: number;
  tds_ppm: number;
  turbidity: number;
  source_k_factor: number;
}

/** The full payload shape sent to the backend (matches Pydantic model). */
export interface WaterQualityPayload {
  "device id": string;
  timestamp: number;
  sensors: SensorInputs;
}

/** Calculated metrics returned by the backend. */
export interface CalculatedMetrics {
  electrical_conductivity_us_cm: number;
  total_suspended_solids_mg_l: number;
  do_saturation_limit_mg_l: number;
  ammonia_toxicity_risk_pct_nh3: number;
  predicted_dissolved_oxygen_mg_l: number;
  water_quality_index: number;
}

/** Complete API response from POST /api/v1/analyze-water. */
export interface AnalysisResponse {
  device_id: string;
  timestamp: number;
  raw_inputs: {
    turbidity_ntu: number;
    temperature_c: number;
    tds_ppm: number;
    ph: number;
    source_k_factor: number;
  };
  calculated_metrics: CalculatedMetrics;
}

/** Water source presets mapping a human-readable label to a k-factor. */
export interface WaterSource {
  label: string;
  k: number;
}

export const WATER_SOURCES: WaterSource[] = [
  { label: "Freshwater",        k: 0.67 },
  { label: "RO / Distilled",    k: 0.50 },
  { label: "Brackish Water",    k: 0.80 },
  { label: "Ocean / Seawater",  k: 0.90 },
  { label: "Industrial Runoff", k: 0.55 },
];
