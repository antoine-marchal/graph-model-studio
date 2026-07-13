import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../primitives/cn'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md' | 'icon'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex select-none items-center justify-center gap-1.5 rounded-md font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 disabled:pointer-events-none disabled:opacity-40 active:translate-y-px',
        {
          'bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm hover:bg-[var(--accent-hover)]': variant === 'default',
          'text-[var(--fg-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--fg)]': variant === 'ghost',
          'border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--fg-muted)] shadow-[var(--shadow-sm)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]': variant === 'outline',
          'bg-[var(--danger)] text-white shadow-sm hover:brightness-110': variant === 'danger',
        },
        {
          'h-7 px-2.5 text-xs': size === 'sm',
          'h-9 px-3.5 text-sm': size === 'md',
          'h-8 w-8 text-sm': size === 'icon',
        },
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'
