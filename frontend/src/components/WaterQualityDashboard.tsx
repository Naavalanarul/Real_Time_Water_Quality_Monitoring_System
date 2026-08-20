import React, { useState, useEffect } from 'react';
import { 
  Droplets, 
  Thermometer, 
  Activity, 
  Wind, 
  Zap, 
  Waves,
  AlertTriangle,
  CheckCircle,
  Clock,
  MapPin
} from 'lucide-react';

// Predefined modules for different water bodies
const WATER_BODIES = {
  lake: { name: 'Freshwater Lake', base: { ph: 7.2, temp: 18.5, tds: 150, turbidity: 2.5 } },
  river: { name: 'Flowing River', base: { ph: 7.6, temp: 14.0, tds: 250, turbidity: 8.0 } },
  ocean: { name: 'Coastal Ocean', base: { ph: 8.1, temp: 22.0, tds: 35000, turbidity: 1.2 } },
  industrial: { name: 'Industrial Runoff', base: { ph: 5.5, temp: 28.0, tds: 1200, turbidity: 45.0 } }
};

const WaterQualityDashboard = () => {
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [selectedBody, setSelectedBody] = useState('lake');
  const [data, setData] = useState({
    wqi: 0,
    ph: 0,
    temperature: 0,
    tds: 0,
    turbidity: 0,
    ec: 0,
    tss: 0,
    do: 0,
    ammonia: 0
  });
  const [loading, setLoading] = useState(false);

  // Ammonia spike threshold for warning
  const ammoniaWarningThreshold = 0.05;

  const resetToZero = () => {
    setIsMonitoring(false);
    setLoading(false);
    setData({
      wqi: 0, ph: 0, temperature: 0, tds: 0, turbidity: 0, ec: 0, tss: 0, do: 0, ammonia: 0
    });
  };

  useEffect(() => {
    if (!isMonitoring) return;

    setLoading(true);
    const fetchData = async () => {
      // 1. Generate realistic raw inputs based on the selected water body
      const base = WATER_BODIES[selectedBody as keyof typeof WATER_BODIES].base;
      const fluctuate = (val: number, maxDelta: number) => {
        const delta = (Math.random() * maxDelta * 2) - maxDelta;
        return val + delta;
      };

      const currentInputs = {
        turbidity: Math.max(0, fluctuate(base.turbidity, base.turbidity * 0.1)),
        temperature_c: fluctuate(base.temp, 0.5),
        tds_ppm: Math.max(0, fluctuate(base.tds, base.tds * 0.05)),
        ph: Math.min(14, Math.max(0, fluctuate(base.ph, 0.2))),
        source_k_factor: 0.67
      };

      // 2. Send to backend
      try {
        const response = await fetch('http://localhost:8080/api/v1/analyze-water', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            "device id": `sensor-${selectedBody}`,
            "timestamp": Math.floor(Date.now() / 1000),
            "sensors": currentInputs
          })
        });

        if (response.ok) {
          const result = await response.json();
          const metrics = result.calculated_metrics;
          
          setData({
            wqi: metrics.water_quality_index,
            ph: currentInputs.ph,
            temperature: currentInputs.temperature_c,
            tds: Math.round(currentInputs.tds_ppm),
            turbidity: currentInputs.turbidity,
            ec: metrics.electrical_conductivity_us_cm,
            tss: metrics.total_suspended_solids_mg_l,
            do: metrics.predicted_dissolved_oxygen_mg_l,
            ammonia: metrics.ammonia_toxicity_risk_pct_nh3
          });
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to fetch from backend", error);
      }
    };

    fetchData(); // initial fetch
    const interval = setInterval(fetchData, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [selectedBody, isMonitoring]);

  const isAmmoniaWarning = data.ammonia > ammoniaWarningThreshold;

  return (
    <div className="min-h-screen font-sans text-slate-50 relative overflow-hidden">
      {/* Background Video Iframe - Added scale-150 to hide YouTube branding/logos */}
      <iframe
        className="fixed inset-0 w-[100vw] h-[100vh] z-[-1] pointer-events-none object-cover scale-[1.6]"
        src="https://www.youtube.com/embed/QnjD8eQYTDs?autoplay=1&mute=1&loop=1&playlist=QnjD8eQYTDs&controls=0&disablekb=1&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3&fs=0&start=120&vq=hd2160"
        allow="autoplay; encrypted-media; picture-in-picture"
        title="Background Water Video"
        style={{ border: 'none' }}
      ></iframe>
      
      {/* Slight dark overlay to ensure text remains readable */}
      <div className="fixed inset-0 bg-black/40 z-[-1] pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 py-8 relative z-10 flex flex-col gap-6">
        {/* Header */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white flex items-center gap-3">
              <Droplets className="w-8 h-8 text-blue-400" />
              AquaSense Live
            </h1>
            <p className="text-slate-300 mt-1 flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4" /> Real-time water quality monitoring network
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Water Body Selector Dropdown */}
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin className="w-4 h-4 text-slate-400 group-hover:text-blue-400 transition-colors" />
              </div>
              <select
                value={selectedBody}
                onChange={(e) => {
                  if (isMonitoring) setLoading(true);
                  setSelectedBody(e.target.value);
                  setData({
                    wqi: 0, ph: 0, temperature: 0, tds: 0, turbidity: 0, ec: 0, tss: 0, do: 0, ammonia: 0
                  });
                }}
                className="pl-10 pr-10 py-2 bg-slate-900/80 backdrop-blur-xl border border-white/20 rounded-xl text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg hover:border-white/40 transition-all font-medium min-w-[200px]"
              >
                {Object.entries(WATER_BODIES).map(([key, body]) => (
                  <option key={key} value={key} className="bg-slate-900 text-white">
                    {body.name}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>

            <div className="flex gap-2">
              {!isMonitoring ? (
                <button
                  onClick={() => setIsMonitoring(true)}
                  className="px-4 py-2 rounded-xl bg-green-500/20 hover:bg-green-500/40 text-green-400 border border-green-500/30 backdrop-blur-md transition-all font-medium shadow-lg hover:shadow-xl hover:scale-105"
                >
                  Start Monitoring
                </button>
              ) : (
                <button
                  onClick={resetToZero}
                  className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/30 backdrop-blur-md transition-all font-medium shadow-lg hover:shadow-xl hover:scale-105"
                >
                  Stop & Reset
                </button>
              )}
            </div>

            <div className="px-4 py-2 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center gap-2 text-sm font-medium shadow-lg">
              <span className={`w-2.5 h-2.5 rounded-full ${isMonitoring ? (loading ? 'bg-yellow-500' : 'bg-green-500 animate-pulse') : 'bg-slate-500'}`}></span>
              {!isMonitoring ? 'Idle' : loading ? 'Connecting API...' : 'API Connected'}
            </div>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className={`grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 transition-opacity duration-500 ${loading ? 'opacity-50' : 'opacity-100'}`}>
          
          {/* Hero Metric: WQI */}
          <div className={`col-span-1 md:col-span-3 lg:col-span-4 bg-slate-900/60 backdrop-blur-lg border border-white/10 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-8 transition-all duration-300 shadow-xl ${
            data.wqi > 0 ? 'hover:scale-[1.02] hover:shadow-2xl hover:border-white/30 cursor-pointer' : ''
          }`}>
            <div className="flex-1">
              <h2 className="text-lg font-medium text-slate-300 mb-2">Composite Water Quality Index (WQI)</h2>
              <div className="flex items-baseline gap-4">
                <span className="text-6xl md:text-8xl font-bold text-white tracking-tighter">
                  {data.wqi.toFixed(0)}
                </span>
                <span className="text-xl md:text-2xl text-slate-400">/ 100</span>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center p-6 bg-black/40 rounded-full w-40 h-40 border-8 border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
              <CheckCircle className="w-10 h-10 text-green-400 mb-2" />
              <span className="text-green-400 font-bold text-lg uppercase tracking-wider">
                {data.wqi === 0 ? 'Waiting' : data.wqi > 80 ? 'Optimal' : data.wqi > 50 ? 'Fair' : 'Poor'}
              </span>
            </div>
          </div>

          {/* Standard Sensor Grid */}
          <SensorCard 
            title="pH Level" 
            value={data.ph.toFixed(2)} 
            unit="" 
            icon={<Activity className="text-purple-400" />} 
            hasData={data.wqi > 0}
          />
          <SensorCard 
            title="Temperature" 
            value={data.temperature.toFixed(1)} 
            unit="°C" 
            icon={<Thermometer className="text-red-400" />} 
            hasData={data.wqi > 0}
          />
          <SensorCard 
            title="TDS" 
            value={data.tds} 
            unit="ppm" 
            icon={<Droplets className="text-blue-400" />} 
            subtitle="Total Dissolved Solids"
            hasData={data.wqi > 0}
          />
          <SensorCard 
            title="Turbidity" 
            value={data.turbidity.toFixed(2)} 
            unit="NTU" 
            icon={<Waves className="text-cyan-400" />} 
            hasData={data.wqi > 0}
          />
          <SensorCard 
            title="Elec. Conductivity" 
            value={Math.round(data.ec)} 
            unit="µS/cm" 
            icon={<Zap className="text-yellow-400" />} 
            hasData={data.wqi > 0}
          />

          {/* Advanced Analytical Metrics */}
          <SensorCard 
            title="TSS Estimation" 
            value={data.tss.toFixed(1)} 
            unit="mg/L" 
            icon={<Activity className="text-slate-400" />} 
            subtitle="Total Suspended Solids"
            hasData={data.wqi > 0}
          />
          <SensorCard 
            title="DO Saturation" 
            value={data.do.toFixed(1)} 
            unit="mg/L" 
            icon={<Wind className="text-sky-400" />} 
            subtitle="Dissolved Oxygen"
            hasData={data.wqi > 0}
          />
          
          {/* Ammonia Toxicity Risk - Warning Card */}
          <div className={`col-span-1 md:col-span-2 lg:col-span-1 bg-slate-900/60 backdrop-blur-lg rounded-xl p-5 flex flex-col justify-between transition-all duration-300 border ${
            data.wqi > 0 ? 'hover:scale-[1.02] cursor-pointer hover:bg-slate-800/60' : ''
          } ${
            isAmmoniaWarning 
              ? `border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)] ${data.wqi > 0 ? 'hover:shadow-[0_0_30px_rgba(239,68,68,0.6)]' : ''}` 
              : `border-white/10 shadow-lg ${data.wqi > 0 ? 'hover:border-white/30 hover:shadow-xl' : ''}`
          }`}>
            <div className="flex justify-between items-start mb-4">
              <div className="bg-black/40 p-2 rounded-lg">
                <AlertTriangle className={isAmmoniaWarning ? "text-red-500 animate-pulse" : "text-orange-400"} />
              </div>
              {isAmmoniaWarning && (
                <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs font-bold rounded uppercase tracking-wider animate-pulse">
                  Warning
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-300 mb-1">Ammonia Risk</p>
              <div className="flex items-baseline gap-1">
                <h3 className={`text-3xl font-bold ${isAmmoniaWarning ? 'text-red-400' : 'text-white'}`}>
                  {data.ammonia.toFixed(3)}
                </h3>
                <span className="text-sm text-slate-400">% NH3</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">Unionized Ammonia</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

// Reusable component for standard sensor metrics
const SensorCard = ({ 
  title, 
  value, 
  unit, 
  icon, 
  subtitle, 
  status,
  hasData
}: { 
  title: string; 
  value: string | number; 
  unit: string; 
  icon: React.ReactNode; 
  subtitle?: string; 
  status?: string; 
  hasData?: boolean;
}) => {
  return (
    <div className={`bg-slate-900/60 backdrop-blur-lg border border-white/10 rounded-xl p-5 flex flex-col justify-between transition-all duration-300 shadow-lg group ${
      hasData ? 'hover:border-white/30 cursor-pointer hover:scale-[1.02] hover:shadow-xl hover:bg-slate-800/60' : ''
    }`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`bg-black/40 p-2 rounded-lg transition-transform duration-300 ${hasData ? 'group-hover:scale-110' : ''}`}>
          {icon}
        </div>
        {status && (
          <span className="text-xs font-medium text-slate-400 bg-black/40 px-2 py-1 rounded">
            {status}
          </span>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-300 mb-1">{title}</p>
        <div className="flex items-baseline gap-1">
          <h3 className={`text-3xl font-bold text-white transition-colors ${hasData ? 'group-hover:text-blue-100' : ''}`}>{value}</h3>
          {unit && <span className="text-sm text-slate-400">{unit}</span>}
        </div>
        {subtitle && (
          <p className="text-xs text-slate-400 mt-2 truncate">{subtitle}</p>
        )}
      </div>
    </div>
  );
};

export default WaterQualityDashboard;
