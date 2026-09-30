"use client"

import ProspectionBoard from "@/components/ProspectionBoard"
import { AgentChat } from "@/components/shared/AgentChat"

export default function ProspectionPage() {
  return (
    <div className="w-full max-w-7xl mx-auto px-6 lg:px-10 py-10">
      <div className="mb-8">
        <AgentChat
          agentName="Sarah" agentEmoji="🚀" agentTitle="Agent Prospection"
          agentDescription="Je trouve les entreprises qui correspondent à ton profil, même celles qui ne publient pas d'offres."
          features={["Données SIRENE officielles", "Emails personnalisés", "Suivi des réponses"]}
          userMessage="Sarah, trouve-moi des entreprises en Data à Paris !"
          agentMessage="Je lance la recherche ! Je cible les PME qui ont déjà recruté des alternants dans ce secteur."
          accentColor="#0D9488"
        />
      </div>
      <div className="mb-12" id="main-feature">
        <ProspectionBoard />
      </div>
    </div>
  )
}
