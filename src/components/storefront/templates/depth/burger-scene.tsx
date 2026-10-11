"use client";

import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * The 3D template's hero scene (TEMPLATE_ID=2). Loaded only in the browser, only after the capability
 * check in hero-stage.tsx, so it never runs during server rendering and never ships to the 2D template.
 *
 * Default subject: a burger built from primitives (no asset to download). A restaurant can set its own
 * `.glb` on the hero section (`modelUrl`); while it loads, or if it fails (404, CORS, bad file), the
 * built-in burger shows instead. The model floats, turns, leans toward the pointer, squishes when tapped,
 * and its layers fan apart as the page scrolls. Reduced motion renders one still frame.
 */

export interface StageMotion {
  /** pointer position over the window, -1..1 */
  x: number;
  y: number;
  /** 0 at the top of the hero, 1 once it has scrolled away */
  scroll: number;
}

export interface BurgerSceneProps {
  /** restaurant theme colours (hex) */
  brand: string;
  accent: string;
  modelUrl: string | null;
  /** false = prefers-reduced-motion: a single still frame, no loop */
  animate: boolean;
  /** false = scrolled off screen: the render loop stops */
  active: boolean;
  motion: MutableRefObject<StageMotion>;
  onReady: () => void;
  onLost: () => void;
}

export default function BurgerScene({ brand, accent, modelUrl, animate, active, motion, onReady, onLost }: BurgerSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 1.2, 7.3], fov: 34 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      frameloop={!active ? "never" : animate ? "always" : "demand"}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.domElement.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          onLost();
        });
        onReady();
      }}
    >
      <hemisphereLight args={["#fff3df", "#2b160a", 1.1]} />
      <directionalLight position={[3.5, 6, 5]} intensity={2.6} color="#fff1dc" />
      <directionalLight position={[-5, 2.5, -4]} intensity={2.2} color={accent} />
      <pointLight position={[-3.2, -1, 3]} intensity={9} distance={12} color={brand} />

      <Rig animate={animate} motion={motion}>
        <ModelBoundary fallback={<Burger animate={animate} motion={motion} />}>
          <Suspense fallback={<Burger animate={animate} motion={motion} />}>
            {modelUrl ? <GltfModel url={modelUrl} /> : <Burger animate={animate} motion={motion} />}
          </Suspense>
        </ModelBoundary>
      </Rig>
      <Confetti brand={brand} accent={accent} animate={animate} />
      <SoftShadow />
    </Canvas>
  );
}

// ─── motion ────────────────────────────────────────────────────────────────────

function Rig({ animate, motion, children }: { animate: boolean; motion: MutableRefObject<StageMotion>; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const spin = useRef(-0.55);
  const squash = useRef(0);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g || !animate) return;
    const { x, y } = motion.current;
    spin.current += delta * (0.5 + squash.current * 3);
    g.rotation.y = spin.current + x * 0.4;
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, 0.22 - y * 0.2, 4, delta);
    g.rotation.z = THREE.MathUtils.damp(g.rotation.z, -x * 0.1, 4, delta);
    g.position.y = Math.sin(state.clock.elapsedTime * 1.25) * 0.12;
    // tap: squash, then spring back
    squash.current = THREE.MathUtils.damp(squash.current, 0, 5, delta);
    g.scale.set(1 + squash.current * 0.08, 1 - squash.current * 0.16, 1 + squash.current * 0.08);
  });

  return (
    <group
      ref={group}
      rotation={[0.22, -0.55, 0]}
      onPointerDown={() => {
        if (animate) squash.current = 1;
      }}
      onPointerOver={() => (document.body.style.cursor = "grab")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      {children}
    </group>
  );
}

// ─── the built-in burger ───────────────────────────────────────────────────────

/** deterministic noise, so the patty looks the same on every render and server */
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lathe = (points: [number, number][]) => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 72);

/** top bun profile, bottom to top (radius, height) */
const TOP_BUN: [number, number][] = [
  [0.001, -0.03], [1.2, -0.03], [1.38, 0.0], [1.42, 0.09], [1.36, 0.25], [1.21, 0.45], [0.99, 0.63], [0.71, 0.77], [0.36, 0.85], [0.001, 0.87],
];

function topBunHeight(radius: number): number {
  const dome = TOP_BUN.slice(2);
  for (let i = 0; i < dome.length - 1; i += 1) {
    const [r1, y1] = dome[i]!;
    const [r2, y2] = dome[i + 1]!;
    if (radius <= r1 && radius >= r2) return y2 + ((radius - r2) / (r1 - r2)) * (y1 - y2);
  }
  return 0.87;
}

