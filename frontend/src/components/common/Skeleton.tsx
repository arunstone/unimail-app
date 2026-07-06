export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 border-b border-divider px-4 py-3">
      <div className="shimmer h-8 w-8 shrink-0 rounded-full bg-surface" />
      <div className="flex-1 space-y-2">
        <div className="shimmer h-3 w-1/3 rounded bg-surface" />
        <div className="shimmer h-3 w-2/3 rounded bg-surface" />
      </div>
      <div className="shimmer h-3 w-10 rounded bg-surface" />
    </div>
  )
}

export function SkeletonList({ rows = 8 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return <div className="shimmer h-32 rounded-xl bg-surface" />
}
