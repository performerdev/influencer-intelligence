"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { gsap } from "gsap";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
// three's own RoundedBoxGeometry: drei's barrel import drags in hls.js + mediapipe (~700 kB)
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { DOT_Y, LOGO_HEIGHT, LOGO_WIDTH, STEM_Y, logo, sampleISurface } from "@/lib/logo-geometry";
import { gaussian, rng } from "@/lib/random";
import { SIGNATURE_MAX_POINTS, SIGNATURE_TILT, advanceSignatureAngle, signaturePoints } from "@/lib/signature";
import { color, heroTimeline, particle } from "@/lib/tokens";

import { heroStore, markHeroReady } from "./hero-store";
import { CLUSTERS, particleFragment, particleVertex } from "./particle-shader";

const CAMERA_Z = 30;
const FOV = 30;
const POINTS = CLUSTERS * SIGNATURE_MAX_POINTS; // 18,000
/** blob radius as a fraction of the card's signature box (must match ParticleSignature) */
export const SIGNATURE_RADIUS_FRAC = 0.36;

/** Screen ↔ world mapping for the z = 0 plane, refreshed on resize. */
type Fit = {
  vw: number;
  vh: number;
  wpp: number; // world units per css px
  scale: number;
  pos: THREE.Vector3;
};

function pxToWorld(fit: Fit, x: number, y: number, out: THREE.Vector3) {
  return out.set((x - fit.vw / 2) * fit.wpp, -(y - fit.vh / 2) * fit.wpp, 0);
}

function measureFit(vw: number, vh: number): Fit {
  const worldH = 2 * CAMERA_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const wpp = worldH / vh;
  const fit: Fit = { vw, vh, wpp, scale: 1, pos: new THREE.Vector3() };
  const el = heroStore.logoSlot;
  if (!el) return fit;
  const r = el.getBoundingClientRect();
  // The logo is pinned: measure the slot as it sits at scrollY = 0.
  const top = r.top + window.scrollY;
  fit.scale = Math.min((r.width * wpp) / LOGO_WIDTH, (r.height * wpp) / LOGO_HEIGHT) * 0.94;
  pxToWorld(fit, r.left + r.width / 2, top + r.height / 2, fit.pos);
  return fit;
}

/* ───────────────────────────── scene ───────────────────────────── */

export default function HeroScene({ handles }: { handles: string[] }) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      flat
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: FOV, position: [0, 0, CAMERA_Z], near: 1, far: 80 }}
      // R3F sets pointer-events:auto on its wrapper by default; the canvas must never block the page
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      aria-hidden
    >
      <Rig handles={handles} />
    </Canvas>
  );
}

function Rig({ handles }: { handles: string[] }) {
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<THREE.Group>(null);
  const fit = useRef<Fit>(measureFit(size.width, size.height));

  // Re-fit on resize; publish where the dot will appear for the preloader.
  useEffect(() => {
    const f = measureFit(size.width, size.height);
    fit.current = f;
    const risePx = heroTimeline.riseDistancePx;
    heroStore.dotScreen = {
      x: f.vw / 2 + (f.pos.x + logo.leftX * f.scale) / f.wpp,
      y: f.vh / 2 - (f.pos.y + DOT_Y * f.scale) / f.wpp + risePx,
      r: (logo.dot.r * f.scale) / f.wpp,
    };
    invalidate();
    if (!heroStore.ready) requestAnimationFrame(() => markHeroReady());
  }, [size.width, size.height, invalidate]);

  // Render on demand: only while something is moving.
  useEffect(() => {
    const tick = () => {
      if (!heroStore.reducedMotion && heroStore.scatter < 0.999) invalidate();
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [invalidate]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const f = fit.current;
    const sc = heroStore.scatter;
    g.position.copy(f.pos);
    g.scale.setScalar(f.scale);
    g.rotation.x = heroStore.tilt.x * (1 - sc);
    g.rotation.y = heroStore.tilt.y * (1 - sc);
  });

  return (
    <>
      <ambientLight intensity={0.95} color={color.ceramic} />
      {/* one soft key light from the upper left */}
      <directionalLight position={[-7, 9, 12]} intensity={2.6} color="#ffffff" />
      <directionalLight position={[8, -2, 6]} intensity={0.35} color={color.ceramic} />
      <group ref={group}>
        <SolidI fit={fit} />
        <ParticleI fit={fit} handles={handles} />
      </group>
    </>
  );
}

/* ─────────────────────────── solid "i" ─────────────────────────── */

function useGrainTexture() {
  return useMemo(() => {
    const n = 256;
    const data = new Uint8Array(n * n * 4);
    const r = rng(7);
    for (let i = 0; i < n * n; i++) {
      const v = 110 + r() * 145;
      data.set([v, v, v, 255], i * 4);
    }
    const tex = new THREE.DataTexture(data, n, n);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 5);
    tex.needsUpdate = true;
    return tex;
  }, []);
}

