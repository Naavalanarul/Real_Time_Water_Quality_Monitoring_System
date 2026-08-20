// ─── BackgroundCanvas.tsx — Scene Wrapper (Light Theme) ──────────────────────

import { Canvas } from "@react-three/fiber";
import RiverMesh from "./RiverMesh";

export default function BackgroundCanvas() {
  return (
    <Canvas
      className="absolute inset-0 w-full h-full -z-10 bg-[#c4dcf0]"
      camera={{
        position: [0, 5, 12],
        fov: 45,
        near: 0.1,
        far: 1000,
      }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1.5} />
      <RiverMesh />
    </Canvas>
  );
}
