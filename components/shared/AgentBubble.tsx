"use client"
import { useEffect, useState } from "react"

interface AgentBubbleProps {
  agentName: string
  message: string
  avatarSrc?: string
  emoji?: string
  status?: string
  animated?: boolean
}

export function AgentBubble({
  agentName,
  message,
  avatarSrc,
  emoji = "🤖",
  status = "En ligne",
  animated = true,
}: AgentBubbleProps) {
  const [displayed, setDisplayed] = useState(animated ? "" : message)

  useEffect(() => {
    if (!animated) return
    setDisplayed("")
    let i = 0
    const interval = setInterval(() => {
      setDisplayed(message.slice(0, i + 1))
      i++
      if (i >= message.length) clearInterval(interval)
    }, 22)
    return () => clearInterval(interval)
  }, [message, animated])

  return (
    <div className="inline-flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 backdrop-blur-sm max-w-sm">
      <div className="shrink-0 size-9 rounded-full overflow-hidden ring-1 ring-white/10 flex items-center justify-center bg-white/5 text-base">
        {avatarSrc ? (
          <img src={avatarSrc} alt={agentName} className="w-full h-full object-cover" />
        ) : (
          <span>{emoji}</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[13px] text-white/90 leading-snug">
          {displayed}
          {animated && displayed.length < message.length && (
            <span className="inline-block w-[2px] h-[13px] bg-blue-400 ml-0.5 animate-pulse align-middle" />
          )}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="size-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
          <span className="text-[11px] text-zinc-500">{agentName} · {status}</span>
        </div>
      </div>
    </div>
  )
}
