import * as React from 'react'
import { cn } from '@/lib/utils'

export type BadgeVariant = 'default' | 'success' | 'destructive' | 'warning' | 'outline' | 'secondary'

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variantClasses: Record<BadgeVariant, string> = {
    default:     'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    success:     'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    destructive: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    warning:     'bg-amber-500/20 text-amber-300 border-amber-500/30',
    outline:     'bg-slate-800/60 text-slate-300 border-slate-600',
    secondary:   'bg-slate-700/60 text-slate-200 border-slate-600',
  }

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
