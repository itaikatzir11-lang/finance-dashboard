import * as React from 'react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', loading = false, children, disabled, ...props }, ref) => {
    const variantClasses: Record<ButtonVariant, string> = {
      default:     'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-transparent shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30',
      outline:     'bg-transparent text-slate-200 border-white/[0.12] hover:bg-white/[0.05] hover:border-white/[0.18] hover:text-slate-100',
      ghost:       'bg-transparent text-slate-300 border-transparent hover:bg-white/[0.05] hover:text-slate-100',
      destructive: 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white border-transparent shadow-md shadow-rose-500/15',
      secondary:   'bg-white/[0.07] text-slate-100 border-white/[0.08] hover:bg-white/[0.11] hover:border-white/[0.13]',
    }

    const sizeClasses: Record<ButtonSize, string> = {
      sm:   'h-8 px-3 text-xs rounded-md',
      md:   'h-9 px-4 text-sm rounded-lg',
      lg:   'h-11 px-6 text-base rounded-lg',
      icon: 'h-9 w-9 rounded-lg',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium border transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07080F]',
          'active:scale-[0.97] active:brightness-90',
          'disabled:opacity-50 disabled:pointer-events-none',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { Button }
