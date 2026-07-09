'use client';

import { useCallback, useRef, useState, type ReactNode, type TouchEvent } from 'react';

const THRESHOLD = 70;

/**
 * Wraps a scrollable page and runs `onRefresh` when the user pulls down from the
 * very top (native app gesture). Only engages when the window is scrolled to 0
 * so it never fights normal scrolling.
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      startY.current = !refreshing && window.scrollY <= 0 ? e.touches[0].clientY : null;
    },
    [refreshing],
  );

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setPull(Math.min(delta * 0.5, THRESHOLD + 24));
  }, []);

  const onTouchEnd = useCallback(async () => {
    if (startY.current === null) return;
    const shouldRefresh = pull >= THRESHOLD;
    startY.current = null;
    if (!shouldRefresh) {
      setPull(0);
      return;
    }
    setRefreshing(true);
    setPull(THRESHOLD);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  }, [pull, onRefresh]);

  const active = pull > 0 || refreshing;

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        aria-hidden={!active}
        className="flex items-center justify-center overflow-hidden text-brand-500"
        style={{ height: pull }}
      >
        {active ? (
          <span
            className={`text-lg ${refreshing || pull >= THRESHOLD ? 'animate-spin' : ''}`}
            style={{ opacity: Math.min(pull / THRESHOLD, 1) }}
          >
            ⟳
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
