import { hashColor, initials } from '../../lib/utils'

export default function Avatar({
  name,
  email,
  size = 32,
}: {
  name?: string
  email: string
  size?: number
}) {
  const label = name || email
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: hashColor(email),
        fontSize: size * 0.38,
      }}
    >
      {initials(label)}
    </div>
  )
}
