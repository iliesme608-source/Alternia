/**
 * Guide d'écriture par secteur — partagé par TOUS les générateurs de texte
 * (candidatures, réponses aux offres, prospection, relances, LinkedIn).
 *
 * Un recruteur en cabinet d'avocats et un recruteur en agence de communication
 * ne lisent pas le même message de la même façon : registre, vocabulaire,
 * preuves attendues et clichés rédhibitoires changent d'un monde à l'autre.
 * Ce module donne à Claude les codes du secteur de l'étudiant.
 *
 * Les « références » sont des principes d'écriture tirés de grandes plumes et
 * de praticiens reconnus du domaine. On applique leurs principes ; on ne les
 * cite pas et on ne les pastiche pas dans le message.
 */

export interface SectorVoice {
  key: string
  label: string
  /** Registre et ton attendus par les recruteurs du secteur. */
  ton: string
  /** Vocabulaire métier juste — à employer avec parcimonie, là où c'est naturel. */
  vocabulaire: string[]
  /** Ce qui convainc réellement un recruteur de ce secteur. */
  preuves: string
  /** Comment ancrer l'accroche sur l'entreprise. */
  accroche: string
  /** Formules et clichés qui décrédibilisent immédiatement. */
  eviter: string[]
  /** Principes d'écriture de références du domaine. */
  references: string
}

