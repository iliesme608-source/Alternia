"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { Agent } from "./agentData"
import { AgentAvatarById } from "./AgentAvatars"

interface AgentCardProps {
  agent: Agent
}

export default function AgentCard({ agent }: AgentCardProps) {
  const [displayed, setDisplayed] = useState("")
  const [done, setDone] = useState(false)

  useEffect(() => {
    setDisplayed(""); setDone(false)
    let i = 0
    const iv = setInterval(() => {
      i++
      setDisplayed(agent.bubble.slice(0, i))
      if (i >= agent.bubble.length) { setDone(true); clearInterval(iv) }
    }, 22)
    return () => clearInterval(iv)
  }, [agent.bubble])

  return (
    <div className="surface p-8 sm:p-10 flex flex-col sm:flex-row gap-8 items-start">
      {/* Avatar */}
      <div
        className="shrink-0 flex size-16 items-center justify-center rounded-2xl"
        style={{
          background: agent.accentColor + "18",
          border: `1px solid ${agent.accentColor}28`,
        }}
      >
        <AgentAvatarById agentId={agent.id} size={44} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[#94A3B8] text-xs tracking-widest uppercase mb-1.5">{agent.role}</p>
        <h3 className="text-white text-2xl font-bold tracking-tight mb-1 leading-tight">
          {agent.name}
        </h3>
        <p className="text-sm font-medium mb-5" style={{ color: agent.accentColor }}>
          &ldquo;{agent.phrase}&rdquo;
        </p>

        {/* Limova bubble */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
          whileHover={{ backgroundColor: "#2e2e2e", transition: { duration: 0.15 } }}
          className="agent-bubble-limova relative mb-6 max-w-md cursor-pointer"
        >
          <p className="text-white text-[13px] leading-relaxed">
            {displayed}
            {!done && (
              <span
                className="ml-0.5 inline-block w-[2px] h-[13px] align-middle animate-pulse"
                style={{ background: agent.accentColor }}
              />
            )}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-[11px] font-semibold" style={{ color: agent.accentColor }}>
              {agent.name}
            </span>
            <span className="text-[10px] text-white/25">·</span>
            <span className="text-[10px] text-[#34D399] font-medium">En ligne</span>
          </div>
        </motion.div>

        <p className="text-[#94A3B8] leading-relaxed text-sm max-w-lg mb-8">
          {agent.description}
        </p>

        <Link
          href={agent.href}
          className="pill-btn pill-btn-primary"
          style={{
            background: `linear-gradient(135deg, ${agent.accentColor}, ${agent.accentColor}CC)`,
            boxShadow: `0 12px 32px ${agent.accentColor}25`,
          }}
        >
          Lancer {agent.name}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 shrink-0 self-start pt-1">
        <div
          className="size-1.5 rounded-full"
          style={{ background: agent.status === "active" ? "#34D399" : "rgba(255,255,255,0.2)" }}
        />
        <span className="text-[#94A3B8] text-xs">
          {agent.status === "active" ? "Actif" : "Disponible"}
        </span>
      </div>
    </div>
  )
}