function useBurgerParts() {
  const parts = useMemo(() => {
    const rand = random(7);

    const topBun = lathe(TOP_BUN);
    const bottomBun = lathe([[0.001, 0], [1.2, 0], [1.35, 0.06], [1.41, 0.2], [1.38, 0.36], [1.3, 0.42], [0.001, 0.42]]);

    // a seared smash patty: a disc whose rim and top are pushed about a little, lit with flat shading
    const patty = new THREE.CylinderGeometry(1.46, 1.48, 0.34, 64, 3);
    const p = patty.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const r = Math.hypot(x, z);
      if (r > 0.01) {
        const k = 1 + (rand() - 0.5) * 0.06;
        p.setX(i, x * k);
        p.setZ(i, z * k);
      }
      p.setY(i, p.getY(i) + (rand() - 0.5) * 0.04);
    }
    patty.computeVertexNormals();

    // a cheese slice laid diagonally, its corners melting over the patty
    const cheese = new THREE.PlaneGeometry(2.75, 2.75, 28, 28);
    cheese.rotateX(-Math.PI / 2);
    const c = cheese.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < c.count; i += 1) {
      const r = Math.hypot(c.getX(i), c.getZ(i));
      c.setY(i, -Math.pow(Math.max(0, r - 1.18), 1.6) * 0.95);
    }
    cheese.rotateY(Math.PI / 4);
    cheese.computeVertexNormals();

    // ruffled lettuce: a ring whose outer edge waves up and down
    const lettuce = new THREE.RingGeometry(0.25, 1.66, 120, 5);
    lettuce.rotateX(-Math.PI / 2);
    const l = lettuce.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < l.count; i += 1) {
      const x = l.getX(i);
      const z = l.getZ(i);
      const r = Math.hypot(x, z);
      const edge = Math.pow(r / 1.66, 3);
      l.setY(i, Math.sin(Math.atan2(z, x) * 11) * 0.09 * edge - edge * 0.06);
    }
    lettuce.computeVertexNormals();

    const tomato = new THREE.CylinderGeometry(0.62, 0.62, 0.11, 40);

    // sesame seeds scattered over the dome, each lying along the surface
    const seed = new THREE.SphereGeometry(0.05, 10, 6);
    seed.scale(1, 0.45, 1.9);
    const seeds: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 46; i += 1) {
      const radius = 0.12 + Math.sqrt(rand()) * 1.02;
      const angle = rand() * Math.PI * 2;
      const height = topBunHeight(radius);
      const slope = Math.atan2(topBunHeight(Math.max(radius - 0.05, 0)) - topBunHeight(radius + 0.05), 0.1);
      dummy.position.set(Math.cos(angle) * radius, height + 0.012, Math.sin(angle) * radius);
      dummy.rotation.set(0, -angle + rand() * 1.2, 0);
      dummy.rotateX(slope * 0.8);
      dummy.updateMatrix();
      seeds.push(dummy.matrix.clone());
    }

    return { topBun, bottomBun, patty, cheese, lettuce, tomato, seed, seeds };
  }, []);

  useEffect(
    () => () => {
      for (const geometry of [parts.topBun, parts.bottomBun, parts.patty, parts.cheese, parts.lettuce, parts.tomato, parts.seed]) geometry.dispose();
    },
    [parts],
  );
  return parts;
}

/** stacking order, bottom up: resting height and how far each layer travels when the burger fans apart */
const LAYERS = {
  bottomBun: { y: -1.05, spread: -1.15 },
  patty: { y: -0.44, spread: -0.55 },
  cheese: { y: -0.25, spread: -0.08 },
  tomato: { y: -0.16, spread: 0.32 },
  lettuce: { y: -0.08, spread: 0.68 },
  topBun: { y: -0.02, spread: 1.25 },
} as const;
type Layer = keyof typeof LAYERS;

