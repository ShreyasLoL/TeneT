import {
  BufferGeometry,
  type Camera,
  DataTexture,
  Float32BufferAttribute,
  FloatType,
  InstancedBufferAttribute,
  type InstancedMesh,
  Matrix4,
  NearestFilter,
  Plane,
  Ray,
  RGBAFormat,
  Sphere,
  Vector2,
  Vector3,
} from 'three';
import { inscription } from '@/lib/viz/inscribe';
import type { ringLayout } from '@/lib/viz/ringLayout';
import { BH_RING_WORLD_SCALE } from '@/stage/blackhole/constants';

export const MAX_RING_INSTANCES = 400;
const TEX_WIDTH = 16;
const TEX_HEIGHT = 512;

type RingNode = ReturnType<typeof ringLayout>[number];

const pickRay = new Ray();
const pickPlane = new Plane(new Vector3(0, 1, 0), 0);
const pickHit = new Vector3();
const pickNdc = new Vector2();
const identityMatrix = new Matrix4();

export function createRingsSegmentTexture(): DataTexture {
  const buf = new Float32Array(TEX_WIDTH * TEX_HEIGHT * 4);
  const tex = new DataTexture(buf, TEX_WIDTH, TEX_HEIGHT, RGBAFormat, FloatType);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createRingsInstancedGeometry(radialSegments = 128): BufferGeometry {
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
  geom.boundingSphere = new Sphere(new Vector3(0, 0, 0), 32);

  geom.setAttribute('aRadius', new InstancedBufferAttribute(new Float32Array(MAX_RING_INSTANCES), 1));
  geom.setAttribute('aThickness', new InstancedBufferAttribute(new Float32Array(MAX_RING_INSTANCES), 1));
  geom.setAttribute('aRingIndex', new InstancedBufferAttribute(new Float32Array(MAX_RING_INSTANCES), 1));
  geom.setAttribute('aLuminance', new InstancedBufferAttribute(new Float32Array(MAX_RING_INSTANCES), 1));
  geom.setAttribute('aIsVoid', new InstancedBufferAttribute(new Float32Array(MAX_RING_INSTANCES), 1));
  geom.setAttribute('aInStreak', new InstancedBufferAttribute(new Float32Array(MAX_RING_INSTANCES), 1));
  geom.setAttribute('aSegCount', new InstancedBufferAttribute(new Float32Array(MAX_RING_INSTANCES), 1));

  return geom;
}

export function populateRingsInstanceBuffers(
  mesh: InstancedMesh,
  geom: BufferGeometry,
  tex: DataTexture,
  rings: ReadonlyArray<RingNode>,
): void {
  const aRadius = geom.getAttribute('aRadius') as InstancedBufferAttribute;
  const aThickness = geom.getAttribute('aThickness') as InstancedBufferAttribute;
  const aRingIndex = geom.getAttribute('aRingIndex') as InstancedBufferAttribute;
  const aLuminance = geom.getAttribute('aLuminance') as InstancedBufferAttribute;
  const aIsVoid = geom.getAttribute('aIsVoid') as InstancedBufferAttribute;
  const aInStreak = geom.getAttribute('aInStreak') as InstancedBufferAttribute;
  const aSegCount = geom.getAttribute('aSegCount') as InstancedBufferAttribute;

  const data = tex.image.data as Float32Array;
  const count = Math.min(MAX_RING_INSTANCES, rings.length);

  for (let i = 0; i < count; i++) {
    const r = rings[i];
    mesh.setMatrixAt(i, identityMatrix);
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
}

export function intersectDiskPolar(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  camera: Camera,
): { r: number; theta: number } | null {
  pickNdc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  pickRay.origin.copy(camera.position);
  pickRay.direction.set(pickNdc.x, pickNdc.y, 0.5).unproject(camera).sub(camera.position).normalize();

  if (!pickRay.intersectPlane(pickPlane, pickHit)) return null;
  return {
    r: Math.hypot(pickHit.x, pickHit.z) / BH_RING_WORLD_SCALE,
    theta: Math.atan2(pickHit.z, pickHit.x),
  };
}
