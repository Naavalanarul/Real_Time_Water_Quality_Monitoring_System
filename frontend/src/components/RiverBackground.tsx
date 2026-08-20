// ─── 3D Realistic Water Background ───────────────────────────────────────────
// Fullscreen animated water surface using custom GLSL shaders with:
//   • Simplex-noise FBM vertex displacement (actual 3D waves)
//   • Finite-difference per-pixel normal recomputation (surface ripples)
//   • Blinn-Phong specular + diffuse lighting
//   • Schlick Fresnel reflections
//   • Subsurface scattering approximation
//   • Foam highlights on wave crests
//   • Distance fog blending into the dark background
//
// Sits at z-index 0 behind the dashboard UI.

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────────────────────
// GLSL: Shared Simplex 3D noise (Ashima Arts — MIT licence)
// Included in both vertex and fragment shaders via a template literal.
// ─────────────────────────────────────────────────────────────────────────────

const NOISE_GLSL = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g  = step(x0.yzx, x0.xyz);
    vec3 l  = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;  p1 *= norm.y;  p2 *= norm.z;  p3 *= norm.w;

    vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  // ── Fractal Brownian Motion (5 octaves) ──────────────────────────────────
  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 5; i++) {
      value += amplitude * snoise(p * frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// GLSL: Vertex Shader — wave displacement via FBM
// ─────────────────────────────────────────────────────────────────────────────

const vertexShader = /* glsl */ `
  uniform float uTime;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUv;
  varying float vDisplacement;

  ${NOISE_GLSL}

  // ── Height function (shared with normal computation) ────────────────────
  float getHeight(vec2 p) {
    // Primary ocean swell — large, slow-moving
    float h = fbm(vec3(p * 0.12, uTime * 0.06)) * 1.6;

    // Secondary cross-wave — medium frequency, slightly faster
    h += fbm(vec3(p.x * 0.25 + uTime * 0.02,
                  p.y * 0.3,
                  uTime * 0.09)) * 0.5;

    // Tertiary ripple detail
    h += snoise(vec3(p * 0.8, uTime * 0.18)) * 0.15;

    // Fine capillary waves
    h += snoise(vec3(p * 2.5, uTime * 0.35)) * 0.04;

    return h;
  }

  void main() {
    vUv = uv;

    // Start with the flat plane position (XY local → XZ world after rotation)
    vec3 pos = position;

    // Displace along local Z (becomes world Y after the -90° X rotation)
    float h = getHeight(pos.xy);
    pos.z += h;
    vDisplacement = h;

    // ── Compute analytical normal via finite differences ──────────────────
    float eps = 0.15;
    float hR = getHeight(pos.xy + vec2(eps, 0.0));
    float hU = getHeight(pos.xy + vec2(0.0, eps));
    // Tangent vectors on the displaced surface
    vec3 tangentX = vec3(eps, 0.0, hR - h);
    vec3 tangentY = vec3(0.0, eps, hU - h);
    vec3 localNormal = normalize(cross(tangentX, tangentY));

    vNormal = normalize(normalMatrix * localNormal);
    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// GLSL: Fragment Shader — physically-based water shading
// ─────────────────────────────────────────────────────────────────────────────

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform vec3  uLightColor;
  uniform vec3  uCameraPos;
  uniform vec3  uDeepColor;
  uniform vec3  uSurfaceColor;
  uniform vec3  uFoamColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3  uFogColor;

  varying vec3  vWorldPos;
  varying vec3  vNormal;
  varying vec2  vUv;
  varying float vDisplacement;

  ${NOISE_GLSL}

  void main() {
    vec3 N = normalize(vNormal);

    // ── Micro-ripple normal perturbation (fine surface detail) ────────────
    float ripple1 = snoise(vec3(vWorldPos.xz * 3.0, uTime * 0.15)) * 0.025;
    float ripple2 = snoise(vec3(vWorldPos.xz * 5.0 + 50.0, uTime * 0.2)) * 0.015;
    float ripple3 = snoise(vec3(vWorldPos.xz * 10.0 + 100.0, uTime * 0.35)) * 0.008;
    N = normalize(N + vec3(ripple1 + ripple3, 0.0, ripple2 + ripple3));

    // ── Directions ───────────────────────────────────────────────────────
    vec3 V = normalize(uCameraPos - vWorldPos);   // view
    vec3 L = normalize(uLightDir);                 // light (directional)
    vec3 H = normalize(V + L);                     // half-vector

    // ── Fresnel (Schlick, F0 = 0.02 for water) ──────────────────────────
    float cosTheta = max(dot(N, V), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - cosTheta, 5.0);

    // ── Diffuse (Lambert) ────────────────────────────────────────────────
    float NdotL = max(dot(N, L), 0.0);
    float diffuse = NdotL * 0.45;

    // ── Specular (Blinn-Phong, high exponent for wet surface) ────────────
    float NdotH = max(dot(N, H), 0.0);
    float specular = pow(NdotH, 512.0) * 2.5;
    // Secondary, broader highlight
    float specBroad = pow(NdotH, 64.0) * 0.3;

    // ── Water body colour ────────────────────────────────────────────────
    // Blend deep → surface based on Fresnel (glancing = lighter/reflective)
    vec3 waterBody = mix(uDeepColor, uSurfaceColor, fresnel * 0.55);

    // Subtle depth variation from displacement
    float depthTint = smoothstep(-0.5, 1.5, vDisplacement);
    waterBody = mix(waterBody * 0.8, waterBody * 1.2, depthTint * 0.3);

    // ── Foam on wave crests ──────────────────────────────────────────────
    float foamMask = smoothstep(0.9, 1.6, vDisplacement);
    // Add noise breakup so foam isn't uniform
    float foamNoise = snoise(vec3(vWorldPos.xz * 4.0, uTime * 0.1));
    foamMask *= smoothstep(0.0, 0.5, foamNoise);
    waterBody = mix(waterBody, uFoamColor, foamMask * 0.25);

    // ── Subsurface Scattering approximation ──────────────────────────────
    // Light transmitting through the wave body when the viewer looks
    // roughly toward the light through thin wave edges.
    float sss = pow(max(dot(V, -L), 0.0), 4.0) * 0.12;
    sss += pow(max(dot(V, -L), 0.0), 16.0) * 0.06;
    vec3 sssColor = vec3(0.0, 0.25, 0.3) * sss;

    // ── Environment reflection approximation ─────────────────────────────
    // Fake sky / environment colour reflected on the surface
    vec3 reflectDir = reflect(-V, N);
    float reflectY = reflectDir.y * 0.5 + 0.5;
    vec3 envColor = mix(
      vec3(0.005, 0.02, 0.05),    // horizon — dark
      vec3(0.02, 0.06, 0.12),     // zenith — slightly lighter
      reflectY
    );
    vec3 reflection = envColor * fresnel * 0.6;

    // ── Compose final colour ─────────────────────────────────────────────
    vec3 ambient = waterBody * 0.25;
    vec3 color = ambient
               + waterBody * diffuse
               + uLightColor * (specular + specBroad)
               + reflection
               + sssColor;

    // ── Distance fog (blend into dark background at edges) ───────────────
    float dist = length(vWorldPos - uCameraPos);
    float fogFactor = smoothstep(uFogNear, uFogFar, dist);
    color = mix(color, uFogColor, fogFactor);

    // ── Reinhard tone mapping ────────────────────────────────────────────
    color = color / (color + 1.0);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// React Component: Displaced Water Plane
// ─────────────────────────────────────────────────────────────────────────────

function WaterSurface() {
  const meshRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(
    () => ({
      uTime:         { value: 0 },
      uLightDir:     { value: new THREE.Vector3(3, 8, 4).normalize() },
      uLightColor:   { value: new THREE.Color("#b0d8f0") },
      uCameraPos:    { value: new THREE.Vector3() },
      uDeepColor:    { value: new THREE.Color("#001520") },
      uSurfaceColor: { value: new THREE.Color("#06404e") },
      uFoamColor:    { value: new THREE.Color("#8ec8d8") },
      uFogNear:      { value: 12.0 },
      uFogFar:       { value: 30.0 },
      uFogColor:     { value: new THREE.Color("#000a14") },
    }),
    []
  );

  useFrame(({ clock, camera }) => {
    uniforms.uTime.value = clock.getElapsedTime();
    uniforms.uCameraPos.value.copy(camera.position);
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2.3, 0, 0]}
      position={[0, -2, -4]}
    >
      {/* High-poly plane for smooth wave displacement */}
      <planeGeometry args={[60, 60, 200, 200]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.FrontSide}
        depthWrite={true}
      />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported Canvas Wrapper
// ─────────────────────────────────────────────────────────────────────────────

export default function RiverBackground() {
  return (
    <div className="fixed inset-0 z-0">
      <Canvas
        camera={{ position: [0, 4.5, 9], fov: 55, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        style={{ width: "100%", height: "100%" }}
      >
        {/* Dark background to match the page theme */}
        <color attach="background" args={["#000a14"]} />

        {/* Ambient fill so the water is never fully black */}
        <ambientLight intensity={0.08} color="#1a3a4a" />

        {/* Primary directional light — creates the main specular highlights */}
        <directionalLight
          position={[5, 10, 5]}
          intensity={0.6}
          color="#a0c8e0"
        />

        {/* Secondary rim light from behind for edge definition */}
        <directionalLight
          position={[-4, 6, -8]}
          intensity={0.25}
          color="#1a4a6e"
        />

        <WaterSurface />
      </Canvas>

      {/* Dark gradient overlay for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#000a14]/50 to-[#000a14]" />
    </div>
  );
}