const VOICES: SectorVoice[] = [
  {
    key: "data",
    label: "Data & IA",
    ton: "Précis, factuel, orienté décision. On parle de questions métier et de ce que la donnée permet de trancher, pas de technologie pour elle-même.",
    vocabulaire: [
      "nettoyage et préparation des données", "requêtes SQL", "tableau de bord", "indicateurs (KPI)",
      "qualité des données", "modélisation", "évaluation d'un modèle", "pipeline de données",
      "visualisation", "aide à la décision",
    ],
    preuves: "Un jeu de données réellement manipulé, la question à laquelle il répondait et l'outil utilisé (SQL, Python, Power BI…) — uniquement s'ils figurent dans le profil.",
    accroche: "Partir de ce que les données de l'entreprise pourraient éclairer dans SON activité (ventes, logistique, clients, production), sans prétendre connaître ses données internes.",
    eviter: ["big data", "l'IA va révolutionner", "data-driven", "passionné par la data", "exploiter la puissance des données"],
    references: "Edward Tufte (la clarté avant l'effet), Hans Rosling (un chiffre raconté vaut mieux qu'un chiffre empilé), Cassie Kozyrkov (toujours partir de la décision à prendre).",
  },
  {
    key: "tech",
    label: "Informatique / Tech",
    ton: "Direct, simple, concret. Les développeurs et CTO détestent le remplissage : on dit ce qu'on a construit, avec quoi, et ce qu'on veut apprendre.",
    vocabulaire: [
      "développement", "API", "déploiement", "tests", "revue de code", "intégration continue",
      "base de données", "architecture", "produit", "expérience utilisateur", "méthode agile",
    ],
    preuves: "Des projets réels (personnels, scolaires, pro) avec la stack exacte et ce que l'étudiant y a fait lui-même. Un lien GitHub ou portfolio s'il est fourni.",
    accroche: "Le produit ou le service de l'entreprise et le type de problème technique que son métier implique — sans inventer sa stack.",
    eviter: ["passionné par les nouvelles technologies", "geek", "touche-à-tout", "maîtrise parfaite", "full-stack expert"],
    references: "Paul Graham (écrire comme on parle, avec des mots simples), Joel Spolsky (parler du travail réel, jamais des buzzwords), la documentation technique de qualité (précision, zéro ambiguïté).",
  },
  {
    key: "commerce",
    label: "Commerce / Marketing",
    ton: "Énergique mais sobre, tourné client et résultats. Le message lui-même doit prouver que l'étudiant sait vendre : bénéfice d'abord, une idée forte, un appel à l'action net.",
    vocabulaire: [
      "prospection", "portefeuille clients", "parcours client", "fidélisation", "acquisition",
      "taux de conversion", "chiffre d'affaires", "négociation", "positionnement", "persona",
      "merchandising", "étude de marché",
    ],
    preuves: "Contact client réel (vente, job étudiant, stage), objectifs atteints ou actions menées, campagnes ou études réalisées — seulement si présents dans le profil.",
    accroche: "La marque, les produits ou la clientèle de l'entreprise et ce que l'étudiant peut apporter à sa relation client ou à sa croissance.",
    eviter: ["fort relationnel", "sens du contact", "dynamique et motivé", "je suis un bon vendeur", "force de proposition"],
    references: "David Ogilvy (le bénéfice pour le lecteur en premier, des faits plutôt que des adjectifs, respecter l'intelligence du lecteur), Seth Godin (court, une seule idée qui marque).",
  },
  {
    key: "finance",
    label: "Finance / Comptabilité",
    ton: "Rigoureux, sobre, mesuré. Aucune exagération : en finance, l'emphase inquiète. Chaque affirmation doit pouvoir être vérifiée.",
    vocabulaire: [
      "clôtures mensuelles", "rapprochements bancaires", "reporting", "contrôle de gestion",
      "budget et prévisions", "analyse des écarts", "consolidation", "trésorerie", "audit",
      "saisie et révision comptable", "fiabilité des données financières",
    ],
    preuves: "Maîtrise d'outils (Excel avancé, ERP, logiciels comptables), matières et projets de la formation, expériences où la fiabilité des chiffres comptait — tels que présents dans le profil.",
    accroche: "Le type de structure (cabinet, groupe, banque, PME) et ses enjeux financiers plausibles : cycle de clôture, pilotage, croissance — sans chiffre inventé.",
    eviter: ["passionné par les chiffres", "à l'aise avec les chiffres", "rigoureux et organisé (sans preuve)", "fort potentiel"],
    references: "Warren Buffett (lettres aux actionnaires : écrire clairement pour un lecteur intelligent, sans jargon inutile), la tradition des rapports d'audit (le fait, la source, pas d'adjectif).",
  },
  {
    key: "rh",
    label: "RH / Management",
    ton: "Humain, posé, professionnel. Chaleureux sans familiarité ; on montre l'écoute et la discrétion par la façon même d'écrire.",
    vocabulaire: [
      "recrutement", "sourcing", "intégration des collaborateurs", "marque employeur",
      "gestion administrative du personnel", "paie", "SIRH", "développement des compétences",
      "relations sociales", "qualité de vie au travail", "entretiens annuels",
    ],
    preuves: "Missions RH ou d'encadrement réelles, associatif, gestion d'équipe ou de projet, outils SIRH — uniquement ceux du profil.",
    accroche: "La taille, la croissance ou le secteur de l'entreprise et ce que cela implique pour ses équipes (recrutements, intégration, organisation).",
    eviter: ["j'aime l'humain", "people person", "le relationnel est mon point fort", "à l'écoute (sans preuve)"],
    references: "Peter Drucker (clarté, le résultat avant la posture), Simon Sinek (commencer par le pourquoi, en une phrase juste).",
  },
  {
    key: "communication",
    label: "Communication / Média",
    ton: "Vivant, rythmé, soigné. Ici le message EST l'échantillon de travail : une vraie accroche, des phrases qui respirent, zéro faute, zéro remplissage.",
    vocabulaire: [
      "ligne éditoriale", "stratégie de contenu", "calendrier éditorial", "réseaux sociaux",
      "relations presse", "communiqué", "brand content", "storytelling", "communauté",
      "engagement", "identité de marque",
    ],
    preuves: "Contenus réellement produits (articles, comptes gérés, vidéos, campagnes scolaires), portfolio s'il est fourni.",
    accroche: "L'univers et le ton de la marque ou du média tels qu'on peut les déduire de son activité — n'invente JAMAIS une campagne ou un contenu précis.",
    eviter: ["créatif et curieux", "à l'aise avec les réseaux sociaux", "passionné de communication", "véritable couteau suisse"],
    references: "William Zinsser (couper chaque mot qui ne travaille pas), Albert Londres (le fait vrai et précis plutôt que l'effet), David Ogilvy (un titre qui donne envie de lire la suite).",
  },
  {
    key: "ingenierie",
    label: "Ingénierie / Industrie",
    ton: "Factuel, technique, structuré. On parle de procédés, de qualité, de sécurité et de délais — le recruteur veut de la méthode, pas de l'enthousiasme.",
    vocabulaire: [
      "amélioration continue", "lean", "qualité (QHSE)", "méthodes", "industrialisation",
      "bureau d'études", "conception (CAO)", "cahier des charges", "analyse de défaillances (AMDEC)",
      "maintenance", "ligne de production", "gestion de projet technique",
    ],
    preuves: "Projets techniques, stages terrain, logiciels métiers (SolidWorks, CATIA, AutoCAD…) présents dans le profil.",
    accroche: "Le métier industriel de l'entreprise (ce qu'elle fabrique, conçoit ou maintient) et un enjeu plausible de production, qualité ou conception.",
    eviter: ["touche-à-tout", "passionné de mécanique depuis toujours", "polyvalent (sans preuve)", "esprit d'ingénieur"],
    references: "Richard Feynman (expliquer simplement, honnêteté sur ce qu'on ne sait pas encore), la rigueur des rapports d'ingénierie (hypothèse, méthode, résultat).",
  },
  {
    key: "sante",
    label: "Santé / Social",
    ton: "Humain, respectueux, éthique, sobre. Aucun pathos, aucune grandiloquence : l'engagement se prouve par le terrain, pas par les mots.",
    vocabulaire: [
      "accompagnement", "prise en charge", "parcours patient", "parcours usager",
      "bientraitance", "travail pluridisciplinaire", "coordination", "protocoles",
      "projet d'établissement", "écoute active",
    ],
    preuves: "Stages, bénévolat, expériences auprès de publics accompagnés, formations spécifiques — tels que dans le profil.",
    accroche: "La mission de la structure et le public qu'elle accompagne, décrits simplement et avec respect.",
    eviter: ["c'est ma vocation", "aider les autres est ma passion", "j'ai toujours voulu", "très empathique"],
    references: "Atul Gawande (précision, humilité, la personne soignée au centre), la sobriété des écrits cliniques (factuel, respectueux).",
  },
  {
    key: "droit",
    label: "Droit / Juridique",
    ton: "Soutenu, précis, concis, rigoureusement correct. Vouvoiement, formules de politesse classiques complètes. Une faute ou une approximation disqualifie.",
    vocabulaire: [
      "veille juridique", "recherches jurisprudentielles", "rédaction d'actes", "contrats",
      "notes de synthèse", "contentieux", "conformité", "due diligence", "droit des affaires",
      "droit social", "protection des données (RGPD)",
    ],
    preuves: "Matières de spécialité, mémoire, clinique juridique, stages en cabinet ou direction juridique — seulement s'ils figurent dans le profil.",
    accroche: "Le domaine d'intervention du cabinet ou de la direction juridique tel qu'il découle de son activité — n'invente aucune affaire ni spécialité.",
    eviter: ["passionné par le droit", "rigoureux (sans preuve)", "je me permets de", "formules familières"],
    references: "Portalis (Discours préliminaire du Code civil : clarté et mesure), Boileau (« ce que l'on conçoit bien s'énonce clairement »), la concision du Code civil que Stendhal relisait pour son style.",
  },
]

