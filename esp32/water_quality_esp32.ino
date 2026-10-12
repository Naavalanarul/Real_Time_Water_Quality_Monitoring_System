/*
  IoT Water Quality Monitoring System — ESP32 — CLOUD / VERCEL HTTPS VERSION
  Sensors: Turbidity (analog), TDS (analog), pH-4502C module (analog PO), DS18B20 (digital, 1-Wire)
  Output: JSON payload sent via secure HTTPS POST to the FastAPI backend deployed on Vercel, every 5 minutes.

  BEFORE YOU RUN THIS:
  1. Fill in your WiFi SSID/password below.
  2. Set VERCEL_DOMAIN to your Vercel deployment domain (e.g. "your-app.vercel.app").
  3. Run the CALIBRATION section instructions (bottom of file) BEFORE trusting turbidity/TDS/pH values.
  4. Confirm your board is on ADC1 pins (32-39) as wired — required because ADC2 conflicts with WiFi.

  Libraries required (install via Arduino IDE Library Manager):
  - OneWire
  - DallasTemperature
  - ArduinoJson (v6.x)
*/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <time.h>

// ---------------- USER CONFIG — EDIT THESE ----------------
const char* WIFI_SSID     = "S24";
const char* WIFI_PASSWORD = "asdfgqwerty";

// Your Vercel deployment domain (without https:// prefix)
const char* VERCEL_DOMAIN = "your-app.vercel.app"; // <-- CHANGE THIS to your deployed Vercel domain
String SERVER_URL; // built in setup()

const char* DEVICE_ID = "esp32_Station_01"; // sent as "device id" in the JSON payload

// NTP (for real-world timestamps, not just millis())
const char* NTP_SERVER       = "pool.ntp.org";
const long  GMT_OFFSET_SEC    = 5 * 3600 + 1800; // IST = UTC+5:30. Change if deploying elsewhere.
const int   DAYLIGHT_OFFSET_SEC = 0;

// Sampling interval — 5 minutes
const unsigned long SAMPLE_INTERVAL_MS = 5UL * 60UL * 1000UL;
// WiFi watchdog — if disconnected longer than this, force a reconnect attempt
const unsigned long WIFI_RETRY_INTERVAL_MS = 5000;
// ------------------------------------------------------------

// ---------------- PIN DEFINITIONS ----------------
#define TURBIDITY_PIN 34 // ADC1_CH6
#define TDS_PIN       35 // ADC1_CH7
#define PH_PIN        32 // ADC1_CH4
#define ONE_WIRE_BUS   4 // DS18B20 data pin

const float ADC_VREF       = 3.3;
const int   ADC_RESOLUTION = 4095; // 12-bit ADC

// ---------------- CALIBRATION PLACEHOLDERS ----------------
// FLAG: These are NOT verified universal constants. Determine them
// experimentally for YOUR exact sensor module. Do not trust readings until
// this section is done — see the CALIBRATION PROCEDURE at the bottom.
float PH_V7                      = 1.0;    // PLACEHOLDER — measured voltage at pH 7
float PH_V4                      = 0.823;  // PLACEHOLDER — measured voltage at pH 4
float TDS_SCALE_FACTOR           = 133.42; // PLACEHOLDER — replace with your module's real formula
float TURBIDITY_V_CLEAR          = 3.00;
float TURBIDITY_NTU_AT_V_CLEAR   = 0.0;
float TURBIDITY_V_STANDARD       = 2.20;
float TURBIDITY_NTU_AT_STANDARD  = 100.0;  // PLACEHOLDER — replace with your standard's actual NTU
// ------------------------------------------------------------

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensor(&oneWire);

unsigned long lastSampleTime = 0;
unsigned long lastWifiRetry  = 0;

// ---------------- SETUP ----------------
void setup() {
  Serial.begin(115200);
  delay(1000);

  SERVER_URL = String("https://") + VERCEL_DOMAIN + "/api/v1/analyze-water";
  Serial.print("Backend target: ");
  Serial.println(SERVER_URL);

  tempSensor.begin();
  setupWiFi();

  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
  waitForTimeSync();

  Serial.println("Setup complete. Starting sampling loop.");
}

// ---------------- MAIN LOOP ----------------
void loop() {
  maintainWiFi();

  if (millis() - lastSampleTime >= SAMPLE_INTERVAL_MS || lastSampleTime == 0) {
    lastSampleTime = millis();
    if (WiFi.status() == WL_CONNECTED) {
      takeSampleAndPost();
    } else {
      Serial.println("Skipping this cycle: WiFi not connected.");
    }
  }
}

// ---------------- WIFI ----------------
void setupWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WARNING: initial WiFi connect timed out. Will keep retrying in loop().");
  }
}

// Called every loop() iteration. Cheap no-op when already connected;
// otherwise retries at a fixed interval instead of blocking with delay().
void maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  if (millis() - lastWifiRetry >= WIFI_RETRY_INTERVAL_MS) {
    lastWifiRetry = millis();
    Serial.println("WiFi disconnected — attempting reconnect...");
    WiFi.disconnect();
    WiFi.reconnect();
  }
}

void waitForTimeSync() {
  Serial.print("Waiting for NTP time sync");
  time_t now = time(nullptr);
  int attempts = 0;
  while (now < 100000 && attempts < 20) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
    attempts++;
  }
  Serial.println();
  if (now < 100000) {
    Serial.println("WARNING: NTP sync failed. Timestamps will be inaccurate.");
  } else {
    Serial.println("Time synced.");
  }
}

