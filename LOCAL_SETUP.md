Local-only run (no Vercel) — step by step

Everything runs on your laptop. The ESP32 talks to your laptop directly over the phone hotspot (both devices on the same hotspot network). No cloud, no external database — the backend auto-falls-back to a local SQLite file when DATABASE_URL isn't set.

1. Get the laptop's IP address on the hotspot
Connect your laptop to the same phone hotspot the ESP32 will use, then:
- Windows: open Command Prompt, run ipconfig, find "IPv4 Address" under the WiFi adapter (something like 192.168.43.x or 172.20.10.x).
- Mac: ifconfig | grep inet, find the en0 entry (not 127.0.0.1).
- Linux: ip addr, find the wlan0/wlp... entry.
Write this IP down — you'll need it in step 4.

2. Set up and run the backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```
--host 0.0.0.0 is required — 127.0.0.1 would only accept connections from the laptop itself, not from the ESP32 over the network.
Leave this running. In a browser or new terminal, check:
curl http://localhost:8000/
Expect: {"status":"ok","db_mode":"sqlite (local)"}

3. Allow the port through your firewall
- Windows: first time you run uvicorn, a Windows Defender Firewall prompt should appear — click "Allow access" for both private and public networks.
- Mac: System Settings -> Network -> Firewall -> allow incoming connections for Python/uvicorn if prompted.
If nothing prompts you and the ESP32 can't connect in step 6, manually add a firewall rule allowing inbound TCP on port 8000.

4. Configure and flash the ESP32
Open esp32/water_quality_esp32_local.ino in Arduino IDE.
Set:
- WIFI_SSID / WIFI_PASSWORD -> your phone hotspot credentials.
- LOCAL_SERVER_IP -> the laptop IP from step 1 (e.g. "192.168.43.100").
Install required libraries if not already installed: OneWire, DallasTemperature, ArduinoJson (v6.x).
On your phone: turn off hotspot auto-disconnect / idle timeout, keep it charging.
Flash the ESP32, open Serial Monitor at 115200 baud.

5. Watch it work
In Serial Monitor you should see, in order:
Backend target: http://192.168.43.100:8000/api/v1/analyze-water
WiFi connected. IP: ...
Time synced.
Every 5 minutes: POSTing: {...} then HTTP response code: 200
In the terminal running uvicorn, you should see matching POST /api/v1/analyze-water log lines with a 200 OK status.

6. Check stored readings
curl "http://localhost:8000/api/v1/readings?device_id=esp32_Station_01&limit=5"
You should see the readings the ESP32 posted, most recent first.

7. Run the frontend
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Open the printed URL (usually http://localhost:5173). The Vite dev server proxies /api/* requests to http://localhost:8000 automatically (already configured in vite.config.ts), so the dashboard talks to your local backend with no extra setup.

8. Calibrate
Once you can see raw voltages printing correctly in Serial Monitor, follow the calibration procedure in the comments at the bottom of the .ino file for pH, TDS, and turbidity — do this before trusting the numeric values.

Troubleshooting
Symptom | Likely cause
--- | ---
ESP32 stuck on Connecting to WiFi... | Wrong SSID/password, or hotspot auto-off kicked in
http.begin() failed | LOCAL_SERVER_IP malformed — check quotes/format in the sketch
HTTP response code -1 or connection refused | Backend not running, wrong IP, or firewall blocking port 8000
HTTP response code 422 | JSON schema mismatch — shouldn't happen with this sketch, but check for stray edits
curl http://localhost:8000/ fails from the laptop itself | uvicorn isn't running, or crashed — check its terminal output
ESP32 posts succeed but /api/v1/readings is empty | Double-check device_id in the query matches what the ESP32 sends (esp32_Station_01)
Laptop's IP changes and stops working | Phone hotspots can reassign IPs on reconnect — recheck with ipconfig/ifconfig and reflash if it changed

Moving to Vercel later
When you're ready, switch back to esp32/water_quality_esp32.ino (the HTTPS version), set DATABASE_URL as an env var pointing at Supabase/Neon, and deploy using the vercel.json / api/index.py files already provided. No changes to backend/main.py are needed — it already switches to Postgres automatically the moment DATABASE_URL is set.
