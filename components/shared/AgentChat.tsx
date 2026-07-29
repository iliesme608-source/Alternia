"use client"
import { useEffect, useState } from "react"
import { AgentAvatar } from "@/components/agents/AgentAvatar"

interface AgentChatProps {
  agentName: string
  agentEmoji: string
  agentTitle: string
  agentDescription: string
  features: string[]
  userMessage: string
  agentMessage: string
  accentColor?: string
  agentId?: string
}

export function AgentChat({
  agentName,
  agentEmoji,
  agentTitle,
  agentDescription,
  features,
  userMessage,
  agentMessage,
  accentColor = "#3B82F6",
  agentId
}: AgentChatProps) {
  const resolvedAgentId = agentId ?? agentName.toLowerCase()
  const [displayed, setDisplayed] = useState("")

  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      setDisplayed(agentMessage.slice(0, ++i))
      if (i >= agentMessage.length) clearInterval(id)
    }, 18)
    return () => clearInterval(id)
  }, [agentMessage])

  return (
    <div className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden backdrop-blur-sm shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)]">
      <div className="grid grid-cols-1 md:grid-cols-2">

        {/* GAUCHE — Zone chat */}
        <div className="p-5 flex flex-col gap-3 border-r border-white/[0.06]">
          {/* Bulle utilisateur */}
          <div className="self-end max-w-[85%] text-white text-[13px] leading-relaxed px-4 py-3 rounded-[20px] rounded-br-[6px] shadow-[0_6px_18px_-6px_rgba(37,99,235,0.55)] bg-gradient-to-br from-blue-500 to-blue-700">
            {userMessage}
          </div>
          {/* Bulle agent */}
          <div className="self-start max-w-[85%] flex flex-col gap-2">
            <div className="bg-white/[0.04] border border-white/[0.07] text-zinc-200 text-[13px] leading-relaxed px-4 py-3 rounded-[20px] rounded-bl-[6px] shadow-[0_6px_18px_-8px_rgba(0,0,0,0.7)]">
              {displayed}
              {displayed.length < agentMessage.length && (
                <span className="inline-block w-[2px] h-[12px] bg-blue-400 ml-0.5 animate-pulse align-middle" />
              )}
            </div>
            {/* Avatar + nom sous la bulle agent */}
            <div className="flex items-center gap-2 pl-1">
              <AgentAvatar agentId={resolvedAgentId} size={40} />
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500 inline-block" />
                <span className="text-[11px] text-blue-400">{agentName} · En ligne</span>
              </div>
            </div>
          </div>
        </div>

        {/* DROITE — Info agent */}
        <div className="p-5 flex flex-col gap-4">
          {/* Header agent */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center shrink-0">
              <AgentAvatar agentId={resolvedAgentId} size={40} />
            </div>
            <div>
              <p className="text-xs text-zinc-600 mb-0.5">Découvrez</p>
              <h3 className="text-white font-medium text-base">{agentName}</h3>
              <p className="text-zinc-500 text-xs">{agentTitle}</p>
            </div>
          </div>
          {/* Description */}
          <p className="text-zinc-500 text-[13px] leading-relaxed">{agentDescription}</p>
          {/* Features */}
          <div className="flex flex-col gap-2">
            {features.map((f) => (
              <div key={f} className="flex items-center gap-2.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-4 py-2 transition-colors hover:bg-white/[0.05]">
                <div className="size-4 rounded-full flex items-center justify-center shrink-0" style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}55` }}>
                  <div className="size-1.5 rounded-full" style={{ background: accentColor }} />
                </div>
                <span className="text-[12px] text-zinc-300">{f}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
