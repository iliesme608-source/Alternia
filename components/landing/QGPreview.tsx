"use client"

import { motion } from "framer-motion"
import { AgentAvatarById } from "@/components/agents/AgentAvatars"
import { CheckCircle, Circle, Zap } from "lucide-react"

const bubbles = [
  { agentId: "alex", name: "Alex", message: "Ton CV est prêt à 82%.", accent: "#3B82F6", delay: 0.6 },
  { agentId: "sarah", name: "Sarah", message: "J'ai trouvé 14 entreprises.", accent: "#22D3EE", delay: 0.9 },
  { agentId: "lucas", name: "Lucas", message: "Prêt pour une simulation ?", accent: "#60A5FA", delay: 1.2 },
]

const missions = [
  { label: "Analyser un CV", done: true },
  { label: "Envoyer 3 candidatures", done: false },
  { label: "Simuler un entretien", done: false },
]

export default function QGPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full max-w-[480px] mx-auto lg:mx-0"
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl -z-10 blur-3xl"
        style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.18) 0%, rgba(34,211,238,0.08) 50%, transparent 70%)" }}
      />

      {/* Window chrome */}
      <div
        className="rounded-3xl overflow-hidden border"
        style={{
          background: "#0B1628",
          borderColor: "rgba(255,255,255,0.09)",
          boxShadow: "0 0 80px rgba(59,130,246,0.22), 0 0 200px rgba(34,211,238,0.08), 0 40px 80px rgba(0,0,0,0.5)",
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ background: "#111C2F", borderColor: "rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#34D399]" />
            <span className="text-xs font-semibold text-white tracking-tight">Ton QG Alternance</span>
          </div>
          <div className="flex gap-1.5">
            <div className="size-2.5 rounded-full bg-white/10" />
            <div className="size-2.5 rounded-full bg-white/10" />
            <div className="size-2.5 rounded-full bg-white/10" />
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Bonjour Iliès 👋</p>
              <p className="text-xs text-[#94A3B8] mt-0.5">Ton équipe est prête.</p>
            </div>
            {/* XP badge */}
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.22)" }}
            >
              <Zap className="size-3 text-[#3B82F6]" />
              <span className="text-xs font-semibold text-[#93C5FD]">Niv. 3</span>
            </div>
          </div>

          {/* XP bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-[#94A3B8]">Chasseur d'alternance</span>
              <span className="text-[10px] text-[#94A3B8]">830 / 1000 XP</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "83%" }}
                transition={{ duration: 1.4, delay: 1.0, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, #3B82F6, #22D3EE)" }}
              />
            </div>
          </div>

          {/* Agent bubbles — Limova mini style */}
          <div className="space-y-2.5">
            {bubbles.map((b, idx) => (
              <motion.div
                key={b.agentId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0, y: [0, -4, 0] }}
                transition={{
                  opacity: { duration: 0.5, delay: b.delay },
                  x: { duration: 0.5, delay: b.delay, ease: [0.16, 1, 0.3, 1] },
                  y: { duration: 2.8, delay: b.delay + 0.6, repeat: Infinity, ease: "easeInOut", repeatDelay: idx * 0.3 },
                }}
                className="flex items-end gap-2"
              >
                <div
                  className="shrink-0 flex size-6 items-center justify-center rounded-full"
                  style={{ background: b.accent + "20", border: `1px solid ${b.accent}35` }}
                >
                  <AgentAvatarById agentId={b.agentId} size={15} />
                </div>
                <div
                  className="relative flex-1 px-2.5 py-1.5 cursor-pointer transition-transform active:scale-[0.97]"
                  style={{
                    background: "#272727",
                    borderRadius: "14px",
                  }}
                >
                  <p className="text-[10px] font-semibold text-white mb-0.5">{b.name}</p>
                  <p className="text-[10px] text-white/70 leading-snug">{b.message}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[9px] font-medium" style={{ color: b.accent }}>{b.name}</span>
                    <span className="text-[8px] text-white/20">·</span>
                    <span className="text-[9px] text-[#34D399]">En ligne</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Missions */}
          <div
            className="rounded-2xl p-3"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[10px] font-semibold text-white uppercase tracking-wider">Missions du jour</p>
              <span className="text-[10px] text-[#94A3B8]">1/3</span>
            </div>
            <div className="space-y-1.5">
              {missions.map((m) => (
                <div key={m.label} className="flex items-center gap-2">
                  {m.done
                    ? <CheckCircle className="size-3.5 text-[#34D399] shrink-0" />
                    : <Circle className="size-3.5 text-white/20 shrink-0" />
                  }
                  <span className={`text-[11px] ${m.done ? "text-[#94A3B8] line-through" : "text-white/75"}`}>
                    {m.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
