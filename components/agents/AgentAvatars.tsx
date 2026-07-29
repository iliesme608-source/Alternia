import { AgentAvatar } from "./AgentAvatar"

interface AvatarProps {
  size?: number
}

// Ces composants historiques (anciens avatars SVG) délèguent désormais aux
// vrais avatars PNG via <AgentAvatar/>, afin d'unifier tous les visuels.

export function AlexAvatar({ size = 48 }: AvatarProps) {
  return <AgentAvatar agentId="alex" size={size} />
}

export function SarahAvatar({ size = 48 }: AvatarProps) {
  return <AgentAvatar agentId="sarah" size={size} />
}

export function LucasAvatar({ size = 48 }: AvatarProps) {
  return <AgentAvatar agentId="lucas" size={size} />
}

export function EmmaAvatar({ size = 48 }: AvatarProps) {
  return <AgentAvatar agentId="emma" size={size} />
}

export function ThomasAvatar({ size = 48 }: AvatarProps) {
  return <AgentAvatar agentId="thomas" size={size} />
}

export function NoraAvatar({ size = 48 }: AvatarProps) {
  return <AgentAvatar agentId="nora" size={size} />
}

export function AgentAvatarById({ agentId, size = 48 }: { agentId: string; size?: number }) {
  return <AgentAvatar agentId={agentId} size={size} />
}
