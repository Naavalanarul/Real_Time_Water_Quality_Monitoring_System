import os
import sqlite3
import joblib
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict, model_validator
import pandas as pd

try:
    import lightgbm as lgb
except ImportError:
    lgb = None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# DATABASE_URL is only set once you deploy to Vercel with a Postgres add-on
# (Neon/Supabase). For now, running locally, it's unset -> we fall back to a
# local SQLite file so you can run the whole pipeline with zero external
# services. Same insert_reading()/fetch_readings() call sites work either way.
DATABASE_URL = os.environ.get("DATABASE_URL")
SQLITE_PATH = os.path.join(BASE_DIR, "readings.db")
USE_SQLITE = not DATABASE_URL

if not USE_SQLITE:
    import psycopg2
    import psycopg2.extras

# =============================================================================
# Schema
# =============================================================================

class SensorData(BaseModel):
    """
    Validates the four raw environmental sensor readings plus an optional
    calibration factor used to convert TDS -> Electrical Conductivity.
    Accepts both "ph" and "pH" as the incoming key (ESP32 firmware in the
    wild sends either) via the normalize_keys validator on the parent model.
    """
    turbidity: float = Field(ge=0.0, description="Turbidity reading in NTU")
    temperature_c: float = Field(ge=-10.0, le=50.0, description="Water temperature in C")
    tds_ppm: float = Field(ge=0.0, description="Total Dissolved Solids in ppm")
    ph: float = Field(ge=0.0, le=14.0, description="pH level of the water sample")
    source_k_factor: float = Field(
        default=0.67,
        description="TDS-to-EC conversion factor (k). Defaults to 0.67 for standard freshwater.",
    )

class WaterQualityPayload(BaseModel):
    """
    Top-level request body. Accepts either "device_id" or "device id" as the
    incoming key (the aliasing quirk that broke earlier ESP32 payloads),
    normalized in the validator below before field parsing happens.
    """
    model_config = ConfigDict(populate_by_name=True)
    device_id: str = Field(alias="device id", min_length=3, max_length=50)
    timestamp: int = Field(gt=1600000000, description="Unix epoch seconds")
    sensors: SensorData

    @model_validator(mode="before")
    @classmethod
    def normalize_keys(cls, data):
        if isinstance(data, dict):
            # Accept "device_id" (underscore) in addition to the aliased "device id"
            if "device_id" in data and "device id" not in data:
                data["device id"] = data.pop("device_id")
            sensors = data.get("sensors")
            if isinstance(sensors, dict):
                # Accept "pH" (capital H) in addition to "ph"
                if "pH" in sensors and "ph" not in sensors:
                    sensors["ph"] = sensors.pop("pH")
        return data

# =============================================================================
# Calculation Engine
# =============================================================================

class WaterQualityCalculator:
    @staticmethod
    def calculate_ec(tds_ppm: float, k: float = 0.67) -> float:
        return tds_ppm / k

    @staticmethod
    def estimate_tss(turbidity: float) -> float:
        return turbidity * 1.25

    @staticmethod
    def calculate_do_saturation(temp_c: float) -> float:
        t = temp_c
        return (
            14.62
            - (0.41022 * t)
            + (0.007991 * (t ** 2))
            - (0.000077774 * (t ** 3))
        )

    @staticmethod
    def calculate_ammonia_toxicity_risk(temp_c: float, ph: float) -> float:
        pka = 0.09018 + (2729.92 / (temp_c + 273.15))
        return 100.0 / (1.0 + 10.0 ** (pka - ph))

class MockDOModel:
    EXPECTED_COLUMNS = ["pH", "Temperature", "Turbidity", "Conductivity"]
    def predict(self, df: pd.DataFrame) -> float:
        missing = set(self.EXPECTED_COLUMNS) - set(df.columns)
        if missing:
            raise ValueError(f"Input DataFrame is missing columns: {missing}")
        return 7.5

