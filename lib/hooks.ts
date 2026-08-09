"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * True only after hydration. Lets a component read browser-only APIs without
 * a setState-in-effect cascade and without an SSR mismatch.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
