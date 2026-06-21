import { type SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '../primitives/cn'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-sm text-[var(--fg)] focus:border-[var(--accent)] focus:outline-none',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
)
Select.displayName = 'Select'
