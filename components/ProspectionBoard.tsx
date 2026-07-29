"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import Link from "next/link"
import {
  Search,
  Mail,
  Building2,
  MapPin,
  Users,
  Copy,
  Check,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  UserCircle,
  AlertCircle,
  LogIn,
} from "lucide-react"
import type { EntrepriseProspect } from "@/types"
import { supabase } from "@/lib/supabase"
import { EntrepriseDetails } from "@/components/prospection/EntrepriseDetails"
import { CandidatureActions } from "@/components/prospection/CandidatureActions"
import { EnvoiManuelBanner } from "@/components/prospection/EnvoiManuelBanner"
import { parseEmail } from "@/lib/suivi"

const secteurs = [
  "Informatique / Tech",
  "Commerce / Marketing",
  "Finance / Comptabilité",
  "RH / Management",
  "Communication / Média",
  "Ingénierie / Industrie",
  "Santé / Social",
  "Droit / Juridique",
]

const niveaux = ["BTS", "Bachelor", "Master", "Autre"]

const tailleOptions = [
  { value: "toutes", label: "Toutes tailles" },
  { value: "petite", label: "Petite (< 50 salariés)" },
  { value: "moyenne", label: "Moyenne (50–499 salariés)" },
  { value: "grande", label: "Grande (500+ salariés)" },
]

const statutLabels: Record<EntrepriseProspect["statut"], string> = {
  en_attente: "En attente",
  envoye: "Envoyé",
  repondu: "Répondu",
  sans_suite: "Sans suite",
}

const statutColors: Record<EntrepriseProspect["statut"], string> = {
  en_attente: "bg-muted text-muted-foreground",
  envoye: "bg-[#3B82F6]/10 text-[#3B82F6]",
  repondu: "bg-emerald-500/10 text-emerald-700",
  sans_suite: "bg-red-500/10 text-red-700",
}

type Step = 1 | 2 | 3
type ProfileStatus = "loading" | "complete" | "incomplete" | "not_authenticated"

interface Profile {
  prenom: string | null
  ecole: string | null
  niveau: string | null
  secteur: string | null
  // Champs complémentaires utilisés pour personnaliser les emails (optionnels).
  nom?: string | null
  region?: string | null
  poste_recherche?: string | null
  rythme?: string | null
  date_debut?: string | null
  duree?: string | null
  competences?: string | null
}

interface SearchParams {
  secteur: string
  region: string
  taille: string
}

