import { PROVIDER_COLORS, PROVIDER_LETTERS } from '../../lib/utils'
import type { Provider } from '../../types'

export default function ProviderIcon({
  provider,
  size = 20,
}: {
  provider: Provider
  size?: number
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded font-bold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: PROVIDER_COLORS[provider],
        fontSize: size * 0.6,
      }}
      title={provider}
    >
      {PROVIDER_LETTERS[provider]}
    </div>
  )
}
