"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Camera, Save, Check } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { EmmaAvatar } from "@/components/agents/AgentAvatars"
import Link from "next/link"
import { useRouter } from "next/navigation"

// ── Data ──────────────────────────────────────────────────────────────────────

const ECOLES = [
  "HEC Paris","ESSEC","ESCP","EM Lyon","EDHEC","Audencia","Grenoble EM","SKEMA",
  "NEOMA","Kedge","ICN","Paris School of Business","IPAG","ISC Paris","INSEEC",
  "Excelia","Polytechnique","CentraleSupélec","Mines ParisTech","Ponts et Chaussées",
  "ENSTA","Télécom Paris","ISAE-SUPAERO","Arts et Métiers","Centrale Lyon",
  "Centrale Nantes","Centrale Lille","INSA Lyon","INSA Toulouse","INSA Rennes",
  "UTC Compiègne","UTT","EPITA","EPITECH","42 Paris","Université Paris 1",
  "Paris Dauphine-PSL","Paris-Saclay","Aix-Marseille Université","Université de Lyon",
  "Université de Bordeaux","Université de Lille","Université de Strasbourg",
  "Université de Nantes","Université de Toulouse","Université de Montpellier",
  "Université de Rennes","Sciences Po Paris","Sciences Po Lyon","ENSAE","ESSCA",
  "ESCE","EDC Paris","CY Tech","EFREI","ESIGELEC","MyDigitalSchool","CESI","Autre",
]

const NIVEAUX = [
  "BTS","BUT","Licence Pro","Bachelor 3","Bachelor 4",
  "Master 1","Master 2","MBA","École d'ingénieur (bac+5)","École de commerce (bac+5)",
]

const SECTEURS = [
  "Data & IA","Finance & Banque","Marketing & Com","Commerce & Vente",
  "Dev & Tech","Conseil & Audit","RH & Recrutement","Juridique",
  "Logistique & Supply Chain","Luxe & Mode","Santé","Immobilier","Autre",
]

const REGIONS = [
  "Île-de-France","Auvergne-Rhône-Alpes","Bourgogne-Franche-Comté","Bretagne",
  "Centre-Val de Loire","Corse","Grand Est","Hauts-de-France","Normandie",
  "Nouvelle-Aquitaine","Occitanie","Pays de la Loire","Provence-Alpes-Côte d'Azur",
]

const DUREES = ["1 an","2 ans","3 ans"]

// ── Typewriter ────────────────────────────────────────────────────────────────

function useTypewriter(text: string, delay = 420) {
  const [displayed, setDisplayed] = useState("")
  const [done, setDone] = useState(false)
  useEffect(() => {
    setDisplayed(""); setDone(false)
    let i = 0
    const t = setTimeout(() => {
      const iv = setInterval(() => {
        i++; setDisplayed(text.slice(0, i))
        if (i >= text.length) { setDone(true); clearInterval(iv) }
      }, 26)
      return () => clearInterval(iv)
    }, delay)
    return () => clearTimeout(t)
  }, [text, delay])
  return { displayed, done }
}

// ── EcoleCombobox ─────────────────────────────────────────────────────────────

function EcoleCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = query.length < 1
    ? ECOLES.slice(0, 8)
    : ECOLES.filter(e => e.toLowerCase().includes(query.toLowerCase())).slice(0, 8)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Rechercher ou saisir votre établissement…"
        className={inputCls}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl overflow-hidden shadow-xl"
          style={{ background: "#131316", border: "1px solid rgba(255,255,255,0.08)" }}>
          {filtered.map(e => (
            <button key={e} type="button"
              onMouseDown={() => { setQuery(e); onChange(e); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.05] hover:text-white transition-colors">
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Field({ label, children, col2 }: { label: string; children: React.ReactNode; col2?: boolean }) {
  return (
    <div className={`space-y-1.5 ${col2 ? "sm:col-span-2" : ""}`}>
      <label className="text-xs text-zinc-600 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

const inputCls = "w-full h-11 px-4 rounded-lg text-sm text-white outline-none transition-colors bg-[#09090B] border border-white/[0.06] placeholder-zinc-700 focus:border-white/[0.12]"
const selectCls = `${inputCls} cursor-pointer appearance-none`

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const [prenom, setPrenom] = useState("")
  const [nom, setNom] = useState("")
  const [ecole, setEcole] = useState("")
  const [niveau, setNiveau] = useState("")
  const [secteur, setSecteur] = useState("")
  const [region, setRegion] = useState("")
  const [dateDebut, setDateDebut] = useState("")
  const [duree, setDuree] = useState("")
  const [presentation, setPresentation] = useState("")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { displayed, done } = useTypewriter("Dis-moi qui tu es, je personnalise tout pour toi 🎯")

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push("/login"); return }
      setEmail(session.user.email ?? "")
      setUserId(session.user.id)

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single()

      if (data) {
        setPrenom(data.prenom ?? "")
        setNom(data.nom ?? "")
        setEcole(data.ecole ?? "")
        setNiveau(data.niveau ?? "")
        setSecteur(data.secteur ?? "")
        setRegion(data.region ?? "")
        setDateDebut(data.date_debut_alternance ?? "")
        setDuree(data.duree_alternance ?? "")
        setPresentation(data.presentation ?? "")
        setAvatarUrl(data.avatar_url ?? null)
      }
      setLoading(false)
    }
    load()
  }, [router])

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    const ext = file.name.split(".").pop()
    const path = `${userId}/avatar.${ext}`
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from("avatars").getPublicUrl(path)
      setAvatarUrl(data.publicUrl + `?t=${Date.now()}`)
    }
  }

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  async function handleSave() {
    if (!userId) return
    setSaving(true)
    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      prenom, nom, ecole, niveau, secteur, region,
      date_debut_alternance: dateDebut || null,
      duree_alternance: duree || null,
      presentation: presentation || null,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    showToast(error ? "Erreur lors de la sauvegarde" : "Profil mis à jour ✓")
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <div className="size-6 rounded-full border-2 border-white/[0.06] border-t-white/40 animate-spin" />
      </div>
    )
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-6 lg:px-10 py-10 min-h-[calc(100vh-56px)]">

      {/* Emma bubble */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="flex items-end gap-3 mb-10">
        <div className="shrink-0 flex size-10 items-center justify-center rounded-full border border-white/[0.06] bg-[#131316]">
          <EmmaAvatar size={28} />
        </div>
        <div className="relative px-4 py-3 max-w-sm bg-[#131316] border border-white/[0.06]"
          style={{ borderRadius: "12px 12px 12px 4px" }}>
          <p className="text-white text-[13px] leading-relaxed">
            {displayed}
            {!done && <span className="ml-0.5 inline-block w-[2px] h-[13px] bg-blue-500 align-middle animate-pulse" />}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-[11px] font-medium text-zinc-400">Emma</span>
            <span className="text-[10px] text-zinc-700">·</span>
            <span className="text-[10px] text-zinc-500">Organisation</span>
          </div>
        </div>
      </motion.div>

      {/* Card */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
        className="surface p-6 sm:p-8 mb-8">

        {/* Avatar + email */}
        <div className="flex items-center gap-5 mb-8">
          <div className="relative shrink-0">
            <div className="size-16 rounded-full overflow-hidden border border-white/[0.08] bg-white/[0.03] flex items-center justify-center">
              {avatarUrl
                ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                : <span className="text-xl font-medium text-zinc-600">{(prenom[0] ?? "?").toUpperCase()}</span>
              }
            </div>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-white hover:bg-zinc-200 transition-colors">
              <Camera className="size-3 text-black" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>
          <div>
            <p className="text-base font-medium text-white">{prenom || "Mon profil"}</p>
            <p className="text-sm text-zinc-500 mt-0.5">{email}</p>
          </div>
        </div>

        {/* Form — 2-col grid on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <Field label="Prénom">
            <input value={prenom} onChange={e => setPrenom(e.target.value)}
              placeholder="Prénom" className={inputCls} />
          </Field>
          <Field label="Nom">
            <input value={nom} onChange={e => setNom(e.target.value)}
              placeholder="Nom" className={inputCls} />
          </Field>

          <Field label="École / Établissement" col2>
            <EcoleCombobox value={ecole} onChange={setEcole} />
          </Field>

          <Field label="Niveau d'études">
            <select value={niveau} onChange={e => setNiveau(e.target.value)} className={selectCls}>
              <option value="">Sélectionner…</option>
              {NIVEAUX.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Secteur visé">
            <select value={secteur} onChange={e => setSecteur(e.target.value)} className={selectCls}>
              <option value="">Sélectionner…</option>
              {SECTEURS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>

          <Field label="Région">
            <select value={region} onChange={e => setRegion(e.target.value)} className={selectCls}>
              <option value="">Sélectionner…</option>
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Date de début souhaitée">
            <input type="month" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
              className={inputCls} style={{ colorScheme: "dark" }} />
          </Field>

          <Field label="Durée souhaitée">
            <select value={duree} onChange={e => setDuree(e.target.value)} className={selectCls}>
              <option value="">Sélectionner…</option>
              {DUREES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>

          <Field label="Présentation courte (optionnelle)" col2>
            <textarea
              value={presentation}
              onChange={e => setPresentation(e.target.value)}
              placeholder="Décris-toi en 2-3 phrases — utilisée pour personnaliser tes emails de prospection"
              rows={3}
              className="w-full px-4 py-3 rounded-lg text-sm text-white outline-none transition-colors bg-[#09090B] border border-white/[0.06] placeholder-zinc-700 focus:border-white/[0.12] resize-none leading-relaxed"
            />
          </Field>

        </div>

        {/* Save */}
        <button onClick={handleSave} disabled={saving}
          className="mt-6 w-full h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity duration-150 disabled:opacity-50 bg-gradient-blue text-white glow-blue-sm hover:opacity-90">
          {saving
            ? <div className="size-4 rounded-full border-2 border-black/20 border-t-black animate-spin" />
            : <><Save className="size-3.5" /> Sauvegarder mon profil</>
          }
        </button>
      </motion.div>

      <p className="text-center text-xs text-zinc-700 mt-4">
        Ces infos permettent aux agents de personnaliser ton accompagnement.{" "}
        <Link href="/dashboard" className="text-zinc-500 hover:text-white transition-colors">Retour au QG →</Link>
      </p>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap border border-white/[0.08] bg-[#131316] text-white"
          >
            <Check className="size-3.5 shrink-0" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
