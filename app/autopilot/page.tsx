"use client"

import { AgentAvatar } from "@/components/agents/AgentAvatar"
import AutopilotWizard from "@/components/autopilot/AutopilotWizard"

export default function AutopilotPage() {
  return (
    <div className="w-full max-w-5xl mx-auto px-6 lg:px-10 py-10">
      {/* En-tête — promesse + Sarah */}
      <div className="mb-8">
        <div className="flex items-start gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 backdrop-blur-md sm:p-6">
          <AgentAvatar agentId="sarah" size={64} />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold sm:text-2xl">
              Sarah prépare tes candidatures d&apos;alternance à ta place.
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Ajoute ton CV, indique ton alternance cible, et Alternia génère des candidatures
              personnalisées prêtes à envoyer.
            </p>
            <p className="mt-3 text-sm text-[#2DD4BF]">
              « Je trouve les entreprises, je prépare les candidatures, tu valides avant envoi. »
            </p>
            <span className="mt-2 inline-block text-xs font-medium text-muted-foreground">
              Sarah — Agent candidature
            </span>
          </div>
        </div>
      </div>

      <AutopilotWizard />
    </div>
  )
}