function Burger({ animate, motion }: { animate: boolean; motion: MutableRefObject<StageMotion> }) {
  const parts = useBurgerParts();
  const refs = useRef<Partial<Record<Layer, THREE.Object3D | null>>>({});
  const seedsRef = useRef<THREE.InstancedMesh>(null);
  const fanned = useRef(0);

  // before the first frame: with reduced motion only one frame is ever drawn
  useLayoutEffect(() => {
    const mesh = seedsRef.current;
    if (!mesh) return;
    parts.seeds.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
  }, [parts]);

  useFrame((_, delta) => {
    if (!animate) return;
    fanned.current = THREE.MathUtils.damp(fanned.current, Math.min(motion.current.scroll, 1), 6, delta);
    for (const layer of Object.keys(LAYERS) as Layer[]) {
      const object = refs.current[layer];
      if (object) object.position.y = LAYERS[layer].y + LAYERS[layer].spread * fanned.current * 0.75;
    }
  });

  const set = (layer: Layer) => (object: THREE.Object3D | null) => {
    refs.current[layer] = object;
  };

  return (
    <group position={[0, 0.08, 0]}>
      <mesh ref={set("bottomBun")} position-y={LAYERS.bottomBun.y} geometry={parts.bottomBun}>
        <meshStandardMaterial color="#d98c3f" roughness={0.62} />
      </mesh>
      <mesh ref={set("patty")} position-y={LAYERS.patty.y} geometry={parts.patty}>
        <meshStandardMaterial color="#4a2614" roughness={0.95} flatShading />
      </mesh>
      <mesh ref={set("cheese")} position-y={LAYERS.cheese.y} geometry={parts.cheese}>
        <meshStandardMaterial color="#ffb21c" roughness={0.42} emissive="#7a3d00" emissiveIntensity={0.12} side={THREE.DoubleSide} />
      </mesh>
      <group ref={set("tomato")} position-y={LAYERS.tomato.y}>
        {[
          [0.58, 0.28, 0.2],
          [-0.6, 0.22, -0.4],
          [0.05, -0.66, 0.9],
        ].map(([x, z, turn]) => (
          <mesh key={`${x}-${z}`} geometry={parts.tomato} position={[x!, 0, z!]} rotation={[0, turn!, 0]}>
            <meshStandardMaterial color="#e5432a" roughness={0.32} />
          </mesh>
        ))}
      </group>
      <mesh ref={set("lettuce")} position-y={LAYERS.lettuce.y} geometry={parts.lettuce}>
        <meshStandardMaterial color="#5cbf3a" roughness={0.68} side={THREE.DoubleSide} />
      </mesh>
      <group ref={set("topBun")} position-y={LAYERS.topBun.y}>
        <mesh geometry={parts.topBun}>
          <meshStandardMaterial color="#e09443" roughness={0.55} />
        </mesh>
        <instancedMesh ref={seedsRef} args={[parts.seed, undefined, parts.seeds.length]}>
          <meshStandardMaterial color="#fff1cf" roughness={0.5} />
        </instancedMesh>
      </group>
    </group>
  );
}

// ─── a restaurant's own model ─────────────────────────────────────────────────

function GltfModel({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url);
  // centred and scaled to the burger's footprint, whatever units the file was authored in
  const object = useMemo(() => {
    const scene = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 2.7 / (Math.max(size.x, size.y, size.z) || 1);
    scene.scale.setScalar(scale);
    scene.position.set(-center.x * scale, -center.y * scale - 0.1, -center.z * scale);
    return scene;
  }, [gltf]);
  return <primitive object={object} />;
}

class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.warn("[3D hero] the configured model could not be loaded; showing the built-in burger.", error);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// ─── atmosphere ───────────────────────────────────────────────────────────────

/** brand-coloured crumbs orbiting the burger */
function Confetti({ brand, accent, animate }: { brand: string; accent: string; animate: boolean }) {
  const count = 26;
  const brandRef = useRef<THREE.InstancedMesh>(null);
  const accentRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(0.06, 0), []);
  const orbits = useMemo(() => {
    const rand = random(21);
    return Array.from({ length: count }, () => ({
      radius: 2.05 + rand() * 0.75,
      height: (rand() - 0.5) * 2.4,
      speed: 0.15 + rand() * 0.25,
      phase: rand() * Math.PI * 2,
      size: 0.6 + rand() * 0.9,
    }));
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const t = animate ? state.clock.elapsedTime : 0;
    orbits.forEach((orbit, index) => {
      const angle = orbit.phase + t * orbit.speed;
      dummy.position.set(Math.cos(angle) * orbit.radius, orbit.height + Math.sin(t * 0.8 + orbit.phase) * 0.15, Math.sin(angle) * orbit.radius);
      dummy.rotation.set(t + index, t * 0.7, 0);
      dummy.scale.setScalar(orbit.size);
      dummy.updateMatrix();
      const mesh = index % 2 ? accentRef.current : brandRef.current;
      mesh?.setMatrixAt(Math.floor(index / 2), dummy.matrix);
    });
    if (brandRef.current) brandRef.current.instanceMatrix.needsUpdate = true;
    if (accentRef.current) accentRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={brandRef} args={[geometry, undefined, count / 2]}>
        <meshStandardMaterial color={brand} roughness={0.4} emissive={brand} emissiveIntensity={0.35} />
      </instancedMesh>
      <instancedMesh ref={accentRef} args={[geometry, undefined, count / 2]}>
        <meshStandardMaterial color={accent} roughness={0.4} emissive={accent} emissiveIntensity={0.35} />
      </instancedMesh>
    </>
  );
}

/** a soft round shadow under the burger (a radial-gradient texture: no shadow maps to compute) */
function SoftShadow() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d")!;
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(0,0,0,0.55)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-1.55} scale={[3.6, 3.6, 1]}>
      <planeGeometry />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}
