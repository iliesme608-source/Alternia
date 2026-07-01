interface AvatarProps {
  size?: number
}

export function AlexAvatar({ size = 48 }: AvatarProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* background */}
      <circle cx="24" cy="24" r="22" fill="rgba(59,130,246,0.15)"/>
      {/* hair back */}
      <ellipse cx="24" cy="21" rx="12" ry="12.5" fill="#1E3A5F"/>
      {/* face */}
      <ellipse cx="24" cy="27" rx="10.5" ry="11.5" fill="#FDDBB4"/>
      {/* hair front */}
      <path d="M13.5 21 Q14 10 24 9.5 Q34 10 34.5 21 Q30 17 24 17.5 Q18 17 13.5 21Z" fill="#1E3A5F"/>
      {/* glasses left */}
      <rect x="14.5" y="24" width="6.5" height="4.5" rx="2.2" stroke="rgba(255,255,255,0.55)" strokeWidth="1" fill="rgba(147,197,253,0.12)"/>
      {/* glasses right */}
      <rect x="27" y="24" width="6.5" height="4.5" rx="2.2" stroke="rgba(255,255,255,0.55)" strokeWidth="1" fill="rgba(147,197,253,0.12)"/>
      {/* glasses bridge */}
      <line x1="21" y1="26.2" x2="27" y2="26.2" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9"/>
      {/* eyes */}
      <circle cx="17.7" cy="26.3" r="1.3" fill="#1E293B"/>
      <circle cx="30.3" cy="26.3" r="1.3" fill="#1E293B"/>
      <circle cx="18.2" cy="25.8" r="0.45" fill="white"/>
      <circle cx="30.8" cy="25.8" r="0.45" fill="white"/>
      {/* smile */}
      <path d="M21.5 32 Q24 34 26.5 32" stroke="#C8956A" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

export function SarahAvatar({ size = 48 }: AvatarProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* background */}
      <circle cx="24" cy="24" r="22" fill="rgba(34,211,238,0.13)"/>
      {/* hair back long */}
      <ellipse cx="24" cy="27" rx="13.5" ry="17" fill="#5B21B6"/>
      {/* face */}
      <ellipse cx="24" cy="25" rx="10.5" ry="11.5" fill="#FDDBB4"/>
      {/* hair top */}
      <path d="M13.5 22 Q14 9.5 24 9 Q34 9.5 34.5 22 Q31 17 24 17 Q17 17 13.5 22Z" fill="#5B21B6"/>
      {/* eyes */}
      <circle cx="19.5" cy="23.5" r="1.45" fill="#1E293B"/>
      <circle cx="28.5" cy="23.5" r="1.45" fill="#1E293B"/>
      <circle cx="20.1" cy="23" r="0.5" fill="white"/>
      <circle cx="29.1" cy="23" r="0.5" fill="white"/>
      {/* smile */}
      <path d="M21 29 Q24 31.5 27 29" stroke="#C8956A" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      {/* earring */}
      <circle cx="34.5" cy="26.5" r="1.3" fill="rgba(34,211,238,0.85)"/>
    </svg>
  )
}

export function LucasAvatar({ size = 48 }: AvatarProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* background */}
      <circle cx="24" cy="24" r="22" fill="rgba(96,165,250,0.13)"/>
      {/* hair */}
      <circle cx="24" cy="20" r="12" fill="#1C1C3A"/>
      {/* face */}
      <ellipse cx="24" cy="27" rx="10.5" ry="11.5" fill="#FDDBB4"/>
      {/* hair top slight texture */}
      <path d="M13.5 20 Q14 8.5 24 8 Q34 8.5 34.5 20 Q31 15 27 14 Q24 13.5 21 14 Q17 15 13.5 20Z" fill="#1C1C3A"/>
      {/* eyes */}
      <circle cx="19.5" cy="25.5" r="1.5" fill="#1E293B"/>
      <circle cx="28.5" cy="25.5" r="1.5" fill="#1E293B"/>
      <circle cx="20.2" cy="25" r="0.52" fill="white"/>
      <circle cx="29.2" cy="25" r="0.52" fill="white"/>
      {/* big confident smile */}
      <path d="M20.5 30.5 Q24 33.5 27.5 30.5" stroke="#C8956A" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
      {/* subtle stubble */}
      <ellipse cx="24" cy="34" rx="5" ry="1.5" fill="rgba(28,28,58,0.2)"/>
    </svg>
  )
}