function SolidI({ fit }: { fit: React.RefObject<Fit> }) {
  const grain = useGrainTexture();
  const stemGeometry = useMemo(
    () => new RoundedBoxGeometry(logo.stem.w, logo.stem.h, logo.stem.d, 10, logo.stem.r),
    [],
  );
  useEffect(() => () => stemGeometry.dispose(), [stemGeometry]);
  const group = useRef<THREE.Group>(null);
  const stemMat = useRef<THREE.MeshStandardMaterial>(null);
  const dotMat = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(() => {
    const f = fit.current;
    const g = group.current;
    if (!g || !f) return;
    const sc = heroStore.scatter;
    const away = 1 - THREE.MathUtils.smoothstep(sc, 0, 0.45);
    // rise 12px into place, then on scroll fade back and stay behind
    g.position.y = (-heroStore.rise * heroTimeline.riseDistancePx * f.wpp) / f.scale;
    g.position.z = -sc * 2.5;
    for (const [m, o] of [
      [stemMat.current, heroStore.stem * away],
      [dotMat.current, heroStore.dot * away],
    ] as const) {
      if (!m) continue;
      m.opacity = o;
      const t = o < 0.999;
      if (m.transparent !== t) {
        m.transparent = t;
        m.needsUpdate = true;
      }
      m.visible = o > 0.001;
    }
  });

  const material = {
    color: color.ceramic,
    roughness: 0.94,
    metalness: 0,
    bumpMap: grain,
    bumpScale: 0.1,
  } as const;

  return (
    <group ref={group}>
      <mesh geometry={stemGeometry} position={[logo.leftX, STEM_Y, 0]}>
        <meshStandardMaterial ref={stemMat} {...material} transparent opacity={0} />
      </mesh>
      <mesh position={[logo.leftX, DOT_Y, 0]}>
        <sphereGeometry args={[logo.dot.r, 96, 64]} />
        <meshStandardMaterial ref={dotMat} {...material} transparent opacity={0} />
      </mesh>
    </group>
  );
}

/* ────────────────────────── particle "i" ────────────────────────── */

