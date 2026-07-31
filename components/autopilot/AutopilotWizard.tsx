"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { AgentAvatar } from "@/components/agents/AgentAvatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Sparkles, Building2, MapPin, Users, Copy, Check, ChevronRight, ArrowLeft,
  Loader2, ShieldCheck, FileText, Mail, MessageSquare, Send, Archive, AlertTriangle,
  LogIn, ClipboardList, RefreshCw, Target, ExternalLink, BadgeCheck, Info,
} from "lucide-react"
import { EnvoiEmailModal } from "@/components/shared/EnvoiEmailModal"
import { gmailUrl } from "@/lib/suivi"
import type { ApplicationStatus, CompanyPriority } from "@/types"

// ── Constantes ─────────────────────────────────────────────────────────────────

const SECTEURS = [
  "Informatique / Tech", "Data & IA", "Commerce / Marketing", "Finance / Comptabilité",
  "RH / Management", "Communication / Média", "Ingénierie / Industrie",
  "Santé / Social", "Droit / Juridique",
]
const NIVEAUX = ["BTS", "BUT", "Bachelor", "Licence", "Master 1", "Master 2", "Master", "Autre"]
const CONTRATS = [
  { value: "apprentissage", label: "Apprentissage" },
  { value: "professionnalisation", label: "Professionnalisation" },
  { value: "les_deux", label: "Les deux" },
]
const NB_OPTIONS = [5, 10, 20]

// Profil de démonstration — pré-remplit l'étape 1 en un clic, rien n'est sauvegardé.
// `date_debut` est au format "YYYY-MM" : l'input est un sélecteur de mois.
const OBJECTIF_DEMO: Objective = {
  poste: "Data Analyst",
  secteur: "Data & IA",
  region: "Île-de-France",
  ville: "Paris",
  niveau: "Master 1",
  rythme: "3 jours entreprise / 2 jours école",
  date_debut: "2026-09",
  duree: "24 mois",
  type_contrat: "les_deux",
  nombre_candidatures: 10,
}

const STEPS = [
  { n: 1, label: "Profil" },
  { n: 2, label: "CV maître" },
  { n: 3, label: "Entreprises" },
  { n: 4, label: "Candidatures" },
  { n: 5, label: "Suivi" },
]

// Statut de suivi par entreprise (persisté dans company_targets.tracking_status).
const TRACKING_STATUSES = [
  { value: "a_contacter", label: "À contacter" },
  { value: "contactee", label: "Contactée" },
  { value: "reponse_recue", label: "Réponse reçue" },
  { value: "entretien", label: "Entretien" },
] as const
type TrackingStatus = (typeof TRACKING_STATUSES)[number]["value"]

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  ready: "Prête", sent: "Envoyée", follow_up: "Relance à faire",
  interview: "Entretien", rejected: "Refus", accepted: "Accepté", archived: "Archivée",
}
const SUIVI_COLUMNS: ApplicationStatus[] = ["ready", "sent", "follow_up", "interview", "rejected", "accepted", "archived"]

// Intitulés par lesquels le scoring signale qu'aucun poste ne correspond. Le même
// filtre existe côté serveur (lib/autopilot) ; on le rejoue ici car les entreprises
// remontées par /search-companies peuvent porter un possible_role hérité d'un
// scoring précédent.
const NON_VIABLE = [
  "pas viable", "inadapté", "incertain", "non applicable", "aucun rôle",
  "taille insuffisante", "structure trop petite", "secteur non",
]

/** Écarte les entreprises dont le poste possible est marqué non viable. */
function filterViable(list: Company[]): Company[] {
  return list.filter((c) => {
    const role = (c.possible_role ?? "").toLowerCase()
    return !NON_VIABLE.some((term) => role.includes(term))
  })
}

// ── Types locaux ───────────────────────────────────────────────────────────────

interface Objective {
  poste: string; secteur: string; region: string; ville: string
  niveau: string; rythme: string; date_debut: string; duree: string
  type_contrat: string; nombre_candidatures: number
}

interface ExtractedProfile {
  verified_experiences: { poste: string; entreprise: string; periode: string; description: string }[]
  verified_skills: string[]
  education: { diplome: string; etablissement: string; annee: string }[]
  tools: string[]
  target_roles: string[]
  constraints: Record<string, unknown>
}

interface Company {
  id?: string | null                 // id Supabase — peut manquer si la ligne n'a pas été persistée
  company_target_id?: string | null  // fallback de nommage possible côté API
  company_name: string
  siren?: string | null
  siret?: string | null
  naf_code?: string | null
  source?: string | null
  city: string | null
  region: string | null
  sector: string | null
  employee_range: string | null
  match_score: number | null
  match_reason: string
  priority: CompanyPriority | null
  recommended_angle: string
  possible_role: string
  tracking_status?: TrackingStatus | null
}

interface AppItem {
  id: string | null
  company_target_id: string
  company_name: string
  status: ApplicationStatus
  email_subject?: string
  email_body?: string
  motivation_letter?: string
  linkedin_message?: string
  cv_adaptation_notes?: string
  highlighted_keywords?: string[]
  generated_cv_text?: string
  follow_up_date?: string | null
  sent_at?: string | null
  created_at?: string
  already_existed?: boolean
  failed?: boolean
  error?: string
  // Sources de personnalisation réellement utilisées (renvoyées par /generate-applications).
  personalization?: {
    studentProfile: boolean
    masterCv: boolean
    companyTarget: boolean
    searchObjective: boolean
  }
  // Champs entreprise joints (renvoyés par /list-applications).
  city?: string | null
  sector?: string | null
  siren?: string | null
  siret?: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function apiPost<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T | null; error?: string }> {
  try {
    const token = await getToken()
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, data: null, error: data?.error ?? `Erreur ${res.status}` }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, data: null, error: "Impossible de contacter le serveur." }
  }
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—"
  try { return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) }
  catch { return "—" }
}

