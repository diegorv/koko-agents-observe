import { useSyncExternalStore } from 'react'

// One shared interval for every subscriber, so N rows re-evaluating the
// idle cutoff don't each spin up their own timer.
const TICK_MS = 30_000
const listeners = new Set<() => void>()
let now = Date.now()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      for (const l of listeners) l()
    }, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

/** Coarse wall clock (30s resolution) for time-based status like the idle cutoff. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now)
}
