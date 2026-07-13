import { type SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '../primitives/cn'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-sm text-[var(--fg)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:bg-[var(--surface-1)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/15',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
)
Select.displayName = 'Select'
