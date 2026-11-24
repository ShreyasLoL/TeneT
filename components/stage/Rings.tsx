'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useTenetState } from '@/lib/api/hooks';
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

const pickRay = new THREE.Ray();
const pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const pickHit = new THREE.Vector3();
const pickNdc = new THREE.Vector2();

function createUnitAnnulusGeometry(radialSegments = 128): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
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

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  return geom;
}

export function Rings() {
  const { camera, gl } = useThree();
  const { data: state } = useTenetState();
  const mode = useTenetStore((s) => s.mode);
  const cursor = useTenetStore((s) => s.cursor);
  const selection = useTenetStore((s) => s.selection);
  const select = useTenetStore((s) => s.select);
  const setCursor = useTenetStore((s) => s.setCursor);

  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const matRef = useRef<THREE.ShaderMaterial | null>(null);

  const rings = useMemo(() => {
    if (!state) return [];
    return ringLayout(state.days, state.range, { maxRings: MAX_INSTANCES });
  }, [state]);

  const segmentTex = useMemo(() => {
    const buf = new Float32Array(TEX_WIDTH * TEX_HEIGHT * 4);
    const tex = new THREE.DataTexture(buf, TEX_WIDTH, TEX_HEIGHT, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }, []);
  const segmentTexRef = useRef(segmentTex);

  const geometry = useMemo(() => {
    const g = createUnitAnnulusGeometry(128);
    g.setAttribute('aRadius', new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1));
    g.setAttribute('aThickness', new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1));
    g.setAttribute('aRingIndex', new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1));
    g.setAttribute('aLuminance', new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1));
    g.setAttribute('aIsVoid', new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1));
    g.setAttribute('aInStreak', new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1));
    g.setAttribute('aSegCount', new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES), 1));
    return g;
  }, []);
  const geomRef = useRef(geometry);

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
      uOrchidAbyss: { value: new THREE.Vector3(abr, abg, abb) },
      uOrchid: { value: new THREE.Vector3(ar, ag, ab) },
      uOrchidHot: { value: new THREE.Vector3(hr, hg, hb) },
      uTextDim: { value: new THREE.Vector3(dr, dg, db) },
    };
  }, [segmentTex]);

  useEffect(() => {
    const tex = segmentTexRef.current;
    const geom = geomRef.current;
    return () => {
      tex.dispose();
      geom.dispose();
    };
  }, []);

  useEffect(() => {
    const geom = geomRef.current;
    const tex = segmentTexRef.current;
    const mesh = meshRef.current;
    if (!mesh) return;

    const aRadius = geom.getAttribute('aRadius') as THREE.InstancedBufferAttribute;
    const aThickness = geom.getAttribute('aThickness') as THREE.InstancedBufferAttribute;
    const aRingIndex = geom.getAttribute('aRingIndex') as THREE.InstancedBufferAttribute;
    const aLuminance = geom.getAttribute('aLuminance') as THREE.InstancedBufferAttribute;
    const aIsVoid = geom.getAttribute('aIsVoid') as THREE.InstancedBufferAttribute;
    const aInStreak = geom.getAttribute('aInStreak') as THREE.InstancedBufferAttribute;
    const aSegCount = geom.getAttribute('aSegCount') as THREE.InstancedBufferAttribute;

    const data = tex.image.data as Float32Array;
    const identity = new THREE.Matrix4();

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
  }, [rings]);

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
    const targetIdx =
      mode === 'time' ? Math.max(0, rings.findIndex((r) => r.day === cursor)) : 0;

    rig.cursorIndex = THREE.MathUtils.damp(rig.cursorIndex, targetIdx, 7.5, dt);
    mat.uniforms.uCursorIndex.value = rig.cursorIndex;
    mat.uniforms.uRingShift.value = rig.ringShift;

    const selIdx =
      selection && (selection.kind === 'ring' || selection.kind === 'segment')
        ? rings.findIndex((r) => r.day === selection.day)
        : -1;
    mat.uniforms.uSelectedIndex.value = selIdx;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, MAX_INSTANCES]}
      frustumCulled={false}
      visible={false}
    >
      <shaderMaterial
        ref={matRef}
        glslVersion={THREE.GLSL3}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        uniforms={uniforms}
        vertexShader={ringsVertexShader}
        fragmentShader={ringsFragmentShader}
      />
    </instancedMesh>
  );
}
