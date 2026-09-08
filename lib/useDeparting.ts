"use client";

import { useEffect, useRef, useState } from "react";

// A card that leaves the Timeline should be SEEN leaving (2026-09-09, §8).
//
// After a reschedule the card vanishes from today the instant the store
// updates — that part is correct and must stay (a reload was never allowed to
// be part of the flow). But an item that blinks out of existence reads as a
// glitch rather than as "this moved". So the departing item is held in place
// for one short beat, marked as leaving, and only then dropped.
//
// It holds the item at its OLD index, so nothing below it jumps up until the
// animation is over.

export const DEPART_MS = 300;

export function useDeparting<T>(
  items: T[],
  keyOf: (item: T) => string,
  ms: number = DEPART_MS
): { rendered: T[]; departing: Set<string> } {
  const [state, setState] = useState<{ rendered: T[]; departing: Set<string> }>({
    rendered: items,
    departing: new Set(),
  });
  const previous = useRef(items);

  // `keyOf` must be stable — a module-level function or a useCallback. An
  // inline arrow would re-run this on every render and never let an item
  // finish leaving.
  useEffect(() => {
    const key = keyOf;
    const prev = previous.current;
    previous.current = items;

    const liveKeys = new Set(items.map(key));
    const gone = prev.filter((p) => !liveKeys.has(key(p)));

    if (gone.length === 0) {
      // setState is deferred rather than called straight from the effect body
      // so React is never asked to re-render inside its own commit.
      const id = setTimeout(() => setState({ rendered: items, departing: new Set() }), 0);
      return () => clearTimeout(id);
    }

    const merged = [...items];
    prev.forEach((p, index) => {
      if (!liveKeys.has(key(p))) merged.splice(Math.min(index, merged.length), 0, p);
    });

    const show = setTimeout(
      () => setState({ rendered: merged, departing: new Set(gone.map(key)) }),
      0
    );
    const settle = setTimeout(() => setState({ rendered: items, departing: new Set() }), ms);
    return () => {
      clearTimeout(show);
      clearTimeout(settle);
    };
  }, [items, keyOf, ms]);

  return state;
}