function buildParticles(handles: string[]) {
  const r = rng(0x1111);
  const { positions, normals } = sampleISurface(POINTS, logo.rightX, r);
  const source = new Float32Array(POINTS * 3);
  const rand = new Float32Array(POINTS * 4);
  const cluster = new Float32Array(POINTS);
  const localIndex = new Float32Array(POINTS);
  const local = new Float32Array(POINTS * 3);
  const shift = logo.rightX - logo.leftX;
  const bottom = -LOGO_HEIGHT / 2;

  for (let i = 0; i < POINTS; i++) {
    const i3 = i * 3;
    // Fuzz along the normal: most points hug the skin, a few stray out — the
    // logo's frayed silhouette.
    const fuzz = r() < 0.05 ? 0.03 + r() * 0.12 : (r() - 0.35) * 0.035;
    for (let a = 0; a < 3; a++) positions[i3 + a] += normals[i3 + a] * fuzz;
    // Each point starts just inside the matching spot of the solid "i".
    source[i3] = positions[i3] - shift - normals[i3] * 0.08;
    source[i3 + 1] = positions[i3 + 1] - normals[i3 + 1] * 0.08;
    source[i3 + 2] = positions[i3 + 2] - normals[i3 + 2] * 0.08;
    const h = (positions[i3 + 1] - bottom) / LOGO_HEIGHT;
    rand[i * 4] = r() < 0.04 ? 1.5 + r() * 0.5 : 0.65 + r() * 0.6; // size
    rand[i * 4 + 1] = Math.min(1, Math.max(0, (1 - h) * 0.86 + r() * 0.14)); // top first
    rand[i * 4 + 2] = r(); // arc
  }

  // Slice the "i" top-to-bottom into 10 equal clusters with ragged edges:
  // the top slice lands on ii-01, the bottom on ii-10.
  const order = Array.from({ length: POINTS }, (_, i) => i);
  const key = new Float32Array(POINTS);
  for (let i = 0; i < POINTS; i++) key[i] = positions[i * 3 + 1] + gaussian(r) * 0.22;
  order.sort((a, b) => key[b] - key[a]);
  order.forEach((idx, rank) => {
    const k = Math.min(CLUSTERS - 1, Math.floor(rank / SIGNATURE_MAX_POINTS));
    const j = rank - k * SIGNATURE_MAX_POINTS;
    cluster[idx] = k;
    localIndex[idx] = j;
    const sig = signaturePoints(handles[k] ?? `cluster-${k}`);
    local.set(sig.subarray(j * 3, j * 3 + 3), idx * 3);
    rand[idx * 4 + 3] = (k / (CLUSTERS - 1)) * 0.7 + r() * 0.3; // scatter delay: cluster order + a little spread
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aNormal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("aSource", new THREE.BufferAttribute(source, 3));
  geo.setAttribute("aRand", new THREE.BufferAttribute(rand, 4));
  geo.setAttribute("aCluster", new THREE.BufferAttribute(cluster, 1));
  geo.setAttribute("aLocalIndex", new THREE.BufferAttribute(localIndex, 1));
  geo.setAttribute("aLocal", new THREE.BufferAttribute(local, 3));
  const offset = new THREE.BufferAttribute(new Float32Array(POINTS * 3), 3);
  offset.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aOffset", offset);
  // never cull: points travel far outside their rest bounds
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return geo;
}

function ParticleI({ fit, handles }: { fit: React.RefObject<Fit>; handles: string[] }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => buildParticles(handles), [handles]);
  const velocity = useMemo(() => new Float32Array(POINTS * 3), []);
  const springState = useRef({ live: false });

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: particleVertex,
        fragmentShader: particleFragment,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        uniforms: {
          uTime: { value: 0 },
          uCopy: { value: 0 },
          uScatter: { value: 0 },
          uBreath: { value: 0 },
          uHeight: { value: LOGO_HEIGHT },
          uSize: { value: 1.55 },
          uSigSize: { value: 1.5 },
          uDpr: { value: 1 },
          uOpacity: { value: 1 },
          uCamLocal: { value: new THREE.Vector3() },
          uSlots: { value: Array.from({ length: CLUSTERS }, () => new THREE.Vector3(0, -50, 0)) },
          uSlotR: { value: new Array(CLUSTERS).fill(0.3) },
          uAngles: { value: new Array(CLUSTERS).fill(0) },
          uDensity: { value: new Array(CLUSTERS).fill(SIGNATURE_MAX_POINTS) },
          uTilt: { value: SIGNATURE_TILT },
        },
      }),
    [],
  );

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  const tmp = useMemo(() => ({ v: new THREE.Vector3(), c: new THREE.Vector3() }), []);

  useFrame((state, delta) => {
    const p = points.current;
    const f = fit.current;
    if (!p || !f) return;
    const u = material.uniforms;
    const now = performance.now() / 1000;
    u.uTime.value = state.clock.elapsedTime;
    u.uCopy.value = heroStore.copy;
    u.uScatter.value = heroStore.scatter;
    u.uBreath.value = heroStore.breath;
    u.uDpr.value = gl.getPixelRatio();
    p.parent!.updateMatrixWorld();
    u.uCamLocal.value.copy(camera.position);
    p.worldToLocal(u.uCamLocal.value);

    // Card slots → local space (only while the scatter is in play).
    if (heroStore.scatter > 0) {
      heroStore.slots.forEach((slot, k) => {
        if (!slot || k >= CLUSTERS) return;
        const r = slot.el.getBoundingClientRect();
        pxToWorld(f, r.left + r.width / 2, r.top + r.height / 2, tmp.v);
        u.uSlots.value[k].copy(tmp.v.sub(f.pos).divideScalar(f.scale));
        u.uSlotR.value[k] = (r.width * SIGNATURE_RADIUS_FRAC * f.wpp) / f.scale;
        u.uAngles.value[k] = advanceSignatureAngle(slot.handle, slot.speed, now);
        u.uDensity.value[k] = slot.density;
      });
    }

    stepRepel(delta);
  });

  /** Cursor repel with a damped spring back (CPU, ~18k points, < 0.3 ms). */
  function stepRepel(delta: number) {
    const f = fit.current;
    const s = springState.current;
    const attr = geometry.getAttribute("aOffset") as THREE.BufferAttribute;
    const off = attr.array as Float32Array;
    const pos = (geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    const enabled = heroStore.repel > 0 && heroStore.scatter < 0.02 && !!heroStore.pointer && !!f;
    if (!enabled && !s.live) return;

    const dt = Math.min(delta, 1 / 20) * 60;
    const radius = f ? (particle.repelRadiusPx * f.wpp) / f.scale : 0;
    let cx = 0;
    let cy = 0;
    if (enabled && f && heroStore.pointer) {
      pxToWorld(f, heroStore.pointer.x, heroStore.pointer.y, tmp.c);
      cx = (tmp.c.x - f.pos.x) / f.scale;
      cy = (tmp.c.y - f.pos.y) / f.scale;
    }
    const keep = Math.pow(1 - particle.springDamping, dt);
    // equilibrium displacement ≈ push / k ≈ 0.35 × radius: a soft dent, not a hole
    const k = 0.04;
    const push = radius * 0.014;
    let live = false;
    for (let i = 0; i < POINTS; i++) {
      const i3 = i * 3;
      let ax = -off[i3] * k;
      let ay = -off[i3 + 1] * k;
      const az = -off[i3 + 2] * k;
      if (enabled) {
        const dx = pos[i3] + off[i3] - cx;
        const dy = pos[i3 + 1] + off[i3 + 1] - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < radius * radius && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const fall = 1 - d / radius;
          const fz = fall * fall * push;
          ax += (dx / d) * fz;
          ay += (dy / d) * fz;
        }
      }
      velocity[i3] = (velocity[i3] + ax * dt) * keep;
      velocity[i3 + 1] = (velocity[i3 + 1] + ay * dt) * keep;
      velocity[i3 + 2] = (velocity[i3 + 2] + az * dt) * keep;
      off[i3] += velocity[i3] * dt;
      off[i3 + 1] += velocity[i3 + 1] * dt;
      off[i3 + 2] += velocity[i3 + 2] * dt;
      if (!live && (Math.abs(off[i3]) > 1e-4 || Math.abs(off[i3 + 1]) > 1e-4)) live = true;
    }
    s.live = live;
    attr.needsUpdate = true;
  }

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} />;
}
