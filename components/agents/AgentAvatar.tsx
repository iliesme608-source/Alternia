import Image from 'next/image'

const AVATARS: Record<string, string> = {
  alex: '/agents/alex_avatar.png',
  sarah: '/agents/sarah_avatar.png',
  lucas: '/agents/lucas_avatar.png',
  emma: '/agents/emma_avatar.png',
  thomas: '/agents/thomas_avatar.png',
  nora: '/agents/nora_avatar.png',
}

export function AgentAvatar({ agentId, size = 80 }: { agentId: string; size?: number }) {
  const src = AVATARS[agentId.toLowerCase()] ?? '/agents/alex_avatar.png'
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full bg-white/[0.06]"
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={agentId}
        width={size}
        height={size}
        className="h-full w-full object-cover object-top"
      />
    </div>
  )
}