// Lien vers la fiche officielle de l'entreprise (annuaire data.gouv). Renvoie null
// si le SIREN est absent/invalide — on n'affiche JAMAIS de faux lien.
const OFFICIAL_BASE = "https://annuaire-entreprises.data.gouv.fr/entreprise/"
function officialUrl(siren?: string | null): string | null {
  const s = (siren ?? "").replace(/\s/g, "")
  return /^\d{9}$/.test(s) ? OFFICIAL_BASE + s : null
}

// ── Tri des entreprises ─────────────────────────────────────────────────────────
// L'API ne renvoie pas le libellé du code NAF ; on approxime la pertinence
// « NAF ↔ poste recherché » par le recoupement des mots du poste avec le poste
// possible et le secteur de l'entreprise (en favorisant un code NAF identifié),
// puis on départage par proximité géographique. Aucune note n'est affichée.
function norm(s?: string | null): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}
function wordSet(s?: string | null): Set<string> {
  return new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2))
}
function nafRelevance(c: Company, posteWords: Set<string>): number {
  const hay = wordSet(`${c.possible_role ?? ""} ${c.sector ?? ""}`)
  let overlap = 0
  posteWords.forEach((w) => { if (hay.has(w)) overlap++ })
  return overlap * 2 + (c.naf_code ? 1 : 0)
}
function geoProximity(c: Company, ville: string, region: string): number {
  const v = norm(ville), r = norm(region)
  if (v && norm(c.city).includes(v)) return 2
  if (r && norm(c.region).includes(r)) return 1
  return 0
}

// ── Copy button ────────────────────────────────────────────────────────────────

function CopyBtn({ text, label, icon }: { text: string; label: string; icon: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="outline" size="sm" className="gap-1.5 h-8 text-xs"
      disabled={!text}
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
    >
      {copied ? <Check className="size-3.5" /> : icon}
      {copied ? "Copié" : label}
    </Button>
  )
}

// ── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, onGo }: { current: number; onGo: (n: number) => void }) {
  return (
    <div className="flex items-center gap-0 mb-8 flex-wrap">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <button
            type="button"
            onClick={() => onGo(s.n)}
            title={`Aller à « ${s.label} »`}
            className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors hover:opacity-80 cursor-pointer ${
              current === s.n ? "bg-primary text-primary-foreground"
                : current > s.n ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
            }`}>
            {current > s.n ? <Check className="size-3.5" /> : s.n}
          </button>
          <button type="button" onClick={() => onGo(s.n)}
            className={`ml-1.5 text-xs font-medium hidden sm:block hover:text-foreground transition-colors ${current === s.n ? "text-foreground" : "text-muted-foreground"}`}>
            {s.label}
          </button>
          {i < STEPS.length - 1 && <ChevronRight className="size-3.5 text-muted-foreground mx-1.5 sm:mx-2" />}
        </div>
      ))}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function AutopilotWizard() {
  const [auth, setAuth] = useState<"loading" | "in" | "out">("loading")
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [objective, setObjective] = useState<Objective>({
    poste: "", secteur: "", region: "", ville: "", niveau: "",
    rythme: "", date_debut: "", duree: "", type_contrat: "les_deux", nombre_candidatures: 10,
  })

  const [cvText, setCvText] = useState("")
  const [extracting, setExtracting] = useState(false)
  const [profile, setProfile] = useState<ExtractedProfile | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Étape 2 — saisie du CV. La zone de texte n'apparaît qu'à la demande (bouton
  // « Coller mon CV manuellement ») ou automatiquement si l'import échoue.
  const [showCvTextarea, setShowCvTextarea] = useState(false)
  const [cvFallbackNotice, setCvFallbackNotice] = useState<string | null>(null)
  const [skipCv, setSkipCv] = useState(false)
  const [focusTick, setFocusTick] = useState(0)
  const cvTextareaRef = useRef<HTMLTextAreaElement>(null)

  const [companies, setCompanies] = useState<Company[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Cartes entreprise (étape 3) dont le bloc « Détails » est déployé.
  const [companyDetails, setCompanyDetails] = useState<Set<string>>(new Set())

  const [applications, setApplications] = useState<AppItem[]>([])
  // Panneau déployé sur chaque card candidature (étape 4), indexé par une clé
  // unique : « CV adapté » et « Changer statut » s'ouvrent card par card.
  // Auparavant deux Set partagés + une clé company_target_id parfois vide
  // faisaient s'ouvrir le panneau sur toutes les cards à la fois.
  const [openPanels, setOpenPanels] = useState<Map<string, "cv" | "relance" | null>>(new Map())
  const [prenom, setPrenom] = useState("")
  // Candidature dont la modal « Envoyer via Alternia » est ouverte (une à la fois).
  const [envoiApp, setEnvoiApp] = useState<AppItem | null>(null)

  // Suivi persistant (étape 5) — rechargé depuis Supabase via /list-applications.
  const [suiviApps, setSuiviApps] = useState<AppItem[]>([])
  const [suiviLoading, setSuiviLoading] = useState(false)
  const [suiviLoaded, setSuiviLoaded] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuth(data.session?.user ? "in" : "out")
      setPrenom(data.session?.user?.user_metadata?.prenom ?? "")
    })
  }, [])

  const set = (patch: Partial<Objective>) => setObjective((o) => ({ ...o, ...patch }))

  // Affiche la zone de texte CV et y place le curseur (même si elle est déjà ouverte).
  const revealCvTextarea = () => { setShowCvTextarea(true); setFocusTick((t) => t + 1) }

  useEffect(() => {
    if (focusTick > 0) cvTextareaRef.current?.focus()
  }, [focusTick])

  // ── Étape 1 : profil démo ────────────────────────────────────────────────
  function loadObjectifDemo() {
    setObjective(OBJECTIF_DEMO)
    setError(null)
  }

  // ── Étape 1 → 2 ──────────────────────────────────────────────────────────
  function submitObjective() {
    if (!objective.poste.trim() || !objective.secteur || (!objective.region.trim() && !objective.ville.trim())) {
      setError("Renseigne au moins le poste, le secteur et une région ou ville.")
      return
    }
    setError(null); setStep(2)
  }

  // ── Étape 2 : upload fichier → cv-extract ─────────────────────────────────
  // L'extraction ne bloque JAMAIS : PDF image, erreur réseau ou texte vide
  // basculent immédiatement sur la saisie manuelle (zone de texte autofocus).
  const CV_FALLBACK_MSG = "Ton CV semble être un PDF image. Colle le texte de ton CV ci-dessous pour continuer."

  function fallbackToManualCv(message = CV_FALLBACK_MSG) {
    setCvFallbackNotice(message)
    setSkipCv(false)
    revealCvTextarea()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setExtracting(true); setError(null); setCvFallbackNotice(null)
    try {
      const fd = new FormData(); fd.append("file", file)
      const res = await fetch("/api/cv-extract", { method: "POST", body: fd })
      // La route renvoie toujours du JSON ; un corps illisible est traité comme un échec.
      const data = await res.json().catch(() => null)
      const text: string = typeof data?.text === "string" ? data.text : ""
      if (text.trim().length >= 10) {
        setCvText(text)
        setSkipCv(false)
        setCvFallbackNotice(null)
        revealCvTextarea()
      } else {
        fallbackToManualCv()
      }
    } catch {
      // Erreur réseau / route indisponible — on propose la saisie manuelle sans bloquer.
      fallbackToManualCv("Impossible de lire ce fichier pour le moment. Colle le texte de ton CV ci-dessous pour continuer.")
    }
    setExtracting(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  // ── Étape 2 : analyser CV → extract-profile ───────────────────────────────
  async function analyseCv() {
    if (cvText.trim().length < 20) { setError("Colle le texte de ton CV (au moins quelques lignes)."); return }
    setLoading("cv"); setError(null)
    const { ok, data, error } = await apiPost<{ id: string | null; profile: ExtractedProfile }>(
      "/api/autopilot/extract-profile", { cvText, objective },
    )
    setLoading(null)
    if (!ok || !data) { setError(error ?? "Analyse impossible."); return }
    setProfile(data.profile); setProfileId(data.id)
    setSkipCv(false); setCvFallbackNotice(null)
  }

  // ── Étape 2 : continuer sans CV ───────────────────────────────────────────
  // Les candidatures sont alors personnalisées avec le seul profil de recherche
  // (poste, secteur, rythme) et les compétences enregistrées sur /profil.
  function continueWithoutCv() {
    setProfile(null); setProfileId(null)
    setCvFallbackNotice(null)
    setShowCvTextarea(false)
    setSkipCv(true)
    setError(null)
    setStep(3)
  }

  // ── Étape 3 : rechercher + scorer ─────────────────────────────────────────
  async function findCompanies() {
    setLoading("search"); setError(null); setCompanies([]); setSelected(new Set())
    const search = await apiPost<{ companies: Company[]; count: number; message?: string }>(
      "/api/autopilot/search-companies", { objective, profileId },
    )
    if (!search.ok || !search.data) { setLoading(null); setError(search.error ?? "Recherche impossible."); return }
    // Les entreprises viennent de company_targets : certaines portent déjà un
    // possible_role « Pas viable » d'un scoring précédent → on les écarte avant
    // même l'affichage.
    const found = filterViable(search.data.companies ?? [])
    console.log("Companies returned to frontend:", found)
    if (found.length === 0) {
      setLoading(null)
      setError(search.data.message ?? "Aucune entreprise trouvée. Modifie le secteur, la région ou la ville.")
      return
    }
    setCompanies(found)

    // Scoring IA dans la foulée.
    setLoading("score")
    const score = await apiPost<{ scoredCompanies: {
      company_target_id: string; company_name: string; match_score: number; match_reason: string
      priority: CompanyPriority; recommended_angle: string; possible_role: string
    }[] }>("/api/autopilot/score-companies", {
      objective, profileId,
      companyTargetIds: found.map((c) => c.id ?? c.company_target_id).filter(Boolean),
    })
    setLoading(null)
    console.log("Scoring response:", score)
    if (score.ok && score.data && Array.isArray(score.data.scoredCompanies)) {
      const scoredCompanies = score.data.scoredCompanies
      console.log('[wizard] scoredCompanies reçues:', scoredCompanies.length, scoredCompanies.map(c => c.possible_role))
      // La route a déjà appliqué ses règles de filtrage (postes « Pas viable » /
      // « Non applicable », score minimum) et peut AJOUTER des entreprises issues
      // d'une recherche élargie. Sa réponse fait donc autorité : on reconstruit la
      // liste à partir d'elle au lieu d'enrichir `found`, sinon les entreprises
      // écartées resteraient affichées (simplement non scorées).
      const foundById = new Map<string, Company>()
      for (const c of found) {
        const cid = c.id ?? c.company_target_id
        if (cid) foundById.set(cid, c)
      }

      const retained: Company[] = filterViable(score.data.scoredCompanies.map((s) => {
        // Absente de `found` = ajoutée par l'élargissement SIRENE : on ne dispose
        // que des champs renvoyés par le scoring (ni ville, ni siren, ni effectif).
        const base: Company = foundById.get(s.company_target_id) ?? {
          id: s.company_target_id,
          company_name: s.company_name,
          city: null, region: null, sector: null, employee_range: null,
          match_score: null, match_reason: "", priority: null,
          recommended_angle: "", possible_role: "",
        }
        // Le spread `...base` garde toujours l'`id` (et siren/siret) — le scoring ne fait qu'enrichir.
        return { ...base, match_score: s.match_score, match_reason: s.match_reason, priority: s.priority,
          recommended_angle: s.recommended_angle, possible_role: s.possible_role }
      }))

      console.log("Companies after scoring filter:", retained)
      setCompanies(retained)
      if (retained.length === 0) {
        setError("Aucune entreprise pertinente pour ces critères. Élargis le secteur ou la région.")
      }
    } else {
      // Scoring indisponible : on ne filtre rien, `found` reste affiché tel quel.
      console.warn("Scoring indisponible:", score.error)
      setError("Entreprises trouvées mais scoring indisponible. Tu peux quand même sélectionner.")
    }
  }

  function toggleCompany(companyId?: string) {
    if (!companyId) {
      // Jamais de sélection sur un id manquant (évitait un "select all" via key/id undefined).
      console.warn("Impossible de sélectionner une entreprise sans id Supabase")
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(companyId)) {
        next.delete(companyId)
      } else {
        const max = Number(objective.nombre_candidatures || 10)
        if (next.size >= max) return next
        next.add(companyId)
      }
      return next
    })
  }

  // Tri : pertinence NAF/poste d'abord, proximité géographique ensuite. Aucune note affichée.
  const posteWords = wordSet(objective.poste)
  const visibleCompanies = [...companies].sort((a, b) => {
    const naf = nafRelevance(b, posteWords) - nafRelevance(a, posteWords)
    if (naf !== 0) return naf
    return geoProximity(b, objective.ville, objective.region) - geoProximity(a, objective.ville, objective.region)
  })

  // ── Statut de suivi par entreprise (persisté + mise à jour optimiste) ──────
  async function changeCompanyStatus(company: Company, newStatus: TrackingStatus) {
    const companyId = company.id ?? company.company_target_id
    if (!companyId) {
      setError("Cette entreprise n'a pas d'identifiant valide. Relance la recherche.")
      return
    }
    const previous: TrackingStatus = (company.tracking_status as TrackingStatus) ?? "a_contacter"
    const matches = (c: Company) => (c.id ?? c.company_target_id) === companyId
    // Mise à jour optimiste : le statut change à l'écran immédiatement.
    setCompanies((prev) => prev.map((c) => (matches(c) ? { ...c, tracking_status: newStatus } : c)))
    const { ok, data, error } = await apiPost<{ company: { tracking_status: TrackingStatus } }>(
      "/api/autopilot/update-company-status", { companyTargetId: companyId, status: newStatus },
    )
    if (!ok || !data) {
      // Rollback visible + erreur toujours loggée et affichée, jamais ignorée.
      console.error("[autopilot] update-company-status a échoué:", error)
      setCompanies((prev) => prev.map((c) => (matches(c) ? { ...c, tracking_status: previous } : c)))
      setError(error ?? "Impossible de mettre à jour le statut de l'entreprise.")
    }
  }

  function toggleCompanyDetails(key: string) {
    setCompanyDetails((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  // ── Étape 4 : générer ─────────────────────────────────────────────────────
  async function generate() {
    if (selected.size === 0) {
      setError("Sélectionne au moins une entreprise avant de générer tes candidatures.")
      return
    }
    // On n'envoie que les vrais UUID Supabase (garde-fou contre un id manquant).
    const selectedCompanyIds = Array.from(selected).filter((id): id is string => Boolean(id))
    console.log("Selected company IDs sent to generate-applications:", selectedCompanyIds)
    if (selectedCompanyIds.length === 0) {
      setError("Ces entreprises n'ont pas d'identifiant valide. Relance la recherche.")
      return
    }
    setLoading("generate"); setError(null)
    const { ok, data, error } = await apiPost<{ applications: AppItem[]; count: number }>(
      "/api/autopilot/generate-applications",
      { profileId, objective, companyTargetIds: selectedCompanyIds, studentFirstName: prenom },
    )
    setLoading(null)
    if (!ok || !data) { setError(error ?? "Génération impossible."); return }
    setApplications(data.applications ?? [])
    setSuiviLoaded(false) // force le rechargement du suivi (nouvelles candidatures persistées)
    setStep(4)
  }

  // ── update-status ─────────────────────────────────────────────────────────
  async function changeStatus(app: AppItem, status: ApplicationStatus) {
    if (!app.id) { setError("Cette candidature n'est pas sauvegardée (mode non connecté)."); return }
    setLoading(`status-${app.id}`)
    const { ok, data, error } = await apiPost<{ application: { status: ApplicationStatus; follow_up_date: string | null; sent_at: string | null } }>(
      "/api/autopilot/update-status", { applicationPackageId: app.id, status },
    )
    setLoading(null)
    if (!ok || !data) { setError(error ?? "Mise à jour impossible."); return }
    const patch = (a: AppItem): AppItem => a.id === app.id
      ? { ...a, status: data.application.status, follow_up_date: data.application.follow_up_date, sent_at: data.application.sent_at }
      : a
    // Propage aux deux listes (candidatures générées + suivi persistant).
    setApplications((prev) => prev.map(patch))
    setSuiviApps((prev) => prev.map(patch))
  }

  // ── Suivi persistant : recharge les candidatures sauvegardées depuis Supabase ──
  async function loadSuivi() {
    setSuiviLoading(true)
    const { ok, data } = await apiPost<{ applications: AppItem[] }>(
      "/api/autopilot/list-applications", {},
    )
    setSuiviLoading(false)
    setSuiviLoaded(true)
    if (ok && data) setSuiviApps(data.applications ?? [])
  }

  // Navigue vers une étape ; charge le suivi persistant en arrivant sur l'étape 5.
  function goToStep(n: number) {
    setError(null)
    setStep(n)
    if (n === 5 && auth === "in" && !suiviLoaded) loadSuivi()
  }

  /** Ouvre le panneau `panel` sur cette card seule — ou le referme s'il l'était déjà. */
  function togglePanel(key: string, panel: "cv" | "relance") {
    setOpenPanels((prev) => new Map(prev).set(key, prev.get(key) === panel ? null : panel))
  }

  // ── Auth gates ────────────────────────────────────────────────────────────
  if (auth === "loading") {
    return <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
      <Loader2 className="size-4 animate-spin mr-2" /> Chargement…
    </div>
  }
  if (auth === "out") {
    return (
      <div className="flex flex-col items-center gap-5 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-[#3B82F6]/10">
          <LogIn className="size-6 text-[#3B82F6]" />
        </div>
        <div>
          <p className="font-semibold text-base mb-1">Connexion requise</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Connecte-toi pour que Sarah prépare et sauvegarde tes candidatures personnalisées.
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild><Link href="/login">Se connecter</Link></Button>
          <Button variant="outline" asChild><Link href="/register">Créer un compte</Link></Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator current={step} onGo={goToStep} />

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {/* ── ÉTAPE 1 — PROFIL ──────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="flex flex-col gap-5">
          {/* Profil démo — remplit tout le formulaire en un clic, rien n'est sauvegardé. */}
          <div>
            <button
              type="button"
              onClick={loadObjectifDemo}
              className="bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-xl px-4 py-2 text-sm transition-colors hover:bg-blue-500/30"
            >
              Charger un profil démo 🎭
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Poste recherché">
              <Input placeholder="Ex : Data Analyst, Assistant RH…" value={objective.poste}
                onChange={(e) => set({ poste: e.target.value })} />
            </Field>
            <Field label="Secteur visé">
              <Select value={objective.secteur} onValueChange={(v) => set({ secteur: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choisir un secteur" /></SelectTrigger>
                <SelectContent>{SECTEURS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Région">
              <Input placeholder="Ex : Île-de-France, Occitanie…" value={objective.region}
                onChange={(e) => set({ region: e.target.value })} />
            </Field>
            <Field label="Ville / zone géographique">
              <Input placeholder="Ex : Paris, Lyon…" value={objective.ville}
                onChange={(e) => set({ ville: e.target.value })} />
            </Field>
            <Field label="Niveau d'études">
              <Select value={objective.niveau} onValueChange={(v) => set({ niveau: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>{NIVEAUX.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Rythme école / entreprise">
              <Input placeholder="Ex : 1 sem. école / 3 sem. entreprise" value={objective.rythme}
                onChange={(e) => set({ rythme: e.target.value })} />
            </Field>
            <Field label="Date de début">
              <Input type="month" value={objective.date_debut} onChange={(e) => set({ date_debut: e.target.value })} />
            </Field>
            <Field label="Durée de l'alternance">
              <Input placeholder="Ex : 12 mois, 24 mois" value={objective.duree}
                onChange={(e) => set({ duree: e.target.value })} />
            </Field>
            <Field label="Type de contrat">
              <Select value={objective.type_contrat} onValueChange={(v) => set({ type_contrat: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{CONTRATS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Nombre de candidatures">
              <Select value={String(objective.nombre_candidatures)}
                onValueChange={(v) => set({ nombre_candidatures: Number(v) })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{NB_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n} candidatures</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Button className="self-start gap-2" onClick={submitObjective}>
            <Target className="size-4" /> Continuer vers le CV
          </Button>
        </div>
      )}

      {/* ── ÉTAPE 2 — CV MAÎTRE ──────────────────────────────────────────── */}
      {step === 2 && (
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-2.5 rounded-lg border border-[#3B82F6]/25 bg-[#3B82F6]/8 px-4 py-3 text-sm text-[#93C5FD]">
            <ShieldCheck className="size-4 shrink-0 mt-0.5" />
            <span>Alternia ne peut pas inventer d&apos;expérience ou de compétence. Sarah adapte uniquement les informations présentes dans ton CV.</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" accept=".pdf,.docx" onChange={handleFile} className="hidden" id="cv-file" />
            <Button variant="outline" className="gap-2" disabled={extracting}
              onClick={() => fileRef.current?.click()}>
              {extracting ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {extracting ? "Extraction…" : "Importer un PDF / DOCX"}
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => { setCvFallbackNotice(null); setSkipCv(false); revealCvTextarea() }}>
              <ClipboardList className="size-4" /> Coller mon CV manuellement
            </Button>
            <Button variant="ghost" className="gap-2 text-muted-foreground" onClick={continueWithoutCv}>
              <ChevronRight className="size-4" /> Continuer sans CV
            </Button>
          </div>

          {/* Extraction impossible (PDF image, réseau, texte vide) — jamais bloquant. */}
          {cvFallbackNotice && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" /> <span>{cvFallbackNotice}</span>
            </div>
          )}

          {showCvTextarea && (
            <>
              <Textarea ref={cvTextareaRef} rows={10} placeholder="Colle ici le texte de ton CV…" value={cvText}
                onChange={(e) => setCvText(e.target.value)} />

              <Button className="self-start gap-2" onClick={analyseCv} disabled={loading === "cv"}>
                {loading === "cv" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {loading === "cv" ? "Sarah analyse ton CV…" : "Analyser mon CV"}
              </Button>
            </>
          )}

          {profile && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Profil candidat maître</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-4 text-sm">
                <ProfileBlock title="Expériences vérifiées" empty="Aucune expérience détectée">
                  {profile.verified_experiences?.map((e, i) => (
                    <li key={i}><span className="font-medium">{e.poste}</span>{e.entreprise ? ` — ${e.entreprise}` : ""}{e.periode ? ` (${e.periode})` : ""}</li>
                  ))}
                </ProfileBlock>
                <ChipsBlock title="Compétences vérifiées" items={profile.verified_skills} />
                <ProfileBlock title="Formation" empty="Aucune formation détectée">
                  {profile.education?.map((e, i) => (
                    <li key={i}><span className="font-medium">{e.diplome}</span>{e.etablissement ? ` — ${e.etablissement}` : ""}{e.annee ? ` (${e.annee})` : ""}</li>
                  ))}
                </ProfileBlock>
                <ChipsBlock title="Outils maîtrisés" items={profile.tools} />
                {(!profile.verified_experiences?.length && !profile.verified_skills?.length) && (
                  <p className="text-xs text-amber-400">⚠️ Peu d&apos;informations détectées — complète ton CV pour de meilleures candidatures.</p>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between">
            <Button variant="ghost" className="gap-1.5" onClick={() => setStep(1)}>
              <ArrowLeft className="size-3.5" /> Retour
            </Button>
            <Button className="gap-2" disabled={!profile && !skipCv} onClick={() => { setError(null); setStep(3) }}>
              Trouver des entreprises <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── ÉTAPE 3 — ENTREPRISES ────────────────────────────────────────── */}
      {step === 3 && (
        <div className="flex flex-col gap-4">
          {skipCv && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-xs text-amber-300/90">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>
                Mode sans CV : Sarah personnalise avec ton poste, ton secteur, ton rythme et les compétences
                enregistrées sur ton profil. Ajoute ton CV à l&apos;étape précédente pour des candidatures plus précises.
              </span>
            </div>
          )}
          {companies.length === 0 ? (
            <div className="flex flex-col items-start gap-4">
              <p className="text-sm text-muted-foreground">
                Sarah va chercher des entreprises compatibles avec <span className="text-foreground font-medium">{objective.poste}</span> ({objective.secteur}) en {objective.ville || objective.region}.
              </p>
              <Button className="gap-2" onClick={findCompanies} disabled={loading === "search" || loading === "score"}>
                {(loading === "search" || loading === "score")
                  ? <><Loader2 className="size-4 animate-spin" /> {loading === "score" ? "Scoring en cours…" : "Recherche en cours…"}</>
                  : <><Building2 className="size-4" /> Trouver des entreprises compatibles</>}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  <span className="font-medium">{visibleCompanies.length}</span> entreprise{visibleCompanies.length > 1 ? "s" : ""} · sélection {selected.size}/{objective.nombre_candidatures}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={findCompanies}
                    disabled={loading === "search" || loading === "score"}>
                    <RefreshCw className="size-3.5" /> Relancer
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {visibleCompanies.map((c, index) => {
                  // Vrai id Supabase (jamais un fallback) — sert à la sélection ET à la génération.
                  const companyId = c.id || c.company_target_id
                  // Clé React robuste : peut retomber sur un identifiant stable même sans id Supabase.
                  const reactKey =
                    companyId ||
                    c.siret ||
                    c.siren ||
                    `${c.company_name || "company"}-${c.city || "city"}-${index}`
                  const isSelectable = Boolean(companyId)
                  const isSel = companyId ? selected.has(companyId) : false
                  return (
                    <Card
                      key={reactKey}
                      className={`transition-colors ${isSel ? "border-primary ring-1 ring-primary/30" : ""} ${
                        isSelectable ? "cursor-pointer" : "opacity-60 cursor-not-allowed"
                      }`}
                      onClick={() => {
                        if (!companyId) {
                          console.warn("Entreprise sans id Supabase, impossible de sélectionner", c)
                          return
                        }
                        toggleCompany(companyId)
                      }}>
                      <CardHeader className="py-3">
                        <div className="flex items-start gap-3">
                          <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${isSel ? "bg-primary/10" : "bg-muted"}`}>
                            <Building2 className={`size-4 ${isSel ? "text-primary" : "text-muted-foreground"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            {/* Ligne 1 — raison sociale + statut de suivi modifiable */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <CardTitle className="text-sm font-semibold truncate">{c.company_name}</CardTitle>
                                <Badge className="hidden sm:inline-flex shrink-0 bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
                                  <BadgeCheck className="size-3" /> Vérifiée
                                </Badge>
                              </div>
                              {/* stopPropagation : le sélecteur ne doit pas (dé)sélectionner la carte. */}
                              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                <Select value={c.tracking_status ?? "a_contacter"}
                                  onValueChange={(v) => changeCompanyStatus(c, v as TrackingStatus)}>
                                  <SelectTrigger className="h-7 w-[136px] text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {TRACKING_STATUSES.map((s) => (
                                      <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            {/* Ligne 2 — secteur en clair (libellé, jamais le code NAF brut) */}
                            {c.sector && <p className="text-xs text-muted-foreground mt-1 truncate">{c.sector}</p>}

                            {/* Ligne 3 — ville + tranche d'effectif (jamais vide / undefined) */}
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                              {c.city && <span className="flex items-center gap-1"><MapPin className="size-3" /> {c.city}{c.region ? `, ${c.region}` : ""}</span>}
                              <span className="flex items-center gap-1">
                                <Users className="size-3" />
                                {c.employee_range ? c.employee_range : <span className="text-muted-foreground/50">Taille non renseignée</span>}
                              </span>
                            </div>

                            {/* Ligne 4 — poste possible */}
                            {c.possible_role && (
                              <p className="text-xs mt-1"><span className="text-muted-foreground">Poste possible :</span> {c.possible_role}</p>
                            )}

                            {/* Ligne 5 — fiche officielle + bascule Détails */}
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              {officialUrl(c.siren) && (
                                <a href={officialUrl(c.siren)!} target="_blank" rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-xs text-[#60A5FA] hover:underline">
                                  <ExternalLink className="size-3" /> Voir la fiche officielle
                                </a>
                              )}
                              {(c.match_reason || c.recommended_angle) && (
                                <button type="button"
                                  onClick={(e) => { e.stopPropagation(); toggleCompanyDetails(reactKey) }}
                                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                  <Info className="size-3" /> {companyDetails.has(reactKey) ? "Masquer les détails" : "Détails"}
                                </button>
                              )}
                              {!isSelectable && (
                                <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px]">
                                  Non sauvegardée — relance la recherche
                                </Badge>
                              )}
                            </div>

                            {/* Détails repliables — fermés par défaut (justification + angle) */}
                            {companyDetails.has(reactKey) && (
                              <div className="mt-2 flex flex-col gap-1 rounded-lg border border-border bg-muted/20 p-3 text-xs"
                                onClick={(e) => e.stopPropagation()}>
                                {c.match_reason && <p className="text-muted-foreground leading-relaxed">{c.match_reason}</p>}
                                {c.recommended_angle && <p><span className="text-muted-foreground">Angle :</span> {c.recommended_angle}</p>}
                              </div>
                            )}
                          </div>
                          <div className={`size-4 shrink-0 rounded-full border-2 mt-1 ${isSel ? "border-primary bg-primary" : "border-muted-foreground/40"}`} />
                        </div>
                      </CardHeader>
                    </Card>
                  )
                })}
              </div>

              <div className="flex items-center justify-between">
                <Button variant="ghost" className="gap-1.5" onClick={() => setStep(2)}><ArrowLeft className="size-3.5" /> Retour</Button>
                <Button className="gap-2" disabled={selected.size === 0 || loading === "generate"} onClick={generate}>
                  {loading === "generate" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {loading === "generate" ? "Sarah rédige…" : `Générer mes candidatures (${selected.size})`}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ÉTAPE 4 — CANDIDATURES ───────────────────────────────────────── */}
      {step === 4 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {applications.filter((a) => !a.failed).length} candidature(s) prête(s). Copie, vérifie, puis marque comme envoyée quand tu as envoyé.
          </p>
          {applications.map((app, i) => {
            // Clé garantie unique : company_target_id peut être vide (candidature
            // échouée / entreprise sans cible), et deux clés identiques ouvraient
            // le même panneau sur plusieurs cards.
            const key = app.id || app.company_target_id || `app-${i}`
            if (app.failed) {
              return (
                <Card key={key} className="border-red-500/30 bg-red-500/5">
                  <CardContent className="py-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-sm">
                      <AlertTriangle className="size-4 text-red-400 shrink-0" />
                      <span><span className="font-medium">{app.company_name}</span> — génération échouée</span>
                    </div>
                    <Badge className="bg-red-500/15 text-red-300 border-red-500/30 text-xs">À regénérer plus tard</Badge>
                  </CardContent>
                </Card>
              )
            }
            const isOpen = openPanels.get(key) === "cv"
            return (
              <Card key={key}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#0D9488]/15">
                        <Mail className="size-4 text-[#2DD4BF]" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold truncate">{app.company_name}</CardTitle>
                        <p className="text-xs text-muted-foreground">Relance suggérée : {formatDate(app.follow_up_date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {app.already_existed && <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-xs">Déjà existante</Badge>}
                      <Badge className="bg-muted text-muted-foreground text-xs">{STATUS_LABEL[app.status]}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 pt-0">
                  <PersonalizationBlock sources={app.personalization} />
                  <LabeledText label="Objet" value={app.email_subject} />
                  <LabeledBlock label="E-mail" value={app.email_body} />

                  {isOpen && (
                    <>
                      <LabeledBlock label="Mini lettre de motivation" value={app.motivation_letter} />
                      <LabeledBlock label="Message LinkedIn" value={app.linkedin_message} />
                      <LabeledBlock label="Résumé CV adapté" value={app.generated_cv_text} />
                      <LabeledBlock label="Notes d'adaptation du CV" value={app.cv_adaptation_notes} />
                      {!!app.highlighted_keywords?.length && (
                        <ChipsBlock title="Mots-clés à mettre en avant" items={app.highlighted_keywords} />
                      )}
                    </>
                  )}

                  {/* Rappel : c'est l'étudiant qui envoie le mail, pas Alternia. */}
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-amber-300/90">
                    <Info className="size-3.5 shrink-0 mt-0.5" />
                    <span>Rien n&apos;est parti sans ton accord. « Envoyer via Alternia » l&apos;envoie depuis candidatures@alternia.fr en ton nom ; sinon copie l&apos;e-mail, envoie-le depuis ta boîte mail, puis marque-le comme envoyé.</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <CopyBtn text={`Objet : ${app.email_subject ?? ""}\n\n${app.email_body ?? ""}`} label="Copier l'e-mail" icon={<Mail className="size-3.5" />} />
                    <CopyBtn text={app.motivation_letter ?? ""} label="Copier la lettre" icon={<FileText className="size-3.5" />} />
                    <CopyBtn text={app.linkedin_message ?? ""} label="LinkedIn" icon={<MessageSquare className="size-3.5" />} />
                    <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => togglePanel(key, "cv")}>
                      <FileText className="size-3.5" /> {isOpen ? "Réduire" : "Voir les messages"}
                    </Button>
                    {!!app.email_body && (
                      <>
                        <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setEnvoiApp(app)}>
                          <Send className="size-3.5" /> Envoyer via Alternia
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" asChild>
                          <a
                            href={gmailUrl(app.email_subject ?? "", app.email_body ?? "")}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="size-3.5" /> Ouvrir dans Gmail
                          </a>
                        </Button>
                      </>
                    )}
                    {app.status === "sent" ? (
                      <>
                        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => goToStep(5)}>
                          <ClipboardList className="size-3.5" /> Voir dans le suivi
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => togglePanel(key, "relance")}>
                          <RefreshCw className="size-3.5" /> Changer statut
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" className="gap-1.5 h-8 text-xs" disabled={loading === `status-${app.id}`}
                          onClick={() => changeStatus(app, "sent")}>
                          {loading === `status-${app.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Marquer envoyé
                        </Button>
                        <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs text-muted-foreground"
                          disabled={loading === `status-${app.id}`} onClick={() => changeStatus(app, "archived")}>
                          <Archive className="size-3.5" /> Archiver
                        </Button>
                      </>
                    )}
                  </div>

                  {app.status === "sent" && (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs gap-1">
                          <Check className="size-3" /> Envoyée
                        </Badge>
                        <span className="text-xs text-emerald-400">Relance prévue le {formatDate(app.follow_up_date)} (J+5)</span>
                      </div>
                      {openPanels.get(key) === "relance" && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBtn onClick={() => changeStatus(app, "follow_up")} disabled={loading === `status-${app.id}`}>Relance faite</StatusBtn>
                          <StatusBtn onClick={() => changeStatus(app, "interview")} disabled={loading === `status-${app.id}`}>Entretien</StatusBtn>
                          <StatusBtn onClick={() => changeStatus(app, "accepted")} disabled={loading === `status-${app.id}`}>Accepté</StatusBtn>
                          <StatusBtn onClick={() => changeStatus(app, "rejected")} disabled={loading === `status-${app.id}`}>Refus</StatusBtn>
                          <StatusBtn onClick={() => changeStatus(app, "archived")} disabled={loading === `status-${app.id}`}>Archiver</StatusBtn>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}

          {envoiApp && (
            <EnvoiEmailModal
              onClose={() => setEnvoiApp(null)}
              entreprise={envoiApp.company_name}
              objetInitial={envoiApp.email_subject ?? ""}
              corpsInitial={envoiApp.email_body ?? ""}
              prenom={prenom}
              onSent={() => changeStatus(envoiApp, "sent")}
            />
          )}

          <div className="flex items-center justify-between">
            <Button variant="ghost" className="gap-1.5" onClick={() => setStep(3)}><ArrowLeft className="size-3.5" /> Entreprises</Button>
            <Button className="gap-2" onClick={() => goToStep(5)}><ClipboardList className="size-4" /> Voir le suivi</Button>
          </div>
        </div>
      )}

      {/* ── ÉTAPE 5 — SUIVI (persistant, rechargé depuis Supabase) ─────────── */}
      {step === 5 && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Mes candidatures Autopilot</p>
              <p className="text-xs text-muted-foreground">
                Chargées depuis ton compte — tu les retrouves même après avoir rechargé la page.
              </p>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={loadSuivi} disabled={suiviLoading}>
              {suiviLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Actualiser
            </Button>
          </div>

          {suiviLoading && suiviApps.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="size-4 animate-spin" /> Chargement de tes candidatures…
            </div>
          ) : (
            <>
              {SUIVI_COLUMNS.map((col) => {
                const list = suiviApps.filter((a) => a.status === col)
                if (list.length === 0) return null
                return (
                  <div key={col} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{STATUS_LABEL[col]}</span>
                      <Badge className="bg-muted text-muted-foreground text-xs">{list.length}</Badge>
                    </div>
                    {list.map((app) => {
                      const url = officialUrl(app.siren)
                      return (
                        <Card key={app.id ?? app.company_target_id}>
                          <CardContent className="py-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{app.company_name}</p>
                              <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                                {app.city && <span>{app.city}</span>}
                                <span>Relance : {formatDate(app.follow_up_date)}</span>
                                {app.sent_at && <span>Envoyée le {formatDate(app.sent_at)}</span>}
                                {url && (
                                  <a href={url} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-0.5 text-[#60A5FA] hover:underline">
                                    <ExternalLink className="size-3" /> Fiche
                                  </a>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusBtn onClick={() => changeStatus(app, "sent")} disabled={!app.id || loading === `status-${app.id}`}>Envoyée</StatusBtn>
                              <StatusBtn onClick={() => changeStatus(app, "follow_up")} disabled={!app.id || loading === `status-${app.id}`}>Relance faite</StatusBtn>
                              <StatusBtn onClick={() => changeStatus(app, "interview")} disabled={!app.id || loading === `status-${app.id}`}>Entretien</StatusBtn>
                              <StatusBtn onClick={() => changeStatus(app, "accepted")} disabled={!app.id || loading === `status-${app.id}`}>Accepté</StatusBtn>
                              <StatusBtn onClick={() => changeStatus(app, "rejected")} disabled={!app.id || loading === `status-${app.id}`}>Refus</StatusBtn>
                              <StatusBtn onClick={() => changeStatus(app, "archived")} disabled={!app.id || loading === `status-${app.id}`}>Archiver</StatusBtn>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )
              })}
              {suiviApps.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucune candidature sauvegardée pour l&apos;instant. Génère tes candidatures à l&apos;étape précédente.</p>
              )}
            </>
          )}

          <div>
            <Button variant="ghost" className="gap-1.5" onClick={() => setStep(4)}><ArrowLeft className="size-3.5" /> Candidatures</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Petits composants ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5"><label className="text-sm font-medium">{label}</label>{children}</div>
}

function StatusBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClick} disabled={disabled}>{children}</Button>
}

// Bloc « Personnalisation utilisée » — montre à l'étudiant quelles sources ont nourri
// le message. N'affiche que les sources réellement disponibles.
function PersonalizationBlock({ sources }: { sources?: AppItem["personalization"] }) {
  if (!sources) return null
  const labels: { key: keyof NonNullable<AppItem["personalization"]>; label: string }[] = [
    { key: "studentProfile", label: "Profil étudiant" },
    { key: "masterCv", label: "CV maître" },
    { key: "companyTarget", label: "Entreprise ciblée" },
    { key: "searchObjective", label: "Objectif de recherche" },
  ]
  const active = labels.filter((l) => sources[l.key])
  if (active.length === 0) return null
  return (
    <div className="rounded-lg border border-[#3B82F6]/25 bg-[#3B82F6]/8 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#93C5FD] mb-1.5">Personnalisation utilisée</p>
      <div className="flex flex-wrap gap-1.5">
        {active.map((l) => (
          <Badge key={l.key} className="bg-[#3B82F6]/15 text-[#93C5FD] border-[#3B82F6]/30 text-[11px] gap-1">
            <Check className="size-3" /> {l.label}
          </Badge>
        ))}
      </div>
    </div>
  )
}

function ProfileBlock({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children]
  const hasContent = items.some((c) => c)
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{title}</p>
      {hasContent ? <ul className="list-disc list-inside space-y-0.5 text-sm">{children}</ul>
        : <p className="text-xs text-muted-foreground italic">{empty}</p>}
    </div>
  )
}

function ChipsBlock({ title, items }: { title: string; items?: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{title}</p>
      {items?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => <Badge key={i} className="bg-primary/10 text-primary border-primary/20 text-xs">{it}</Badge>)}
        </div>
      ) : <p className="text-xs text-muted-foreground italic">—</p>}
    </div>
  )
}

function LabeledText({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  )
}

function LabeledBlock({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{label}</p>
      <pre className="text-xs whitespace-pre-wrap leading-relaxed font-sans">{value}</pre>
    </div>
  )
}
