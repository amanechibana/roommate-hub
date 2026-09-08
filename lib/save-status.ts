"use client";

type Snapshot = { pending: number; saved: boolean; failed: boolean };
const initial: Snapshot = { pending: 0, saved: false, failed: false };
let snapshot = initial;
const listeners = new Set<() => void>();
const publish = (next: Snapshot) => {
  snapshot = next;
  listeners.forEach((listener) => listener());
};
export const saveStatus = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => initial,
};

/** Feedback follows requests; it never waits for an animation or delays a write. */
export function beginSave() {
  publish({
    ...snapshot,
    pending: snapshot.pending + 1,
    failed: snapshot.pending ? snapshot.failed : false,
  });
  let finished = false;
  return (success: boolean) => {
    if (finished) return;
    finished = true;
    publish({
      pending: Math.max(0, snapshot.pending - 1),
      saved: success || snapshot.saved,
      failed: !success || snapshot.failed,
    });
  };
}
