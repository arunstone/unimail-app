import { useToastStore } from '../../stores/toastStore'

const KIND_STYLES = {
  success: 'border-green-500/40 bg-green-500/10 text-green-300',
  error: 'border-red-500/40 bg-red-500/10 text-red-300',
  info: 'border-accent/40 bg-accent/10 text-blue-300',
}

const KIND_ICONS = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
}

export default function Toasts() {
  const { toasts, dismiss } = useToastStore()
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`flex animate-slide-in-right items-center gap-2.5 rounded-lg border px-4 py-2 text-left text-body shadow-card backdrop-blur ${KIND_STYLES[t.kind]}`}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-caption font-bold">
            {KIND_ICONS[t.kind]}
          </span>
          {t.message}
        </button>
      ))}
    </div>
  )
}
