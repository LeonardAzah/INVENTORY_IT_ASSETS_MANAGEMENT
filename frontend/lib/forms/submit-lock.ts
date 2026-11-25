'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

export function useSubmitLock(pending: boolean) {
  const locked = useRef(false);
  const inFlight = useRef(pending);
  // In the commit itself, not after it: the check below must see the request as soon as the screen does.
  useLayoutEffect(() => {
    inFlight.current = pending;
    if (!pending) {
      locked.current = false;
    }
  }, [pending]);

  return useCallback(
    <Args extends unknown[]>(run: (...args: Args) => void) =>
      (...args: Args) => {
        const [event] = args;
        if (locked.current) {
          if (
            typeof event === 'object' &&
            event !== null &&
            'preventDefault' in event &&
            typeof event.preventDefault === 'function'
          ) {
            event.preventDefault();
          }
          return;
        }
        locked.current = true;
        run(...args);
        // Once this click has been dealt with: if no request was started, let the next try through.
        setTimeout(() => {
          if (!inFlight.current) {
            locked.current = false;
          }
        }, 0);
      },
    [],
  );
}
