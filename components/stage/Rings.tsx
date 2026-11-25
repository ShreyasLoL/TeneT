'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  FloatType,
  GLSL3,
  InstancedBufferAttribute,
  type InstancedMesh,
  MathUtils,
  Matrix4,
  NearestFilter,
  Plane,
  Ray,
  RGBAFormat,
  type ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
} from 'three';
import { useTenetState } from '@/lib/api/hooks';
import { type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { inscription } from '@/lib/viz/inscribe';
import { hexToRgbNormalized, readPalette } from '@/lib/viz/palette';
import { pickRingPolar } from '@/lib/viz/pickRing';
import { ringLayout } from '@/lib/viz/ringLayout';
import { ringsFragmentShader, ringsVertexShader } from './shaders/rings';

const MAX_INSTANCES = 400;
const TEX_WIDTH = 16;
const TEX_HEIGHT = 512;

const pickRay = new Ray();
const pickPlane = new Plane(new Vector3(0, 1, 0), 0);
const pickHit = new Vector3();
const pickNdc = new Vector2();

function createUnitAnnulusGeometry(radialSegments = 128): BufferGeometry {
  const geom = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= radialSegments; i++) {
    const theta = (i / radialSegments) * Math.PI * 2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    // Inner radius 0.9, outer radius 1.1 -> shader maps (len - 1.0) * 10 to [-1, +1]
    positions.push(c * 0.9, 0, s * 0.9);
    positions.push(c * 1.1, 0, s * 1.1);
  }

  for (let i = 0; i < radialSegments; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  geom.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.boundingSphere = new Sphere(new Vector3(0, 0, 0), 16);
  return geom;
}

export function Rings() {
  const { camera, gl } = useThree();
  const { data: state } = useTenetState();
  const mode = useTenetStore((s) => s.mode);
  const level = useTenetStore((s) => s.quality.level) as QualityLevel;
  const cursor = useTenetStore((s) => s.cursor);
  const selection = useTenetStore((s) => s.selection);
  const select = useTenetStore((s) => s.select);
  const setCursor = useTenetStore((s) => s.setCursor);

  const meshRef = useRef<InstancedMesh | null>(null);
  const matRef = useRef<ShaderMaterial | null>(null);

  const sealedDays = state?.days;
  const stateRange = state?.range;

  const rings = useMemo(() => {
    if (!sealedDays || !stateRange) return [];
    return ringLayout(sealedDays, stateRange, { maxRings: MAX_INSTANCES });
  }, [sealedDays, stateRange]);

  const dayIndexMap = useMemo(
    () => new Map(rings.map((r, idx) => [r.day, idx] as const)),
    [rings],
  );

  const segmentTex = useMemo(() => {
    const buf = new Float32Array(TEX_WIDTH * TEX_HEIGHT * 4);
    const tex = new DataTexture(buf, TEX_WIDTH, TEX_HEIGHT, RGBAFormat, FloatType);
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }, []);
  const segmentTexRef = useRef(segmentTex);

  // 2-level radial segment LOD: 128 segments on high tiers (L0/L1), 64 segments on lower tiers (L2+)
  const radialSegments = level <= 1 ? 128 : 64;

  const geometry = useMemo(() => {
    const g = createUnitAnnulusGeometry(radialSegments);
    g.setAttribute('aRadius', new InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1));
    g.setAttribute('aThickness', new InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1));
    g.setAttribute('aRingIndex', new InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1));
    g.setAttribute('aLuminance', new InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1));
    g.setAttribute('aIsVoid', new InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1));
    g.setAttribute('aInStreak', new InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1));
    g.setAttribute('aSegCount', new InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1));
    return g;
  }, [radialSegments]);

  const uniforms = useMemo(() => {
    const pal = readPalette();
    const [abr, abg, abb] = hexToRgbNormalized(pal.accentAbyss);
    const [ar, ag, ab] = hexToRgbNormalized(pal.accent);
    const [hr, hg, hb] = hexToRgbNormalized(pal.accentHot);
    const [dr, dg, db] = hexToRgbNormalized(pal.textDim);
    return {
      uSegmentTex: { value: segmentTex },
      uCursorIndex: { value: 0 },
      uRingShift: { value: 0 },
      uSelectedIndex: { value: -1 },
      uOrchidAbyss: { value: new Vector3(abr, abg, abb) },
      uOrchid: { value: new Vector3(ar, ag, ab) },
      uOrchidHot: { value: new Vector3(hr, hg, hb) },
      uTextDim: { value: new Vector3(dr, dg, db) },
    };
  }, [segmentTex]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useEffect(() => {
    const tex = segmentTexRef.current;
    return () => {
      tex.dispose();
    };
  }, []);

  useEffect(() => {
    const geom = geometry;
    const tex = segmentTexRef.current;
    const mesh = meshRef.current;
    if (!mesh) return;

    const aRadius = geom.getAttribute('aRadius') as InstancedBufferAttribute;
    const aThickness = geom.getAttribute('aThickness') as InstancedBufferAttribute;
    const aRingIndex = geom.getAttribute('aRingIndex') as InstancedBufferAttribute;
    const aLuminance = geom.getAttribute('aLuminance') as InstancedBufferAttribute;
    const aIsVoid = geom.getAttribute('aIsVoid') as InstancedBufferAttribute;
    const aInStreak = geom.getAttribute('aInStreak') as InstancedBufferAttribute;
    const aSegCount = geom.getAttribute('aSegCount') as InstancedBufferAttribute;

    const data = tex.image.data as Float32Array;
    const identity = new Matrix4();

    const count = Math.min(MAX_INSTANCES, rings.length);
    for (let i = 0; i < count; i++) {
      const r = rings[i];
      mesh.setMatrixAt(i, identity);
      aRadius.setX(i, r.radius);
      aThickness.setX(i, r.thickness);
      aRingIndex.setX(i, r.i);
      aLuminance.setX(i, r.luminance);
      aIsVoid.setX(i, r.isVoid ? 1 : 0);
      aInStreak.setX(i, r.inStreak ? 1 : 0);
      aSegCount.setX(i, Math.min(15, r.segments.length));

      const notches = inscription(r.reflection);
      for (let s = 0; s < TEX_WIDTH; s++) {
        const px = (i * TEX_WIDTH + s) * 4;
        const seg = r.segments[s];
        if (seg) {
          data[px] = seg.start;
          data[px + 1] = seg.end;
          data[px + 2] =
            seg.status === 'off'
              ? 3
              : seg.satisfied
                ? 1
                : seg.status === 'optional'
                  ? 2
                  : 0;
        } else {
          data[px] = 0;
          data[px + 1] = 0;
          data[px + 2] = 0;
        }
        // Pack average of 8 notches into each of the 16 texels
        let notchAvg = 0;
        for (let k = 0; k < 8; k++) notchAvg += notches[s * 8 + k];
        data[px + 3] = notchAvg / (8 * 255);
      }
    }

    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    aRadius.needsUpdate = true;
    aThickness.needsUpdate = true;
    aRingIndex.needsUpdate = true;
    aLuminance.needsUpdate = true;
    aIsVoid.needsUpdate = true;
    aInStreak.needsUpdate = true;
    aSegCount.needsUpdate = true;
    tex.needsUpdate = true;
  }, [geometry, rings]);

  // Disk-plane polar picking on window clicks when on orbit/time modes (ignoring interactive UI targets)
  useEffect(() => {
    const dom = gl.domElement;
    const onPointerDown = (e: PointerEvent) => {
      if (mode !== 'orbit' && mode !== 'time' && mode !== 'week') return;
      if (rings.length === 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select, [role="button"], [role="slider"], [role="dialog"]')) {
        return;
      }

      const rect = dom.getBoundingClientRect();
      pickNdc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      pickRay.origin.copy(camera.position);
      pickRay.direction.set(pickNdc.x, pickNdc.y, 0.5).unproject(camera).sub(camera.position).normalize();

      if (pickRay.intersectPlane(pickPlane, pickHit)) {
        const r = Math.hypot(pickHit.x, pickHit.z);
        const theta = Math.atan2(pickHit.z, pickHit.x);
        const picked = pickRingPolar(r, theta, rings);
        if (picked) {
          select(
            picked.segment
              ? { kind: 'segment', day: picked.ring.day, key: picked.segment.key }
              : { kind: 'ring', day: picked.ring.day },
          );
          if (mode === 'time') setCursor(picked.ring.day);
        }
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [camera, gl.domElement, mode, rings, select, setCursor]);

  useFrame((_state, delta) => {
    if (meshRef.current) {
      meshRef.current.visible = mode !== 'fork' && rig.introProgress > 0.72;
    }
    const mat = matRef.current;
    if (!mat) return;
    const dt = Math.min(delta, 1 / 20);
    const targetIdx = mode === 'time' ? (dayIndexMap.get(cursor) ?? 0) : 0;

    rig.cursorIndex = MathUtils.damp(rig.cursorIndex, targetIdx, 7.5, dt);
    mat.uniforms.uCursorIndex.value = rig.cursorIndex;
    mat.uniforms.uRingShift.value = rig.ringShift;

    const selIdx =
      selection && (selection.kind === 'ring' || selection.kind === 'segment')
        ? (dayIndexMap.get(selection.day) ?? -1)
        : -1;
    mat.uniforms.uSelectedIndex.value = selIdx;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, MAX_INSTANCES]}
      visible={false}
    >
      <shaderMaterial
        ref={matRef}
        glslVersion={GLSL3}
        transparent
        depthWrite={false}
        side={DoubleSide}
        uniforms={uniforms}
        vertexShader={ringsVertexShader}
        fragmentShader={ringsFragmentShader}
      />
    </instancedMesh>
  );
}
