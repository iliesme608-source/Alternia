"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { AgentAvatarById } from "@/components/agents/AgentAvatars"

interface AgentBubbleProps {
  agentId: string
  agentName: string
  message: string
  accentColor?: string
  animDelay?: number
  typewrite?: boolean
}

const defaultAccents: Record<string, string> = {
  alex:   "#3B82F6",
  sarah:  "#22D3EE",
  lucas:  "#60A5FA",
  emma:   "#34D399",
  thomas: "#818CF8",
  nora:   "#A78BFA",
}

export default function AgentBubble({
  agentId,
  agentName,
  message,
  accentColor,
  animDelay = 0,
  typewrite = true,
}: AgentBubbleProps) {
  const accent = accentColor ?? defaultAccents[agentId] ?? "#3B82F6"
  const [displayed, setDisplayed] = useState(typewrite ? "" : message)
  const [done, setDone] = useState(!typewrite)

  useEffect(() => {
    if (!typewrite) { setDisplayed(message); setDone(true); return }
    setDisplayed(""); setDone(false)
    let i = 0
    let iv: number
    const t = window.setTimeout(() => {
      iv = window.setInterval(() => {
        i++
        setDisplayed(message.slice(0, i))
        if (i >= message.length) { setDone(true); clearInterval(iv) }
      }, 22)
    }, animDelay * 1000 + 350)
    return () => { clearTimeout(t); clearInterval(iv) }
  }, [message, animDelay, typewrite])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: animDelay }}
      className="flex items-end gap-3 max-w-sm w-full"
    >
      <div
        className="shrink-0 flex size-9 items-center justify-center rounded-full"
        style={{ background: accent + "20", border: `1px solid ${accent}35` }}
      >
        <AgentAvatarById agentId={agentId} size={24} />
      </div>

      <motion.div
        className="agent-bubble-limova relative flex-1"
        whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
        whileHover={{ backgroundColor: "#2e2e2e", transition: { duration: 0.15 } }}
      >
        <p className="text-white text-[13px] leading-relaxed">
          {displayed}
          {!done && (
            <span
              className="ml-0.5 inline-block w-[2px] h-[13px] align-middle animate-pulse"
              style={{ background: accent }}
            />
          )}
        </p>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[11px] font-semibold" style={{ color: accent }}>
            {agentName}
          </span>
          <span className="text-[10px] text-white/25">·</span>
          <span className="text-[10px] text-[#34D399] font-medium">En ligne</span>
        </div>
      </motion.div>
    </motion.div>
  )
}