class WQIPredictor:
    def __init__(self):
        self.model_path = os.path.join(BASE_DIR, "best_wqi_model_lightgbm.pkl")
        self.csv_path = os.path.join(BASE_DIR, "water_quality_ph_temp_tds_turbidity_wqi.csv")
        self.model = None

        try:
            if os.path.exists(self.model_path):
                self.model = joblib.load(self.model_path)
            elif lgb is not None and os.path.exists(self.csv_path):
                df = pd.read_csv(self.csv_path)
                X = df[['pH', 'Temperature_C', 'TDS_mgL', 'Turbidity_NTU']]
                y = df['WQI']
                self.model = lgb.LGBMRegressor(
                    n_estimators=300, max_depth=-1, learning_rate=0.05,
                    num_leaves=63, min_child_samples=10, subsample=0.7,
                    colsample_bytree=0.9, random_state=42, verbosity=-1,
                )
                self.model.fit(X, y)
                # NOTE: Vercel's filesystem is read-only except /tmp, so this
                # dump only works locally. On Vercel, ship the .pkl file in
                # the repo so this branch is never hit.
                joblib.dump(self.model, self.model_path)
        except Exception as e:
            print(f"Error loading or training WQI model: {e}")
            self.model = None

    @staticmethod
    def estimate_wqi_fallback(ph, temp_c, tds_ppm, turbidity, do_sat, predicted_do, nh3_pct):
        ph_score = max(0, 100 - abs(ph - 7.5) * 20)
        do_score = min((predicted_do / max(do_sat, 0.01)) * 100, 100)
        turb_score = max(0, 100 - turbidity * 1.5)
        tds_score = max(0, 100 - (tds_ppm / 500) * 40)
        nh3_score = max(0, 100 - nh3_pct * 20)
        wqi = (ph_score * 0.25 + do_score * 0.25 + turb_score * 0.2 + tds_score * 0.15 + nh3_score * 0.15)
        return min(100.0, max(0.0, wqi))

    def predict(self, ph, temp_c, tds_ppm, turbidity_ntu):
        if self.model is not None:
            try:
                df = pd.DataFrame([{
                    'pH': ph, 'Temperature_C': temp_c,
                    'TDS_mgL': tds_ppm, 'Turbidity_NTU': turbidity_ntu,
                }])
                return float(self.model.predict(df)[0] * 100.0)
            except Exception as e:
                print(f"Model prediction failed: {e}. Falling back to formula.")
                return None
        return None

# =============================================================================
# Database (SQLite locally, Postgres once DATABASE_URL is set on Vercel)
# =============================================================================

READINGS_COLUMNS = [
    "device_id", "ts", "ph", "turbidity", "temperature_c", "tds_ppm",
    "ec", "tss", "do_saturation", "nh3_risk", "predicted_do", "wqi",
]

def ensure_table():
    if USE_SQLITE:
        with sqlite3.connect(SQLITE_PATH) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS readings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    device_id TEXT NOT NULL,
                    ts INTEGER NOT NULL,
                    ph REAL, turbidity REAL, temperature_c REAL, tds_ppm REAL,
                    ec REAL, tss REAL, do_saturation REAL, nh3_risk REAL,
                    predicted_do REAL, wqi REAL,
                    created_at TEXT DEFAULT (datetime('now'))
                );
                """
            )
            conn.commit()
    else:
        with psycopg2.connect(DATABASE_URL, sslmode="require") as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS readings (
                        id SERIAL PRIMARY KEY,
                        device_id TEXT NOT NULL,
                        ts BIGINT NOT NULL,
                        ph REAL, turbidity REAL, temperature_c REAL, tds_ppm REAL,
                        ec REAL, tss REAL, do_saturation REAL, nh3_risk REAL,
                        predicted_do REAL, wqi REAL,
                        created_at TIMESTAMPTZ DEFAULT now()
                    );
                    """
                )
            conn.commit()

