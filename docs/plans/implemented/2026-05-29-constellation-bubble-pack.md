# Plan: Constellation bubble-pack, pan, and windowed activity

**Date:** 2026-05-29
**Branch:** `feat/constellation-bubble-pack` (squash-merged to main)

## Goal

Fix the Constellation home view's layout (didn't fit, top label clipped by the
header, all project wells the same size). Replace the fixed ellipse of equal
wells with an **activity-windowed, pannable canvas of activity-sized bubbles**.

## What shipped

### Data — activity window (server)
- `GET /sessions/recent?since=<ms>` → `WHERE last_activity >= ?`. Added to the
  store interface, the SQLite adapter, and the route, with tests (route
  forwarding/ignoring non-numeric; adapter windowing).
- Client: `useWindowedSessions(windowMs)` — `since` computed at fetch time so
  the query key stays stable; WS invalidation refreshes it.

### Layout — packed bubbles sized by activity (`physics.ts`)
- Replaced the ellipse `layoutWells` with `packProjects`: deterministic,
  dependency-free circle packing (golden-angle seed + collision/gravity
  settle), biggest/most-active in the centre, non-overlapping.
- Well size = aggregate recency heat over the window (a **4h** sizing half-life,
  separate from the seconds-scale star-glow τ, so wells don't collapse to the
  floor across a 24h window). Containment floor keeps a project's stars inside.
- `stepSimulation` now clamps stars to a passed `bounds` (the world is dynamic,
  centred at the origin) instead of a fixed 1440×900.

### Camera — pan + zoom
- The world can exceed the viewport. **Drag to pan** (pointer-drag translates
  the viewBox, clamped to bounds). Pointer capture happens only after a 6px
  drag threshold so a plain click still drills in. Double-click / Recenter
  returns to the busiest cluster. Coexists with the drill-in zoom.
- **Zoom slider** (log scale) resizes the camera; the loop eases the viewBox so
  it animates. (Not gated on the recenter flag — gating swallowed zoom right
  after a window change.)

### Controls
- Collapsible panel: a **gear** in the top-right collapses the body down to just
  the gear (persisted).
- Inline sliders (label · slider · value-right): **window** (30 min → 90 days,
  log; default 24h), **zoom** (%), **decay τ** (s). All persisted.
- Pure slider math in `scale.ts` (unit-tested).

## Fixes made along the way
- Drill-in regression: capturing the pointer on press stole the click; now
  capture only after the drag threshold.
- Session-route render: covered separately on `main` earlier.

## Out of scope / follow-ups
- Continuous per-frame "breathing" of well size (currently updates on refetch,
  smoothed by CSS transitions).
- Wheel-to-zoom; momentum panning.
- A "+N more" affordance is unnecessary now that the canvas pans.
