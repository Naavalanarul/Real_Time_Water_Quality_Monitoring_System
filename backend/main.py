import contextlib
import io
import os
import joblib

# try:
#     with contextlib.redirect_stdout(io.StringIO()):
#         import antigravity  # noqa: F401  — https://xkcd.com/353/
# except Exception:
#     pass  # Gracefully ignore on headless environments

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import pandas as pd

try:
    import lightgbm as lgb
except ImportError:
    lgb = None

class SensorData(BaseModel):
    """
    Validates the four raw environmental sensor readings plus an optional
    calibration factor used to convert TDS → Electrical Conductivity.
    """

    turbidity: float = Field(
        ge=0.0,
        description="Turbidity reading in NTU (Nephelometric Turbidity Units)",
    )
    temperature_c: float = Field(
        ge=-10.0,
        le=50.0,
        description="Water temperature in degrees Celsius",
    )
    tds_ppm: float = Field(
        ge=0.0,
        description="Total Dissolved Solids in parts per million (ppm)",
    )
    ph: float = Field(
        ge=0.0,
        le=14.0,
        description="pH level of the water sample",
    )
    source_k_factor: float = Field(
        default=0.67,
        description=(
            "TDS-to-EC conversion factor (k). "
            "Defaults to 0.67 for standard freshwater."
        ),
    )


class WaterQualityPayload(BaseModel):
    """
    Top-level request body.  The ``device_id`` field is aliased to
    ``"device id"`` so the JSON key can contain a space — matching the
    format emitted by ESP32 / MQTT publishers.
    """

    device_id: str = Field(
        alias="device id",
        min_length=3,
        max_length=50,
        description="Unique identifier for the IoT sensor station",
    )
    timestamp: int = Field(
        gt=1600000000,
        description="Unix epoch timestamp (must be after ~Sep 2020)",
    )
    sensors: SensorData


# =============================================================================
# Calculation Engine
# =============================================================================


class WaterQualityCalculator:
    """
    Stateless utility class that encapsulates environmental chemistry
    formulas as static methods.  No instance state is required — every
    method is a pure function of its inputs.
    """

    @staticmethod
    def calculate_ec(tds_ppm: float, k: float = 0.67) -> float:
        """
        Estimate Electrical Conductivity (µS/cm) from TDS.

        Formula:  EC = TDS / k
        Default k = 0.67 for standard freshwater.
        """
        return tds_ppm / k

    @staticmethod
    def estimate_tss(turbidity: float) -> float:
        """
        Estimate Total Suspended Solids (mg/L) from Turbidity.

        Formula:  TSS = Turbidity × 1.25
        The 1.25 coefficient is a widely-used empirical approximation.
        """
        return turbidity * 1.25

    @staticmethod
    def calculate_do_saturation(temp_c: float) -> float:
        """
        Calculate the 100 % Dissolved Oxygen saturation limit (mg/L)
        at a given water temperature using a third-order polynomial
        regression derived from standard solubility tables.

        Formula:
            DO_sat = 14.62
                   - 0.41022·T
                   + 0.007991·T²
                   - 0.000077774·T³
        """
        t = temp_c
        return (
            14.62
            - (0.41022 * t)
            + (0.007991 * (t ** 2))
            - (0.000077774 * (t ** 3))
        )

    @staticmethod
    def calculate_ammonia_toxicity_risk(temp_c: float, ph: float) -> float:
        """
        Calculate the percentage of total ammonia nitrogen (TAN) present
        in the toxic unionised form (NH₃) as a function of temperature
        and pH.

        Steps:
            1. pKa = 0.09018 + 2729.92 / (T + 273.15)
            2. % NH₃ = 100 / (1 + 10^(pKa − pH))
        """
        pka = 0.09018 + (2729.92 / (temp_c + 273.15))
        nh3_percent = 100.0 / (1.0 + 10.0 ** (pka - ph))
        return nh3_percent


class MockDOModel:
    """
    A placeholder / stub that mimics the interface of a trained
    scikit-learn–style model.  In production this would load a
    serialised LightGBM (or similar) checkpoint from disk.

    It accepts a Pandas DataFrame with the columns
    [pH, Temperature, Turbidity, Conductivity] and always returns a
    constant predicted Dissolved Oxygen of **7.5 mg/L**.
    """

    EXPECTED_COLUMNS = ["pH", "Temperature", "Turbidity", "Conductivity"]

    def predict(self, df: pd.DataFrame) -> float:
        
        missing = set(self.EXPECTED_COLUMNS) - set(df.columns)
        if missing:
            raise ValueError(
                f"Input DataFrame is missing columns: {missing}"
            )
        return 7.5


