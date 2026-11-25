'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { DoubleSide, GLSL3, type InstancedMesh, MathUtils, type ShaderMaterial, Vector3 } from 'three';
import { useTenetState } from '@/lib/api/hooks';
import { type QualityLevel } from '@/lib/stage/tiers';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { hexToRgbNormalized, readPalette } from '@/lib/viz/palette';
import { pickRingPolar } from '@/lib/viz/pickRing';
import { ringLayout } from '@/lib/viz/ringLayout';
import {
  createRingsInstancedGeometry,
  createRingsSegmentTexture,
  intersectDiskPolar,
  MAX_RING_INSTANCES,
  populateRingsInstanceBuffers,
} from './ringsGeometry';
import { ringsFragmentShader, ringsVertexShader } from './shaders/rings';

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
    return ringLayout(sealedDays, stateRange, { maxRings: MAX_RING_INSTANCES });
  }, [sealedDays, stateRange]);

  const dayIndexMap = useMemo(
    () => new Map(rings.map((r, idx) => [r.day, idx] as const)),
    [rings],
  );

  const segmentTex = useMemo(() => createRingsSegmentTexture(), []);
  const segmentTexRef = useRef(segmentTex);

  const radialSegments = level <= 1 ? 128 : 64;
  const geometry = useMemo(() => createRingsInstancedGeometry(radialSegments), [radialSegments]);

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
    const mesh = meshRef.current;
    if (!mesh) return;
    populateRingsInstanceBuffers(mesh, geometry, segmentTexRef.current, rings);
  }, [geometry, rings]);

  useEffect(() => {
    const dom = gl.domElement;
    const onPointerDown = (e: PointerEvent) => {
      if (mode !== 'orbit' && mode !== 'time' && mode !== 'week') return;
      if (rings.length === 0) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          'button, a, input, textarea, select, [role="button"], [role="slider"], [role="dialog"]',
        )
      ) {
        return;
      }

      const hit = intersectDiskPolar(e.clientX, e.clientY, dom.getBoundingClientRect(), camera);
      if (!hit) return;
      const picked = pickRingPolar(hit.r, hit.theta, rings);
      if (picked) {
        select(
          picked.segment
            ? { kind: 'segment', day: picked.ring.day, key: picked.segment.key }
            : { kind: 'ring', day: picked.ring.day },
        );
        if (mode === 'time') setCursor(picked.ring.day);
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
      args={[geometry, undefined, MAX_RING_INSTANCES]}
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
