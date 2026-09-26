import { useCallback, useEffect, useRef, useState } from "react";

import { RICO_COURT_LAST_FRAME_HOLD_MS } from "@/services/ricoMoves";

export function useRicoCourtBackflipQueue() {
  const [active, setActive] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const pendingCount = useRef(0);
  const activeRef = useRef(false);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enqueue = useCallback(() => {
    pendingCount.current += 1;
    if (activeRef.current) return;
    activeRef.current = true;
    setActive(true);
    setPlayKey((current) => current + 1);
  }, []);

  const settleCurrent = useCallback((holdMs: number) => {
    if (!activeRef.current) return;
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = setTimeout(() => {
      finishTimer.current = null;
      if (!activeRef.current) return;

      if (pendingCount.current > 1) {
        pendingCount.current -= 1;
        setPlayKey((current) => current + 1);
        return;
      }

      pendingCount.current = 0;
      activeRef.current = false;
      setActive(false);
    }, holdMs);
  }, []);

  const onEnded = useCallback(() => {
    settleCurrent(RICO_COURT_LAST_FRAME_HOLD_MS);
  }, [settleCurrent]);

  const onError = useCallback(() => {
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = null;
    pendingCount.current = 0;
    activeRef.current = false;
    setActive(false);
  }, []);

  const cancel = useCallback(() => {
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = null;
    pendingCount.current = 0;
    activeRef.current = false;
    setActive(false);
  }, []);

  useEffect(
    () => () => {
      if (finishTimer.current) clearTimeout(finishTimer.current);
    },
    [],
  );

  return { active, playKey, enqueue, onEnded, onError, cancel };
}