"use client"

import { motion } from "framer-motion"
import AgentBubble from "@/components/AgentBubble"

interface AgentBannerProps {
  agentId: string
  agentName: string
  message: string
  ctaLabel: string
  targetId: string
}

export default function AgentBanner({ agentId, agentName, message, ctaLabel, targetId }: AgentBannerProps) {
  function scrollToFeature() {
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="flex flex-col items-start gap-3 mb-8 max-w-xs sm:max-w-sm"
    >
      <AgentBubble
        agentId={agentId}
        agentName={agentName}
        message={message}
        animDelay={0}
        typewrite
      />
      <button
        onClick={scrollToFeature}
        className="ml-12 text-xs font-medium px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[#94A3B8] hover:text-white hover:bg-white/[0.10] transition-all duration-200"
      >
        {ctaLabel}
      </button>
    </motion.div>
  )
}
