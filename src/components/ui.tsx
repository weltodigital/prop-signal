import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const variants = {
  primary: 'bg-accent text-white hover:bg-accent/90',
  secondary: 'border border-line bg-card text-ink hover:bg-paper',
  quiet: 'text-muted underline underline-offset-4 hover:text-ink',
} as const

export type ButtonVariant = keyof typeof variants

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return <button className={`${buttonBase} ${variants[variant]} ${className}`} {...props} />
}

export function ButtonLink({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={`${buttonBase} ${variants[variant]} ${className}`} {...props} />
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-card p-6 ${className}`}>{children}</div>
}

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn'
  title: string
  children?: ReactNode
}) {
  const tones = {
    info: 'border-line bg-accent-soft text-ink',
    warn: 'border-warn/30 bg-warn-soft text-ink',
  } as const
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${tones[tone]}`} role="status">
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-1 text-muted">{children}</div> : null}
    </div>
  )
}

/**
 * Empty state. Used wherever there is nothing to show yet — which in Phase 1
 * is the whole dashboard, and stays true on a thin week later on.
 */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-card px-6 py-12 text-center">
      <p className="text-base font-medium">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-prose text-sm text-muted">{children}</div> : null}
    </div>
  )
}

/**
 * The one text-input look, so five auth forms do not carry five copies of the
 * same class string and drift apart.
 */
export const inputClass =
  'w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

export function Field({
  label,
  hint,
  ...props
}: ComponentProps<'input'> & { label: string; hint?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={props.id} className="block text-sm font-medium">
        {label}
      </label>
      <input {...props} className={`${inputClass} ${props.className ?? ''}`} />
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

/** An error a form action came back with. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="text-sm text-warn" role="alert">
      {message}
    </p>
  )
}
