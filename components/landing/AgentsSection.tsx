"use client"

import Link from "next/link"
import { AgentAvatar } from "@/components/agents/AgentAvatar"
import { agents } from "@/components/agents/agentData"
import FadeIn from "@/components/animations/FadeIn"

export default function AgentsSection() {
  return (
    <section id="agents" className="px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <p className="text-zinc-500 text-xs tracking-widest uppercase text-center mb-4">
            Ton équipe
          </p>
        </FadeIn>

        <FadeIn delay={0.05}>
          <h2 className="text-3xl font-semibold tracking-tight leading-tight text-white text-center mb-16">
            6 agents, une seule mission :{" "}
            <span className="text-zinc-400">décrocher ton alternance.</span>
          </h2>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
          {agents.map((agent, i) => (
            <FadeIn key={agent.id} delay={0.06 * i}>
              <Link href={agent.href} className="group flex flex-col gap-4">
                {/* Avatar + name */}
                <div className="flex items-center gap-3">
                  <div className="shrink-0 rounded-full border border-white/[0.06] transition-colors duration-150 group-hover:border-white/[0.12]">
                    <AgentAvatar agentId={agent.id} size={40} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm leading-tight">{agent.name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{agent.role}</p>
                  </div>
                  <div
                    className="shrink-0 size-1.5 rounded-full"
                    style={{ background: agent.status === "active" ? "#22C55E" : "rgba(255,255,255,0.15)" }}
                  />
                </div>

                {/* Description */}
                <p className="text-zinc-500 text-sm leading-relaxed">{agent.description}</p>

                {/* Phrase */}
                <p className="text-xs text-zinc-600 italic group-hover:text-zinc-500 transition-colors duration-150">
                  &ldquo;{agent.phrase}&rdquo;
                </p>
              </Link>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
