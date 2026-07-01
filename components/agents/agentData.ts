export type AgentStatus = "active" | "idle"

export interface Agent {
  id: string
  name: string
  role: string
  tagline: string
  phrase: string
  bubble: string
  description: string
  href: string
  status: AgentStatus
  accentColor: string
}

export const agents: Agent[] = [
  {
    id: "alex",
    name: "Alex",
    role: "Agent CV",
    tagline: "Optimisation ATS",
    phrase: "Je rends ton CV impossible à ignorer.",
    bubble: "J'ai repéré 8 mots-clés ATS à ajouter à ton CV.",
    description: "Analyse ton CV, identifie les mots-clés manquants et l'adapte à chaque offre pour maximiser ton score ATS.",
    href: "/cv",
    status: "active",
    accentColor: "#3B82F6",
  },
  {
    id: "sarah",
    name: "Sarah",
    role: "Agent Prospection",
    tagline: "Recherche d'entreprises",
    phrase: "Je trouve les entreprises avant qu'elles publient leurs offres.",
    bubble: "J'ai trouvé 12 entreprises intéressantes en Île-de-France.",
    description: "Détecte des entreprises qui recrutent, identifie des opportunités cachées et génère des candidatures spontanées sur mesure.",
    href: "/prospection",
    status: "active",
    accentColor: "#22D3EE",
  },
  {
    id: "lucas",
    name: "Lucas",
    role: "Coach Entretien",
    tagline: "Simulation & feedback",
    phrase: "Je t'entraîne jusqu'à ce que tu sois prêt.",
    bubble: "On peut faire un entretien de 10 minutes aujourd'hui.",
    description: "Simulations d'entretien réalistes avec feedback instantané, analyse de tes réponses et conseils personnalisés.",
    href: "/entretien",
    status: "idle",
    accentColor: "#60A5FA",
  },
  {
    id: "emma",
    name: "Emma",
    role: "Agent Organisation",
    tagline: "Suivi des candidatures",
    phrase: "Je garde ta recherche sous contrôle.",
    bubble: "Tu as 3 relances à envoyer cette semaine.",
    description: "Centralise toutes tes candidatures, programme des relances intelligentes et visualise ta progression en temps réel.",
    href: "/dashboard",
    status: "idle",
    accentColor: "#34D399",
  },
  {
    id: "thomas",
    name: "Thomas",
    role: "Agent LinkedIn",
    tagline: "Présence professionnelle",
    phrase: "Je rends ton profil visible auprès des recruteurs.",
    bubble: "Ton profil LinkedIn peut atteindre 3x plus de recruteurs.",
    description: "Optimise ton profil LinkedIn, rédige des messages de networking percutants et renforce ta visibilité auprès des recruteurs.",
    href: "/dashboard",
    status: "idle",
    accentColor: "#818CF8",
  },
  {
    id: "nora",
    name: "Nora",
    role: "Coach Carrière",
    tagline: "Stratégie & orientation",
    phrase: "Je t'aide à choisir la bonne direction.",
    bubble: "On a identifié 3 secteurs qui correspondent à ton profil.",
    description: "Aide à définir ta trajectoire, affine ton projet professionnel et construit avec toi un plan d'action concret.",
    href: "/dashboard",
    status: "idle",
    accentColor: "#A78BFA",
  },
]
