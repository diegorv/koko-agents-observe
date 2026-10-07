import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * "Running now (N)" / "Ended (N)" header used wherever a list is split by
 * status. `id` is referenced by the section's aria-labelledby. `children`
 * renders on the right (e.g. the sidebar sort toggle).
 */
export function StatusSectionHeader({
  id,
  status,
  count,
  className,
  children,
}: {
  id: string
  status: 'running' | 'ended'
  count: number
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 select-none text-2xs uppercase tracking-wider text-muted-foreground/80 dark:text-muted-foreground/60',
        className,
      )}
    >
      {status === 'running' && (
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
      )}
      <span id={id}>
        {status === 'running' ? 'Running now' : 'Ended'} ({count})
      </span>
      {children}
    </div>
  )
}
