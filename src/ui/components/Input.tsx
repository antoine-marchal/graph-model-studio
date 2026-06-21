import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '../primitives/cn'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-sm text-[var(--fg)] placeholder-[var(--fg-subtle)] focus:border-[var(--accent)] focus:outline-none',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
