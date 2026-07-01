"use client"
import { useEffect, useState } from "react"

interface AgentChatProps {
  agentName: string
  agentEmoji: string
  agentTitle: string
  agentDescription: string
  features: string[]
  userMessage: string
  agentMessage: string
  accentColor?: string
}

export function AgentChat({
  agentName,
  agentEmoji,
  agentTitle,
  agentDescription,
  features,
  userMessage,
  agentMessage,
  accentColor = "#3B82F6"
}: AgentChatProps) {
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
    <div className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2">

        {/* GAUCHE — Zone chat */}
        <div className="p-5 flex flex-col gap-3 border-r border-white/[0.06]">
          {/* Bulle utilisateur */}
          <div className="self-end max-w-[85%] bg-blue-600 text-white text-[13px] leading-relaxed px-4 py-2.5 rounded-2xl rounded-br-[4px]">
            {userMessage}
          </div>
          {/* Bulle agent */}
          <div className="self-start max-w-[85%] flex flex-col gap-2">
            <div className="bg-zinc-900 border border-white/5 text-zinc-300 text-[13px] leading-relaxed px-4 py-2.5 rounded-2xl rounded-bl-[4px]">
              {displayed}
              {displayed.length < agentMessage.length && (
                <span className="inline-block w-[2px] h-[12px] bg-blue-500 ml-0.5 animate-pulse align-middle" />
              )}
            </div>
            {/* Avatar + nom sous la bulle agent */}
            <div className="flex items-center gap-2 pl-1">
              <div className="size-5 rounded-full bg-[#1C1C1E] border border-white/[0.06] flex items-center justify-center text-xs">
                {agentEmoji}
              </div>
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
            <div
              className="size-12 rounded-xl flex items-center justify-center text-xl shrink-0 border border-white/[0.06]"
              style={{ background: "#09090B" }}
            >
              {agentEmoji}
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
              <div key={f} className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-[#09090B] px-3 py-2">
                <div className="size-3.5 rounded-full flex items-center justify-center shrink-0 border border-white/[0.06]">
                  <div className="size-1.5 rounded-full bg-blue-500" />
                </div>
                <span className="text-[12px] text-zinc-400">{f}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