function StepIndicator({ current }: { current: Step }) {
  const steps = [
    { n: 1, label: "Critères" },
    { n: 2, label: "Entreprises" },
    { n: 3, label: "Emails" },
  ]
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div
            className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              current === s.n
                ? "bg-primary text-primary-foreground"
                : current > s.n
                ? "bg-emerald-500 text-white"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {s.n}
          </div>
          <span
            className={`ml-1.5 text-xs font-medium hidden sm:block ${
              current === s.n ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <ChevronRight className="size-3.5 text-muted-foreground mx-2" />
          )}
        </div>
      ))}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={handleCopy}>
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copié" : "Copier"}
    </Button>
  )
}

export default function ProspectionBoard() {
  // Profile state
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("loading")
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileForm, setProfileForm] = useState({ prenom: "", ecole: "", niveau: "" })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Prospection state
  const [step, setStep] = useState<Step>(1)
  const [params, setParams] = useState<SearchParams>({ secteur: "", region: "", taille: "toutes" })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 2 state
  const [entreprises, setEntreprises] = useState<EntrepriseProspect[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Step 3 state
  const [emailEntreprises, setEmailEntreprises] = useState<EntrepriseProspect[]>([])
  const [statuts, setStatuts] = useState<Record<string, EntrepriseProspect["statut"]>>({})
  const [campagneId, setCampagneId] = useState<string | null>(null)
  const [markingSiret, setMarkingSiret] = useState<string | null>(null)
  const [sentSirets, setSentSirets] = useState<Set<string>>(new Set())

  // Load profile on mount
  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      let session = null
      try {
        const { data } = await supabase.auth.getSession()
        session = data.session
      } catch {
        if (!cancelled) setProfileStatus("not_authenticated")
        return
      }
      if (!session?.user) {
        if (!cancelled) setProfileStatus("not_authenticated")
        return
      }

      const meta = session.user.user_metadata
      // select("*") : reste valide même si les colonnes optionnelles du profil
      // (poste_recherche, rythme, competences…) n'ont pas encore été créées.
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single()

      if (cancelled) return

      const prenom = data?.prenom ?? meta?.prenom ?? null
      const ecole = data?.ecole ?? meta?.ecole ?? null
      const niveau = data?.niveau ?? meta?.niveau ?? null
      const secteur = data?.secteur ?? meta?.secteur ?? null

      if (prenom && ecole && niveau) {
        setProfile({
          prenom, ecole, niveau, secteur,
          nom: data?.nom ?? meta?.nom ?? null,
          region: data?.region ?? meta?.region ?? null,
          poste_recherche: data?.poste_recherche ?? null,
          rythme: data?.rythme ?? null,
          date_debut: data?.date_debut_alternance ?? null,
          duree: data?.duree_alternance ?? null,
          competences: data?.competences ?? null,
        })
        setProfileStatus("complete")
      } else {
        setProfileForm({
          prenom: prenom ?? "",
          ecole: ecole ?? "",
          niveau: niveau ?? "",
        })
        setProfileStatus("incomplete")
      }
    }

    loadProfile()
    return () => { cancelled = true }
  }, [])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!profileForm.prenom.trim() || !profileForm.ecole.trim() || !profileForm.niveau) return

    setProfileSaving(true)
    setProfileError(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setProfileError("Session expirée. Reconnectez-vous.")
      setProfileSaving(false)
      return
    }

    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert({
        id: session.user.id,
        email: session.user.email,
        prenom: profileForm.prenom.trim(),
        ecole: profileForm.ecole.trim(),
        niveau: profileForm.niveau,
      })

    setProfileSaving(false)

    if (upsertError) {
      setProfileError("Erreur lors de la sauvegarde. Réessayez.")
      return
    }

    setProfile({
      prenom: profileForm.prenom.trim(),
      ecole: profileForm.ecole.trim(),
      niveau: profileForm.niveau,
      secteur: null,
    })
    setProfileStatus("complete")
  }

  // ── Step 1 → 2 ──────────────────────────────────────────────
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!params.secteur || !params.region.trim()) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/prospection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secteur: params.secteur, region: params.region, taille: params.taille }),
      })

      setLoading(false)

      if (!res.ok) {
        setError("Erreur lors de la recherche. Réessayez.")
        return
      }

      const data = await res.json()
      const list = (data.entreprises ?? []) as EntrepriseProspect[]
      setEntreprises(list)
      setSelected(new Set())
      setStep(2)
    } catch {
      setLoading(false)
      setError("Impossible de contacter le serveur. Vérifiez votre connexion.")
    }
  }

  // ── Step 2 → 3 ──────────────────────────────────────────────
  async function handleGenerateEmails() {
    if (selected.size === 0) return
    setLoading(true)
    setError(null)

    const companies = entreprises.map(({ siret, nom, ville, taille, siren, naf_code, code_postal }) => ({
      siret, nom, ville, taille, siren, naf_code, code_postal,
    }))

    const { data: { session: authSession } } = await supabase.auth.getSession()
    const token = authSession?.access_token

    try {
      const res = await fetch("/api/prospection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          secteur: params.secteur,
          region: params.region,
          taille: params.taille,
          sirets: Array.from(selected),
          companies,
          userProfile: profile
            ? {
                prenom: profile.prenom,
                nom: profile.nom,
                ecole: profile.ecole,
                niveau: profile.niveau,
                secteur: profile.secteur,
                region: profile.region,
                poste_recherche: profile.poste_recherche,
                rythme: profile.rythme,
                date_debut: profile.date_debut,
                duree: profile.duree,
                competences: profile.competences,
              }
            : undefined,
        }),
      })

      setLoading(false)

      if (!res.ok) {
        setError("Erreur lors de la génération. Réessayez.")
        return
      }

      const data = await res.json()
      const list = (data.entreprises ?? []) as EntrepriseProspect[]
      setEmailEntreprises(list)
      setCampagneId(typeof data.id === "string" ? data.id : null)
      setSentSirets(new Set())
      const initialStatuts: Record<string, EntrepriseProspect["statut"]> = {}
      list.forEach((e) => { initialStatuts[e.siret] = "en_attente" })
      setStatuts(initialStatuts)
      setStep(3)
    } catch {
      setLoading(false)
      setError("Impossible de générer les emails. Vérifiez votre connexion.")
    }
  }

  function toggleAll() {
    if (selected.size === entreprises.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(entreprises.map((e) => e.siret)))
    }
  }

  function toggleOne(siret: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(siret) ? next.delete(siret) : next.add(siret)
      return next
    })
  }

  function updateStatut(siret: string, statut: EntrepriseProspect["statut"]) {
    setStatuts((prev) => ({ ...prev, [siret]: statut }))
  }

  // Marque une candidature comme envoyée (Supabase + affichage local).
  async function markAsSent(siret: string) {
    setMarkingSiret(siret)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (campagneId && token) {
        await fetch("/api/prospection/update-status", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id: `${campagneId}::${siret}`, statut: "Envoyée" }),
        })
      }
      setSentSirets((prev) => new Set(prev).add(siret))
      updateStatut(siret, "envoye")
    } catch {
      /* l'affichage local reste cohérent même si la sauvegarde échoue */
    }
    setMarkingSiret(null)
  }

  function restart() {
    setStep(1)
    setEntreprises([])
    setEmailEntreprises([])
    setSelected(new Set())
    setStatuts({})
    setCampagneId(null)
    setSentSirets(new Set())
    setError(null)
  }

  // ── Loading profile ──────────────────────────────────────────
  if (profileStatus === "loading") {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        Chargement de votre profil…
      </div>
    )
  }

  // ── Non connecté ────────────────────────────────────────────
  if (profileStatus === "not_authenticated") {
    return (
      <div className="flex flex-col items-center gap-5 py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-violet-500/10">
          <LogIn className="size-6 text-violet-500" />
        </div>
        <div>
          <p className="font-semibold text-base mb-1">Connexion requise</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Connectez-vous pour rechercher des entreprises et générer vos emails de candidature personnalisés.
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/login">Se connecter</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/register">Créer un compte</Link>
          </Button>
        </div>
      </div>
    )
  }

  // ── Step 0 : Profil incomplet ────────────────────────────────
  if (profileStatus === "incomplete") {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Étape 0 — Complétez votre profil
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
              AlternaAI a besoin de vos informations pour personnaliser vos emails de candidature avec vos vraies données.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <UserCircle className="size-3.5 text-muted-foreground" />
                Prénom
              </label>
              <Input
                placeholder="Jean"
                value={profileForm.prenom}
                onChange={(e) => setProfileForm((f) => ({ ...f, prenom: e.target.value }))}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">École / Université</label>
              <Input
                placeholder="Ex : EPITECH, Université Lyon 2…"
                value={profileForm.ecole}
                onChange={(e) => setProfileForm((f) => ({ ...f, ecole: e.target.value }))}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Niveau de formation</label>
              <Select
                value={profileForm.niveau}
                onValueChange={(v) => setProfileForm((f) => ({ ...f, niveau: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir" />
                </SelectTrigger>
                <SelectContent>
                  {niveaux.map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {profileError && <p className="text-sm text-destructive">{profileError}</p>}

          <Button
            type="submit"
            disabled={profileSaving || !profileForm.prenom.trim() || !profileForm.ecole.trim() || !profileForm.niveau}
            className="self-start gap-2"
          >
            {profileSaving ? "Enregistrement…" : "Enregistrer et commencer la prospection"}
          </Button>
        </form>
      </div>
    )
  }

  // ── Normal flow : Steps 1-3 ──────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <StepIndicator current={step} />

      {/* ── STEP 1 : Form ──────────────────────────────────────── */}
      {step === 1 && (
        <form onSubmit={handleSearch} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Secteur d&apos;activité</label>
              <Select
                value={params.secteur}
                onValueChange={(v) => setParams((p) => ({ ...p, secteur: v }))}
                required
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir un secteur" />
                </SelectTrigger>
                <SelectContent>
                  {secteurs.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Région / Ville</label>
              <Input
                placeholder="Ex : Paris, Lyon, Bordeaux…"
                value={params.region}
                onChange={(e) => setParams((p) => ({ ...p, region: e.target.value }))}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Taille d&apos;entreprise</label>
              <Select
                value={params.taille}
                onValueChange={(v) => setParams((p) => ({ ...p, taille: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tailleOptions.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={loading} className="gap-2 self-start">
            <Search className="size-4" />
            {loading ? "Recherche en cours…" : "Rechercher les entreprises"}
          </Button>
        </form>
      )}

      {/* ── STEP 2 : Company list ──────────────────────────────── */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {entreprises.length} entreprise{entreprises.length > 1 ? "s" : ""} trouvée
                {entreprises.length > 1 ? "s" : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                {params.secteur} · {params.region}
                {params.taille !== "toutes" && ` · ${tailleOptions.find((t) => t.value === params.taille)?.label}`}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={restart} className="gap-1.5">
              <ArrowLeft className="size-3.5" />
              Nouvelle recherche
            </Button>
          </div>

          {entreprises.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/20 p-8 text-center">
              <Building2 className="size-8 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm text-muted-foreground">
                Aucune entreprise trouvée pour ces critères. Essayez une autre région ou un autre secteur.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={restart}>
                Modifier la recherche
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-2.5">
                <span className="text-sm text-muted-foreground">
                  {selected.size === 0
                    ? "Sélectionnez les entreprises à contacter"
                    : `${selected.size} sélectionnée${selected.size > 1 ? "s" : ""}`}
                </span>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={toggleAll}>
                  {selected.size === entreprises.length ? "Tout désélectionner" : "Tout sélectionner"}
                </Button>
              </div>

              <div className="flex flex-col gap-3">
                {entreprises.map((e) => (
                  <Card
                    key={e.siret}
                    className={`cursor-pointer transition-colors ${
                      selected.has(e.siret) ? "border-primary ring-1 ring-primary/30" : ""
                    }`}
                    onClick={() => toggleOne(e.siret)}
                  >
                    <CardHeader className="pb-3 pt-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                            selected.has(e.siret) ? "bg-primary/10" : "bg-muted"
                          }`}
                        >
                          <Building2
                            className={`size-4 ${
                              selected.has(e.siret) ? "text-primary" : "text-muted-foreground"
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-sm font-semibold truncate">{e.nom}</CardTitle>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <MapPin className="size-3" /> {e.ville}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="size-3" /> {e.taille}
                            </span>
                          </div>
                          <EntrepriseDetails
                            siret={e.siret}
                            siren={e.siren}
                            naf_code={e.naf_code}
                            ville={e.ville}
                            code_postal={e.code_postal}
                            stopPropagation
                          />
                        </div>
                        <div
                          className={`size-4 shrink-0 rounded-full border-2 transition-colors ${
                            selected.has(e.siret)
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/40"
                          }`}
                        />
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                onClick={handleGenerateEmails}
                disabled={selected.size === 0 || loading}
                className="gap-2"
              >
                <Sparkles className="size-4" />
                {loading
                  ? "Génération en cours…"
                  : `Générer les emails (${selected.size})`}
              </Button>
            </>
          )}
        </div>
      )}

      {/* ── STEP 3 : Emails ───────────────────────────────────── */}
      {step === 3 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {emailEntreprises.length} email{emailEntreprises.length > 1 ? "s" : ""} généré
                {emailEntreprises.length > 1 ? "s" : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                Copiez chaque email et envoyez-le manuellement
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="gap-1.5">
              <ArrowLeft className="size-3.5" />
              Retour
            </Button>
          </div>

          <EnvoiManuelBanner />

          <div className="flex flex-col gap-4">
            {emailEntreprises.map((e) => (
              <Card key={e.siret}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                        <Mail className="size-4 text-violet-500" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold truncate">{e.nom}</CardTitle>
                        <p className="text-xs text-muted-foreground truncate">{e.ville} · {e.taille}</p>
                        <EntrepriseDetails
                          siret={e.siret}
                          siren={e.siren}
                          naf_code={e.naf_code}
                          ville={e.ville}
                          code_postal={e.code_postal}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={statuts[e.siret] ?? "en_attente"}
                        onValueChange={(v) =>
                          updateStatut(e.siret, v as EntrepriseProspect["statut"])
                        }
                      >
                        <SelectTrigger className="h-7 text-xs w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(statutLabels).map(([key, label]) => (
                            <SelectItem key={key} value={key} className="text-xs">
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Email généré
                      </span>
                      <CopyButton text={e.email_genere} />
                    </div>
                    <pre className="text-xs whitespace-pre-wrap leading-relaxed font-sans">
                      {e.email_genere}
                    </pre>
                  </div>

                  {/* Actions — envoi manuel depuis ta propre messagerie */}
                  <div className="mt-3">
                    {(() => {
                      const { objet, corps } = parseEmail(
                        e.email_genere,
                        `Candidature spontanée en alternance — ${e.nom}`
                      )
                      return (
                        <CandidatureActions
                          objet={objet}
                          corps={corps}
                          onMarkSent={() => markAsSent(e.siret)}
                          marking={markingSiret === e.siret}
                          sent={sentSirets.has(e.siret)}
                        />
                      )
                    })()}
                  </div>

                  <Badge
                    className={`mt-2 text-xs ${statutColors[statuts[e.siret] ?? "en_attente"]}`}
                  >
                    {statutLabels[statuts[e.siret] ?? "en_attente"]}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={restart}>
              Lancer une nouvelle recherche
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/autopilot/suivi">Voir le suivi de mes candidatures →</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
