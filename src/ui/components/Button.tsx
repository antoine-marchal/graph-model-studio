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
        'inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-50',
        {
          'bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110': variant === 'default',
          'text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]': variant === 'ghost',
          'border border-[var(--border)] bg-[var(--surface-1)] text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]': variant === 'outline',
          'bg-red-600 text-white hover:bg-red-700': variant === 'danger',
        },
        {
          'h-7 px-2 text-xs': size === 'sm',
          'h-8 px-3 text-sm': size === 'md',
          'h-7 w-7 text-base': size === 'icon',
        },
        className,
      )}
      {...props}
    />
  ),
)
Button.displayName = 'Button'
