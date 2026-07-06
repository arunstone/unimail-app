import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

/* Shared design-system primitives — keep one look across the app.
   The underlying class recipes live in index.css (@layer components). */

const BTN_SIZES = { sm: 'px-3 py-1.5', md: 'px-4 py-2.5' }

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline'
  size?: 'sm' | 'md'
}) {
  const base = variant === 'primary' ? 'btn-primary' : 'btn-outline'
  return <button className={`${base} ${BTN_SIZES[size]} ${className}`} {...props} />
}

export function Input({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input-base px-4 py-2.5 ${className}`} {...props} />
}

export function Card({
  className = '',
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return <div className={`card ${className}`}>{children}</div>
}

/** Brand wordmark: "Uni" in plain text, "mail" in the accent gradient. */
export function Wordmark({ className = 'text-2xl' }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight text-primary ${className}`}>
      Uni
      <span className="bg-accent-gradient bg-clip-text text-transparent">mail</span>
    </span>
  )
}
