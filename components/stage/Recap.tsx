'use client';

import { gsap } from 'gsap/gsap-core';
import { useEffect, useRef } from 'react';
import { useTenetState } from '@/lib/api/hooks';
import { acquireFrames } from '@/lib/stage/activity';
import { stageClock } from '@/lib/stage/clock';
import { useTenetStore } from '@/lib/store';
import { notifyRecapRig, rig } from '@/lib/store/rig';
import { buildCohortMap } from '@/lib/viz/cohorts';
import { loadLocalGoals } from '@/lib/viz/localGoals';
import { buildReviewForDay } from '@/lib/viz/review';

stageClock.bindGsap(gsap);

function resetRecapRig() {
  rig.recapBeat = 0;
  rig.recapProgress = 0;
  rig.recapJudgeIndex = -1;
  rig.recapItemIndex = -1;
  rig.recapVisibleLines = 0;
  rig.recapCanSkip = false;
  rig.recapSpike = 0;
  rig.ringShift = 0;
  notifyRecapRig();
}

export function Recap() {
  const recap = useTenetStore((s) => s.recap);
  const reducedMotion = useTenetStore((s) => s.quality.reducedMotion);
  const { data: state } = useTenetState();

  const tlRef = useRef<ReturnType<typeof gsap.timeline> | null>(null);
  const activeDayRef = useRef<string | null>(null);

  useEffect(() => {
    if (!recap || !state || reducedMotion) {
      tlRef.current?.kill();
      tlRef.current = null;
      activeDayRef.current = null;
      resetRecapRig();
      return;
    }

    if (recap.skipped && tlRef.current && activeDayRef.current === recap.day) {
      tlRef.current.progress(1);
      return;
    }

    if (activeDayRef.current === recap.day && tlRef.current) {
      return;
    }
    activeDayRef.current = recap.day;

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
      localGoals: loadLocalGoals(),
    });
    const lineCount = review?.lines.length ?? 0;

    const beat1Sec = 0.9;
    const beat2Sec = Math.min(2.6, Math.max(1.2, results.length * 0.34));
    const beat3Sec = 1.8;
    const beat4Sec = Math.min(2.7, Math.max(0.9, Math.max(1, lineCount) * 0.9));
    const beat5Sec = 0.9;

    const release = acquireFrames('recap');

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          rig.recapBeat = 5;
          rig.recapProgress = 1;
          rig.recapJudgeIndex = -1;
          rig.recapItemIndex = results.length;
          rig.recapVisibleLines = lineCount;
          rig.recapCanSkip = true;
          rig.recapSpike = 0;
          rig.ringShift = 0;
          notifyRecapRig();
          release();
        },
      });
      tlRef.current = tl;

      // Unlock skip after 1.5s on the master timeline
      tl.call(
        () => {
          rig.recapCanSkip = true;
          notifyRecapRig();
        },
        undefined,
        1.5,
      );

      // Beat 1 (T): dim & prepare
      tl.call(
        () => {
          rig.recapBeat = 1;
          rig.recapProgress = 0;
          rig.recapItemIndex = -1;
          rig.recapVisibleLines = 0;
          notifyRecapRig();
        },
        undefined,
        0,
      );
      tl.to(rig, { recapProgress: 1, duration: beat1Sec, ease: 'expo.out' }, 0);

      // Beat 2 (E): judge each cohort sequentially
      let cursorSec = beat1Sec;
      tl.call(
        () => {
          rig.recapBeat = 2;
          rig.recapProgress = 0;
          notifyRecapRig();
        },
        undefined,
        cursorSec,
      );
      const count = Math.max(1, results.length);
      const perItemSec = beat2Sec / count;
      for (let i = 0; i < count; i++) {
        const res = results[i];
        const slot = res ? (cohortMap.slotOfKey.get(res.key) ?? 0) : 0;
        const isMiss = res && res.status === 'required' && !res.satisfied;
        const itemStart = cursorSec + i * perItemSec;
        tl.call(
          () => {
            rig.recapJudgeIndex = slot;
            rig.recapItemIndex = i;
            notifyRecapRig();
          },
          undefined,
          itemStart,
        );
        tl.to(
          rig,
          {
            recapSpike: isMiss ? 1 : 0.15,
            recapProgress: (i + 1) / count,
            duration: perItemSec,
            ease: 'power2.out',
          },
          itemStart,
        );
      }
      cursorSec += beat2Sec;

      // Beat 3 (N): center beat - disk collapse & new ring expulsion
      tl.call(
        () => {
          rig.recapBeat = 3;
          rig.recapProgress = 0;
          rig.recapJudgeIndex = -1;
          rig.recapItemIndex = results.length;
          rig.ringShift = -0.35;
          notifyRecapRig();
        },
        undefined,
        cursorSec,
      );
      tl.to(
        rig,
        {
          recapProgress: 1,
          recapSpike: 0,
          ringShift: 0,
          duration: beat3Sec,
          ease: 'expo.out',
        },
        cursorSec,
      );
      cursorSec += beat3Sec;

      // Beat 4 (E): review lines settle
      tl.call(
        () => {
          rig.recapBeat = 4;
          rig.recapProgress = 0;
          notifyRecapRig();
        },
        undefined,
        cursorSec,
      );
      if (lineCount > 0) {
        const perLineSec = beat4Sec / lineCount;
        for (let i = 0; i < lineCount; i++) {
          tl.call(
            () => {
              rig.recapVisibleLines = i + 1;
              notifyRecapRig();
            },
            undefined,
            cursorSec + i * perLineSec,
          );
        }
      }
      tl.to(rig, { recapProgress: 1, duration: beat4Sec, ease: 'none' }, cursorSec);
      cursorSec += beat4Sec;

      // Beat 5 (T): reverse of Beat 1 - "sealed."
      tl.call(
        () => {
          rig.recapBeat = 5;
          rig.recapProgress = 0;
          rig.recapVisibleLines = lineCount;
          notifyRecapRig();
        },
        undefined,
        cursorSec,
      );
      tl.to(rig, { recapProgress: 1, duration: beat5Sec, ease: 'expo.out' }, cursorSec);

      if (recap.skipped) {
        tl.progress(1);
      }
    });

    return () => {
      tlRef.current = null;
      activeDayRef.current = null;
      ctx.revert();
      resetRecapRig();
      release();
    };
  }, [recap, reducedMotion, state]);

  return null;
}