export function EmmaAvatar({ size = 48 }: AvatarProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* background */}
      <circle cx="24" cy="24" r="22" fill="rgba(52,211,153,0.13)"/>
      {/* hair bob back */}
      <path d="M11.5 28 Q11.5 11.5 24 11 Q36.5 11.5 36.5 28 Q34.5 33 24 34 Q13.5 33 11.5 28Z" fill="#0F172A"/>
      {/* face */}
      <ellipse cx="24" cy="26" rx="10.5" ry="11.5" fill="#FDDBB4"/>
      {/* bob front cap */}
      <path d="M13.5 22 Q14 12 24 11.5 Q34 12 34.5 22 Q30.5 18 24 18.5 Q17.5 18 13.5 22Z" fill="#0F172A"/>
      {/* eyes */}
      <circle cx="19.5" cy="24.5" r="1.45" fill="#1E293B"/>
      <circle cx="28.5" cy="24.5" r="1.45" fill="#1E293B"/>
      <circle cx="20.1" cy="24" r="0.5" fill="white"/>
      <circle cx="29.1" cy="24" r="0.5" fill="white"/>
      {/* smile */}
      <path d="M21 30 Q24 32.5 27 30" stroke="#C8956A" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

export function ThomasAvatar({ size = 48 }: AvatarProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* background */}
      <circle cx="24" cy="24" r="22" fill="rgba(129,140,248,0.13)"/>
      {/* hair */}
      <circle cx="24" cy="20.5" r="12" fill="#1E3A5F"/>
      {/* face */}
      <ellipse cx="24" cy="27.5" rx="10.5" ry="11.5" fill="#FDDBB4"/>
      {/* hair top neat side part */}
      <path d="M13.5 20 Q14 9.5 24 9 Q34 9.5 34.5 20 Q30 16 24 17 Q18 16 13.5 20Z" fill="#1E3A5F"/>
      {/* side part */}
      <path d="M24 9.5 Q23.5 12 22.5 17" stroke="rgba(255,255,255,0.12)" strokeWidth="0.9" fill="none" strokeLinecap="round"/>
      {/* eyes */}
      <circle cx="19.5" cy="26" r="1.45" fill="#1E293B"/>
      <circle cx="28.5" cy="26" r="1.45" fill="#1E293B"/>
      <circle cx="20.1" cy="25.5" r="0.5" fill="white"/>
      <circle cx="29.1" cy="25.5" r="0.5" fill="white"/>
      {/* neutral smile */}
      <path d="M21.5 31 Q24 33 26.5 31" stroke="#C8956A" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

export function NoraAvatar({ size = 48 }: AvatarProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* background */}
      <circle cx="24" cy="24" r="22" fill="rgba(167,139,250,0.13)"/>
      {/* hair long back */}
      <ellipse cx="24" cy="27" rx="14" ry="17.5" fill="#1E1B4B"/>
      {/* face */}
      <ellipse cx="24" cy="25" rx="10.5" ry="11.5" fill="#F5CBA7"/>
      {/* hair top */}
      <path d="M13.5 22 Q14 8.5 24 8 Q34 8.5 34.5 22 Q31 15 24 15 Q17 15 13.5 22Z" fill="#1E1B4B"/>
      {/* eyes */}
      <circle cx="19.5" cy="23.5" r="1.45" fill="#1E293B"/>
      <circle cx="28.5" cy="23.5" r="1.45" fill="#1E293B"/>
      <circle cx="20.1" cy="23" r="0.5" fill="white"/>
      <circle cx="29.1" cy="23" r="0.5" fill="white"/>
      {/* warm wise smile */}
      <path d="M21 29 Q24 32 27 29" stroke="#B07850" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

export function AgentAvatarById({ agentId, size = 48 }: { agentId: string; size?: number }) {
  switch (agentId) {
    case "alex":   return <AlexAvatar size={size} />
    case "sarah":  return <SarahAvatar size={size} />
    case "lucas":  return <LucasAvatar size={size} />
    case "emma":   return <EmmaAvatar size={size} />
    case "thomas": return <ThomasAvatar size={size} />
    case "nora":   return <NoraAvatar size={size} />
    default:       return <AlexAvatar size={size} />
  }
}
