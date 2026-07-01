import CVBuilder from "@/components/CVBuilder"
import { AgentChat } from "@/components/shared/AgentChat"

export default function CVPage() {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 lg:px-10 py-10">
      <div className="mb-8">
        <AgentChat
          agentName="Alex" agentEmoji="🎯" agentTitle="Agent CV"
          agentDescription="J'analyse ton CV et l'optimise pour chaque offre. Les recruteurs te remarqueront."
          features={["Optimisation ATS automatique", "Mots-clés manquants détectés", "Export DOCX professionnel"]}
          userMessage="Alex, optimise mon CV pour cette offre Décathlon !"
          agentMessage="Parfait ! Colle ton CV et la fiche de poste, je m'en occupe en 30 secondes."
          accentColor="#3B82F6"
        />
      </div>
      <div className="mb-12" id="main-feature">
        <CVBuilder />
      </div>
    </div>
  )
}
