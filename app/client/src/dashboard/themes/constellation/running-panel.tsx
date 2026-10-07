import { useMemo } from 'react'
import { useNow } from '@/hooks/use-now'
import { isSessionRunning } from '@/lib/session-status'
import type { RecentSession } from '@/types'

const MAX_ROWS = 8

/**
 * "Running now (N)" list of the sessions in the current window. Its own
 * component (with its own clock) so the 30s tick doesn't re-render the
 * whole constellation. Clicking a row focuses that star.
 */
export function RunningPanel({
  sessions,
  onFocus,
}: {
  sessions: RecentSession[]
  onFocus: (id: string) => void
}) {
  const now = useNow()
  const running = useMemo(
    () =>
      sessions
        .filter((s) => isSessionRunning(s, now))
        .sort((a, b) => b.lastActivity - a.lastActivity),
    [sessions, now],
  )
  if (running.length === 0) return null

  const hidden = running.length - MAX_ROWS
  return (
    <div className="cst-panel cst-running" role="group" aria-labelledby="cst-running-h">
      <div className="cst-panel-h" id="cst-running-h" title="Sessions in the current window">
        Running now ({running.length})
      </div>
      <ul className="cst-running-list">
        {running.slice(0, MAX_ROWS).map((s) => (
          <li key={s.id}>
            <button className="cst-running-row" onClick={() => onFocus(s.id)}>
              <span className="cst-running-slug">{s.slug || s.id.slice(0, 8)}</span>
              {s.projectName && <span className="cst-running-proj">{s.projectName}</span>}
            </button>
          </li>
        ))}
      </ul>
      {hidden > 0 && <div className="cst-meta">+{hidden} more</div>}
    </div>
  )
}