const DEFAULT_VOICE: SectorVoice = {
  key: "general",
  label: "Général",
  ton: "Professionnel, clair et naturel. Vouvoiement, phrases courtes, aucune formule creuse.",
  vocabulaire: [],
  preuves: "Les expériences, compétences et outils réellement présents dans le profil.",
  accroche: "L'activité réelle de l'entreprise et ce que le profil peut y apporter concrètement.",
  eviter: ["dynamique et motivé", "votre entreprise dynamique", "je me permets de vous contacter", "n'hésitez pas à"],
  references: "William Zinsser (couper chaque mot inutile), Boileau (« ce que l'on conçoit bien s'énonce clairement »).",
}

function norm(v: string): string {
  return (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

// Ordre important : « Data & IA » avant « Tech », « marketing digital » avant « communication ».
const MATCHERS: { key: string; re: RegExp }[] = [
  { key: "data", re: /\b(data|ia|ai|donnees|intelligence artificielle|machine learning|statistique|bi)\b/ },
  { key: "droit", re: /\b(droit|juridique|juriste|avocat|notari|legal)/ },
  { key: "finance", re: /\b(financ|compta|banque|audit|controle de gestion|gestion de patrimoine|assurance|fiscal|tresorerie)/ },
  { key: "rh", re: /\b(rh|ressources humaines|recrutement|management|paie|talent)/ },
  { key: "commerce", re: /\b(commerc|marketing|vente|vendeur|business developer|achat|e-commerce|retail|immobilier)/ },
  { key: "communication", re: /\b(communication|media|journalis|evenementiel|relations presse|graphis|design|audiovisuel|contenu)/ },
  { key: "sante", re: /\b(sante|social|medical|soin|infirmi|pharma|educat|paramedic)/ },
  { key: "ingenierie", re: /\b(ingenier|industri|mecanique|electri|btp|genie|production|maintenance|qualite|logistique|energie)/ },
  { key: "tech", re: /\b(informatique|tech|developpe|logiciel|web|cyber|reseau|devops|cloud|it)\b/ },
]

/** Voix du secteur à partir d'un libellé libre (secteur, poste visé, secteur d'une offre…). */
export function sectorVoice(...hints: (string | null | undefined)[]): SectorVoice {
  for (const hint of hints) {
    const h = norm(hint ?? "")
    if (!h.trim()) continue
    const hit = MATCHERS.find((m) => m.re.test(h))
    if (hit) return VOICES.find((v) => v.key === hit.key) ?? DEFAULT_VOICE
  }
  return DEFAULT_VOICE
}

/**
 * Règles d'écriture communes — ce qui sépare un message de professionnel d'un
 * message généré.
 */
export const WRITING_CRAFT = `EXIGENCE D'ÉCRITURE (niveau des meilleures plumes professionnelles) :
- Le lecteur d'abord : la première phrase parle de l'entreprise, de son métier ou de la personne — jamais « Je m'appelle… » ni « Je me permets… ».
- L'accroche sur l'entreprise ne s'appuie QUE sur les données fournies (nom, activité / code NAF, taille, ville, scoring). N'invente ni clientèle, ni spécialité, ni projet, ni valeur, ni histoire : une observation juste et modeste vaut mieux qu'un détail inventé.
- Une idée par phrase. Phrases courtes, verbes concrets, pas de subordonnées empilées.
- Montrer plutôt qu'affirmer : remplace chaque qualité (« rigoureux », « motivé ») par un fait réel du profil qui la prouve, ou supprime-la.
- Test de substitution : si le message pouvait partir tel quel à une autre entreprise en changeant seulement le nom, il est raté — réécris l'accroche.
- Le vocabulaire du secteur s'emploie avec justesse : 2 à 4 termes métier là où ils viennent naturellement, jamais une liste de mots-clés plaquée.
- Chaque mot doit travailler : coupe les adverbes (« vivement », « vraiment », « particulièrement »), les redondances et les phrases de remplissage (« Lyon m'attire », « votre entreprise m'intéresse »).
- Aucune autoévaluation flatteuse (« solide maîtrise », « excellentes compétences », « fort potentiel ») : le fait vérifié suffit, le recruteur tire la conclusion.
- Français irréprochable. Jamais d'apposition en tête de phrase dont le sujet diffère de celui de la principale : « Votre cabinet intervenant en droit des affaires, je souhaite… » est FAUX ; écris « Votre cabinet intervient en droit des affaires : … ».
- Ponctuation d'un humain qui écrit un email : JAMAIS de tiret long (—) ni de tiret moyen (–). Utilise un point, une virgule, deux-points ou des parenthèses.
- Pas d'écriture inclusive entre parenthèses (« intéressé(e) ») : reformule sans accord (« Seriez-vous disponible… »).
- La fin demande une chose précise et facile à accepter (un échange de 15 minutes, un appel), jamais « je vous propose de discuter de ma candidature » ni une question fermée qui appelle un non.
- Les références d'écriture ci-dessous sont des PRINCIPES à appliquer : ne les cite pas, ne les nomme pas, ne les pastiche pas dans le message.`

/** Bloc de prompt : codes d'écriture du secteur de l'étudiant. */
export function sectorWritingGuide(...hints: (string | null | undefined)[]): string {
  const v = sectorVoice(...hints)
  const lines = [
    `CODES D'ÉCRITURE DU SECTEUR — ${v.label} :`,
    `- Ton attendu : ${v.ton}`,
  ]
  if (v.vocabulaire.length) {
    lines.push(`- Vocabulaire métier juste (à choisir selon le profil RÉEL, jamais pour prétendre une compétence absente) : ${v.vocabulaire.join(", ")}.`)
  }
  lines.push(
    `- Ce qui convainc un recruteur de ce secteur : ${v.preuves}`,
    `- Accroche : ${v.accroche}`,
    `- Formules à bannir dans ce secteur : ${v.eviter.map((e) => `« ${e} »`).join(", ")}.`,
    `- Références d'écriture du domaine (principes à appliquer) : ${v.references}`,
  )
  return `${lines.join("\n")}\n\n${WRITING_CRAFT}`
}

/**
 * Filet de sécurité : retire les tirets longs qu'un modèle glisserait malgré
 * la consigne. Ils trahissent immédiatement un texte généré.
 * Dans un objet d'email (`subject`), « A — B » devient « A : B » ; ailleurs,
 * une virgule. Un tiret isolé en début de ligne (liste) devient un tiret simple.
 */
export function humanizeDashes(text: string, kind: "subject" | "body" = "body"): string {
  if (!text) return text
  let seen = 0
  return text
    .replace(/^[ \t]*[—–][ \t]*/gm, "- ")
    // Objet : le premier séparateur devient « : », les suivants des virgules.
    .replace(/[ \t]*[—–][ \t]*/g, () => (kind === "subject" && !(seen++) ? " : " : ", "))
}