// ---------------- SENSOR READ FUNCTIONS ----------------
float readADCVoltage(int pin, int samples = 20) {
  long sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(pin);
    delay(5);
  }
  float avgRaw = (float)sum / samples;
  return (avgRaw / (float)ADC_RESOLUTION) * ADC_VREF;
}

float readTemperatureC() {
  tempSensor.requestTemperatures();
  float t = tempSensor.getTempCByIndex(0);
  if (t == DEVICE_DISCONNECTED_C || t < -55.0 || t > 125.0) {
    Serial.println("WARNING: DS18B20 read failed. Returning NaN.");
    return NAN;
  }
  return t;
}

float readPHVoltage() {
  return readADCVoltage(PH_PIN, 30);
}

float voltageToPH(float voltage) {
  float slope = (7.0 - 4.0) / (PH_V7 - PH_V4);
  return 7.0 + slope * (voltage - PH_V7);
}

float readTDSVoltage() {
  return readADCVoltage(TDS_PIN, 20);
}

float voltageToTDS(float voltage, float tempC) {
  float compCoeff = 1.0 + 0.02 * (tempC - 25.0);
  float compVoltage = voltage / compCoeff;
  float tds = (133.42 * compVoltage * compVoltage * compVoltage
             - 255.86 * compVoltage * compVoltage
             + 857.39 * compVoltage) * 0.5;
  return tds < 0 ? 0 : tds;
}

float readTurbidityVoltage() {
  return readADCVoltage(TURBIDITY_PIN, 30);
}

float voltageToNTU(float voltage) {
  float slope = (TURBIDITY_NTU_AT_STANDARD - TURBIDITY_NTU_AT_V_CLEAR)
              / (TURBIDITY_V_STANDARD - TURBIDITY_V_CLEAR);
  float ntu = TURBIDITY_NTU_AT_V_CLEAR + slope * (voltage - TURBIDITY_V_CLEAR);
  if (ntu < 0) ntu = 0;
  return ntu;
}

// ---------------- SAMPLE + POST ----------------
void takeSampleAndPost() {
  float temperature = readTemperatureC();

  float phVoltage = readPHVoltage();
  Serial.print("pH raw voltage: ");
  Serial.println(phVoltage, 4);
  float ph = voltageToPH(phVoltage);

  float tdsVoltage = readTDSVoltage();
  float tds = voltageToTDS(tdsVoltage, isnan(temperature) ? 25.0 : temperature);

  float turbidityVoltage = readTurbidityVoltage();
  Serial.print("Turbidity raw voltage: ");
  Serial.println(turbidityVoltage, 4);
  float turbidity = voltageToNTU(turbidityVoltage);

  time_t now = time(nullptr);

  // JSON structure matches backend schema:
  StaticJsonDocument<300> doc;
  doc["device id"] = DEVICE_ID;
  doc["timestamp"] = (unsigned long)now;

  JsonObject sensors = doc.createNestedObject("sensors");
  sensors["ph"] = ph;
  sensors["turbidity"] = turbidity;
  sensors["temperature_c"] = isnan(temperature) ? 0.0 : (double)temperature;
  sensors["tds_ppm"] = tds;

  char buffer[300];
  serializeJson(doc, buffer);

  Serial.print("POSTing: ");
  Serial.println(buffer);

  postToBackend(buffer);
}

void postToBackend(const char* jsonBody) {
  WiFiClientSecure client;
  client.setInsecure(); // Skip certificate verification for embedded IoT, or configure root CA

  HTTPClient http;

  if (!http.begin(client, SERVER_URL)) {
    Serial.println("ERROR: http.begin() failed — check VERCEL_DOMAIN.");
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.setTimeout(15000);

  int httpCode = http.POST((uint8_t*)jsonBody, strlen(jsonBody));

  if (httpCode > 0) {
    Serial.printf("HTTP response code: %d\n", httpCode);
    String response = http.getString();
    Serial.println(response);
    if (httpCode >= 400) {
      Serial.println("WARNING: server rejected payload — check schema/field names.");
    }
  } else {
    Serial.printf("ERROR: POST failed, error: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}

/*
---------------- CALIBRATION PROCEDURE (do this before trusting data) ----------------
pH:
1. Rinse probe in distilled water.
2. Dip in pH 7.00 buffer solution, let reading stabilize, note voltage from Serial monitor.
3. Rinse, dip in pH 4.00 buffer, note voltage.
4. Set PH_V7 and PH_V4 above to your two measured values. Re-upload.

TDS:
1. Get your sensor module's actual datasheet formula — do not rely on the placeholder above.
2. Test in a known-concentration reference solution and adjust TDS_SCALE_FACTOR
(or replace the whole formula) to match.

Turbidity:
1. Read voltage in distilled/clear water (~0 NTU) — set TURBIDITY_V_CLEAR.
2. Read voltage in a known turbidity standard solution — set TURBIDITY_V_STANDARD
and TURBIDITY_NTU_AT_STANDARD to that solution's actual labeled NTU value.

Temperature (DS18B20):
Factory calibrated to ~+/-0.5C typically. Optionally cross-check against a
known-accurate thermometer once.
---------------------------------------------------------------------------------------
*/