def insert_reading(row: dict):
    if USE_SQLITE:
        with sqlite3.connect(SQLITE_PATH) as conn:
            placeholders = ", ".join(f":{c}" for c in READINGS_COLUMNS)
            conn.execute(
                f"INSERT INTO readings ({', '.join(READINGS_COLUMNS)}) VALUES ({placeholders})",
                row,
            )
            conn.commit()
    else:
        with psycopg2.connect(DATABASE_URL, sslmode="require") as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO readings
                        (device_id, ts, ph, turbidity, temperature_c, tds_ppm,
                         ec, tss, do_saturation, nh3_risk, predicted_do, wqi)
                    VALUES (%(device_id)s, %(ts)s, %(ph)s, %(turbidity)s, %(temperature_c)s,
                            %(tds_ppm)s, %(ec)s, %(tss)s, %(do_saturation)s, %(nh3_risk)s,
                            %(predicted_do)s, %(wqi)s)
                    """,
                    row,
                )
            conn.commit()

def fetch_readings(device_id, limit: int):
    if USE_SQLITE:
        with sqlite3.connect(SQLITE_PATH) as conn:
            conn.row_factory = sqlite3.Row
            if device_id:
                cur = conn.execute(
                    "SELECT * FROM readings WHERE device_id = ? ORDER BY ts DESC LIMIT ?",
                    (device_id, limit),
                )
            else:
                cur = conn.execute("SELECT * FROM readings ORDER BY ts DESC LIMIT ?", (limit,))
            return [dict(r) for r in cur.fetchall()]
    else:
        with psycopg2.connect(DATABASE_URL, sslmode="require") as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                if device_id:
                    cur.execute(
                        "SELECT * FROM readings WHERE device_id = %s ORDER BY ts DESC LIMIT %s",
                        (device_id, limit),
                    )
                else:
                    cur.execute("SELECT * FROM readings ORDER BY ts DESC LIMIT %s", (limit,))
                return cur.fetchall()

# =============================================================================
# App
# =============================================================================

app = FastAPI(
    title="Water Quality Monitoring API",
    version="1.1.0",
    description=(
        "Receives IoT sensor data, performs environmental chemistry "
        "calculations, runs ML inference, persists readings, and serves "
        "history for the dashboard."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ml_model = MockDOModel()
wqi_predictor = WQIPredictor()

@app.on_event("startup")
def _startup():
    try:
        ensure_table()
    except Exception as e:
        # Don't crash the whole function if DB isn't reachable yet;
        # analyze_water() will raise a clear 500 on first DB write instead.
        print(f"Table init skipped/failed: {e}")

@app.get("/")
def health():
    return {"status": "ok", "db_mode": "sqlite (local)" if USE_SQLITE else "postgres"}

@app.post("/api/v1/analyze-water")
async def analyze_water(payload: WaterQualityPayload) -> dict:
    sensors = payload.sensors

    ec = WaterQualityCalculator.calculate_ec(sensors.tds_ppm, sensors.source_k_factor)
    tss = WaterQualityCalculator.estimate_tss(sensors.turbidity)
    do_saturation = WaterQualityCalculator.calculate_do_saturation(sensors.temperature_c)
    nh3_risk = WaterQualityCalculator.calculate_ammonia_toxicity_risk(sensors.temperature_c, sensors.ph)

    feature_df = pd.DataFrame([{
        "pH": sensors.ph, "Temperature": sensors.temperature_c,
        "Turbidity": sensors.turbidity, "Conductivity": ec,
    }])
    predicted_do = ml_model.predict(feature_df)

    predicted_wqi = wqi_predictor.predict(
        ph=sensors.ph, temp_c=sensors.temperature_c,
        tds_ppm=sensors.tds_ppm, turbidity_ntu=sensors.turbidity,
    )
    wqi = predicted_wqi if predicted_wqi is not None else WQIPredictor.estimate_wqi_fallback(
        ph=sensors.ph, temp_c=sensors.temperature_c, tds_ppm=sensors.tds_ppm,
        turbidity=sensors.turbidity, do_sat=do_saturation,
        predicted_do=predicted_do, nh3_pct=nh3_risk,
    )

    result = {
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

    # Persist for the dashboard's history view. Any DB error surfaces as a
    # 500 with a clear message rather than silently dropping the reading.
    insert_reading({
        "device_id": payload.device_id,
        "ts": payload.timestamp,
        "ph": sensors.ph,
        "turbidity": sensors.turbidity,
        "temperature_c": sensors.temperature_c,
        "tds_ppm": sensors.tds_ppm,
        "ec": ec,
        "tss": tss,
        "do_saturation": do_saturation,
        "nh3_risk": nh3_risk,
        "predicted_do": predicted_do,
        "wqi": wqi,
    })

    return result

@app.get("/api/v1/readings")
def get_readings(
    device_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
):
    """History endpoint the React dashboard polls to render the time series."""
    return {"readings": fetch_readings(device_id, limit)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
