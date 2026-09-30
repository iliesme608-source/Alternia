"use client"

import { AgentAvatar } from "@/components/agents/AgentAvatar"
import AutopilotWizard from "@/components/autopilot/AutopilotWizard"

export default function AutopilotPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 lg:px-10">
      {/* En-tête — promesse + Sarah */}
      <div className="mb-8 animate-fade-up">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 backdrop-blur-md sm:p-6">
          {/* Halo discret : donne de la profondeur au bandeau sans alourdir le fond. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 size-56 rounded-full bg-[#3B82F6]/20 blur-3xl"
          />
          <div className="relative flex items-start gap-4">
            <AgentAvatar agentId="sarah" size={64} />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold sm:text-2xl">
                Sarah prépare tes candidatures d&apos;alternance à ta place.
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                Ajoute ton CV, indique ton alternance cible, et Alternia génère des candidatures
                personnalisées prêtes à envoyer.
              </p>
              <p className="mt-3 text-sm text-[#2DD4BF]">
                « Je trouve les entreprises et les décideurs, je prépare les candidatures, tu
                valides avant envoi — ou tu me laisses démarcher pendant la nuit. »
              </p>
              <span className="mt-2 inline-block text-xs font-medium text-muted-foreground">
                Sarah — Agent candidature
              </span>
            </div>
          </div>
        </div>
      </div>

      <AutopilotWizard />
    </div>
  )
}