class WQIPredictor:
    """
    Predicts Water Quality Index using a LightGBM model, or falls back to
    a static formula if the model cannot be loaded/trained.
    """
    def __init__(self):
        self.model_path = "best_wqi_model_lightgbm.pkl"
        self.csv_path = "water_quality_ph_temp_tds_turbidity_wqi.csv"
        self.model = None

        try:
            if os.path.exists(self.model_path):
                self.model = joblib.load(self.model_path)
            elif lgb is not None and os.path.exists(self.csv_path):
                df = pd.read_csv(self.csv_path)
                X = df[['pH', 'Temperature_C', 'TDS_mgL', 'Turbidity_NTU']]
                y = df['WQI']
                self.model = lgb.LGBMRegressor(
                    n_estimators=300,
                    max_depth=-1,
                    learning_rate=0.05,
                    num_leaves=63,
                    min_child_samples=10,
                    subsample=0.7,
                    colsample_bytree=0.9,
                    random_state=42,
                    verbosity=-1
                )
                self.model.fit(X, y)
                joblib.dump(self.model, self.model_path)
        except Exception as e:
            print(f"Error loading or training WQI model: {e}")
            self.model = None

    @staticmethod
    def estimate_wqi_fallback(ph, temp_c, tds_ppm, turbidity, do_sat, predicted_do, nh3_pct):
        ph_dev = abs(ph - 7.5)
        ph_score = max(0, 100 - ph_dev * 20)
        do_ratio = predicted_do / max(do_sat, 0.01)
        do_score = min(do_ratio * 100, 100)
        turb_score = max(0, 100 - turbidity * 1.5)
        tds_score = max(0, 100 - (tds_ppm / 500) * 40)
        nh3_score = max(0, 100 - nh3_pct * 20)
        wqi = (ph_score * 0.25 + do_score * 0.25 + turb_score * 0.2 + tds_score * 0.15 + nh3_score * 0.15)
        return min(100.0, max(0.0, wqi))

    def predict(self, ph, temp_c, tds_ppm, turbidity_ntu) -> float:
        if self.model is not None:
            try:
                df = pd.DataFrame([{
                    'pH': ph,
                    'Temperature_C': temp_c,
                    'TDS_mgL': tds_ppm,
                    'Turbidity_NTU': turbidity_ntu
                }])
                return float(self.model.predict(df)[0] * 100.0)
            except Exception as e:
                print(f"Model prediction failed: {e}. Falling back to formula.")
                return None
        return None


app = FastAPI(
    title="Water Quality Monitoring API",
    version="1.0.0",
    description=(
        "Receives IoT sensor data, performs environmental chemistry "
        "calculations, runs a mock ML inference, and returns a structured "
        "analysis response."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instantiate models at module level
ml_model = MockDOModel()
wqi_predictor = WQIPredictor()


@app.post("/api/v1/analyze-water")
async def analyze_water(payload: WaterQualityPayload) -> dict:
    """
    **Analyse a water-quality sample.**

    Accepts a ``WaterQualityPayload``, computes derived metrics via the
    ``WaterQualityCalculator``, runs the mock ML model, predicts WQI,
    and returns everything in a single JSON envelope.
    """
    sensors = payload.sensors

    # ── Derived Calculations ─────────────────────────────────────────────
    ec = WaterQualityCalculator.calculate_ec(
        tds_ppm=sensors.tds_ppm,
        k=sensors.source_k_factor,
    )
    tss = WaterQualityCalculator.estimate_tss(
        turbidity=sensors.turbidity,
    )
    do_saturation = WaterQualityCalculator.calculate_do_saturation(
        temp_c=sensors.temperature_c,
    )
    nh3_risk = WaterQualityCalculator.calculate_ammonia_toxicity_risk(
        temp_c=sensors.temperature_c,
        ph=sensors.ph,
    )

    # ── Mock ML Inference ────────────────────────────────────────────────
    # Build a single-row DataFrame with the features the model expects.
    feature_df = pd.DataFrame(
        [
            {
                "pH": sensors.ph,
                "Temperature": sensors.temperature_c,
                "Turbidity": sensors.turbidity,
                "Conductivity": ec,  # feed the *derived* EC value
            }
        ]
    )
    predicted_do = ml_model.predict(feature_df)

    # ── WQI Prediction ───────────────────────────────────────────────────
    predicted_wqi = wqi_predictor.predict(
        ph=sensors.ph,
        temp_c=sensors.temperature_c,
        tds_ppm=sensors.tds_ppm,
        turbidity_ntu=sensors.turbidity
    )

    if predicted_wqi is not None:
        wqi = predicted_wqi
    else:
        wqi = WQIPredictor.estimate_wqi_fallback(
            ph=sensors.ph,
            temp_c=sensors.temperature_c,
            tds_ppm=sensors.tds_ppm,
            turbidity=sensors.turbidity,
            do_sat=do_saturation,
            predicted_do=predicted_do,
            nh3_pct=nh3_risk,
        )

    # ── Assemble Response ────────────────────────────────────────────────
    return {
        "device_id": payload.device_id,
        "timestamp": payload.timestamp,
        "raw_inputs": {
            "turbidity_ntu": sensors.turbidity,
            "temperature_c": sensors.temperature_c,
            "tds_ppm": sensors.tds_ppm,
            "ph": sensors.ph,
            "source_k_factor": sensors.source_k_factor,
        },
        "calculated_metrics": {
            "electrical_conductivity_us_cm": round(ec, 4),
            "total_suspended_solids_mg_l": round(tss, 4),
            "do_saturation_limit_mg_l": round(do_saturation, 4),
            "ammonia_toxicity_risk_pct_nh3": round(nh3_risk, 4),
            "predicted_dissolved_oxygen_mg_l": predicted_do,
            "water_quality_index": round(wqi, 2),
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
