'use client';

import gsap from 'gsap';
import { useEffect } from 'react';
import { useTenetState } from '@/lib/api/hooks';
import { acquireFrames } from '@/lib/stage/activity';
import { useTenetStore } from '@/lib/store';
import { rig } from '@/lib/store/rig';
import { buildCohortMap } from '@/lib/viz/cohorts';
import { buildReviewForDay } from '@/lib/viz/review';

export function Recap() {
  const recap = useTenetStore((s) => s.recap);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const { data: state } = useTenetState();

  useEffect(() => {
    if (!recap || !state || reducedMotion) {
      rig.recapBeat = 0;
      rig.recapProgress = 0;
      rig.recapJudgeIndex = -1;
      rig.recapSpike = 0;
      rig.ringShift = 0;
      return;
    }

    const sealed = state.days.find((d) => d.day === recap.day);
    const results = sealed?.results ?? [];
    const cohortMap = buildCohortMap(
      state.definitions.areas,
      state.definitions.trackables,
      state.days.map((d) => d.results),
    );
    const review = buildReviewForDay({
      day: recap.day,
      days: state.days,
      trackables: state.definitions.trackables,
      entries: state.entries,
    });
    const lineCount = review?.lines.length ?? 2;

    const beat1Sec = 0.9;
    const beat2Sec = Math.min(2.6, Math.max(1.2, results.length * 0.34));
    const beat3Sec = 1.8;
    const beat4Sec = Math.min(2.7, Math.max(0.9, lineCount * 0.9));
    const beat5Sec = 0.9;

    const release = acquireFrames('recap');

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          rig.recapBeat = 5;
          rig.recapProgress = 1;
          rig.recapJudgeIndex = -1;
          rig.recapSpike = 0;
          rig.ringShift = 0;
          release();
        },
      });

      // Beat 1 (T): dim & prepare
      tl.call(() => {
        rig.recapBeat = 1;
        rig.recapProgress = 0;
      });
      tl.to(rig, { recapProgress: 1, duration: beat1Sec, ease: 'expo.out' });

      // Beat 2 (E): judge each cohort sequentially
      tl.call(() => {
        rig.recapBeat = 2;
        rig.recapProgress = 0;
      });
      const perItemSec = beat2Sec / Math.max(1, results.length);
      for (let i = 0; i < Math.max(1, results.length); i++) {
        const res = results[i];
        const slot = res ? (cohortMap.slotOfKey.get(res.key) ?? 0) : 0;
        const isMiss = res && res.status === 'required' && !res.satisfied;
        tl.call(() => {
          rig.recapJudgeIndex = slot;
        });
        tl.to(rig, {
          recapSpike: isMiss ? 1 : 0.15,
          recapProgress: (i + 1) / Math.max(1, results.length),
          duration: perItemSec,
          ease: 'power2.out',
        });
      }

      // Beat 3 (N): center beat - disk collapse & new ring expulsion
      tl.call(() => {
        rig.recapBeat = 3;
        rig.recapProgress = 0;
        rig.recapJudgeIndex = -1;
        rig.ringShift = -0.35;
      });
      tl.to(rig, {
        recapProgress: 1,
        recapSpike: 0,
        ringShift: 0,
        duration: beat3Sec,
        ease: 'expo.out',
      });

      // Beat 4 (E): review lines settle
      tl.call(() => {
        rig.recapBeat = 4;
        rig.recapProgress = 0;
      });
      tl.to(rig, { recapProgress: 1, duration: beat4Sec, ease: 'none' });

      // Beat 5 (T): reverse of Beat 1 - "sealed."
      tl.call(() => {
        rig.recapBeat = 5;
        rig.recapProgress = 0;
      });
      tl.to(rig, { recapProgress: 1, duration: beat5Sec, ease: 'expo.out' });
    });

    if (recap.skipped) {
      ctx.revert();
      rig.recapBeat = 5;
      rig.recapProgress = 1;
      rig.recapJudgeIndex = -1;
      rig.recapSpike = 0;
      rig.ringShift = 0;
      release();
    }

    return () => {
      ctx.revert();
      rig.recapBeat = 0;
      rig.recapProgress = 0;
      rig.recapJudgeIndex = -1;
      rig.recapSpike = 0;
      rig.ringShift = 0;
      release();
    };
  }, [recap, reducedMotion, state]);

  return null;
}
