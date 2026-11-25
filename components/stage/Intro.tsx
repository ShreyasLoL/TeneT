'use client';

import { useThree } from '@react-three/fiber';
import { gsap } from 'gsap/gsap-core';
import { useEffect } from 'react';
import { acquireFrames } from '@/lib/stage/activity';
import { stageClock } from '@/lib/stage/clock';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';

stageClock.bindGsap(gsap);

const INTRO_SESSION_KEY = 'tenet.intro';

export function Intro() {
  const { gl, scene, camera } = useThree();
  const mode = useTenetStore((s) => s.mode);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const lowPower = useTenetStore((s) => s.quality.lowPower);
  const introDone = useTenetStore((s) => s.introDone);
  const setIntroDone = useTenetStore((s) => s.setIntroDone);

  useEffect(() => {
    if (introDone) return;

    // Warm all shader programs cleanly before first seal
    if (typeof gl.compileAsync === 'function') {
      void gl.compileAsync(scene, camera).catch(() => undefined);
    }

    const alreadyPlayed = (() => {
      try {
        return window.sessionStorage.getItem(INTRO_SESSION_KEY) === '1';
      } catch {
        return false;
      }
    })();

    if (mode !== 'fork' || reducedMotion || lowPower || alreadyPlayed) {
      rig.introProgress = 1;
      setIntroDone(true);
      return;
    }

    const release = acquireFrames('intro');
    rig.introProgress = 0;

    const finish = () => {
      rig.introProgress = 1;
      try {
        window.sessionStorage.setItem(INTRO_SESSION_KEY, '1');
      } catch {
        // ignore storage restrictions
      }
      setIntroDone(true);
      release();
    };

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ onComplete: finish });
      // Dust -> Wordmark (0 -> 0.5) -> Hold -> Collapse -> Fork (1.0)
      tl.to(rig, { introProgress: 0.5, duration: 1.4, ease: 'power3.out' });
      tl.to(rig, { introProgress: 0.5, duration: 0.35 });
      tl.to(rig, { introProgress: 1.0, duration: 1.25, ease: 'expo.out' });
    });

    const skip = () => {
      ctx.revert();
      finish();
    };

    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('pointerdown', skip, { once: true });

    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
      ctx.revert();
      release();
    };
  }, [camera, gl, introDone, lowPower, mode, reducedMotion, scene, setIntroDone]);

  return null;
}
