export default function EmptyState({
  icon = '📭',
  title,
  hint,
  actionLabel,
  onAction,
}: {
  icon?: string
  title: string
  hint?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex animate-fade-up flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-divider bg-surface text-3xl shadow-card">
        {icon}
      </div>
      <div className="text-subhead font-medium text-primary">{title}</div>
      {hint && <div className="max-w-xs text-body text-muted">{hint}</div>}
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-primary mt-1 px-4 py-2">
          {actionLabel}
        </button>
      )}
    </div>
  )
}
