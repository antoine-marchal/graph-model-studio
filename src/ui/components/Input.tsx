import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '../primitives/cn'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-sm text-[var(--fg)] shadow-inner shadow-black/[0.025] placeholder:text-[var(--fg-subtle)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:bg-[var(--surface-1)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/15',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
