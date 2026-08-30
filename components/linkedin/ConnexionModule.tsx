"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Handshake, Lightbulb, MessageSquarePlus, Users } from "lucide-react"
import type { ConnexionResult, ConnexionVariante, LienCommun } from "@/app/api/linkedin/connexion/route"
import {
  CopyBtn, EmptyState, ErrorText, Field, GenerateButton, Hint,
  LoadingState, ModuleCard, Select, TextInput, type LinkedInProfil,
} from "./ui"

/** Limite stricte imposée par LinkedIn sur une note de connexion. */
const MAX_CHARS = 280

const LIENS: readonly { value: LienCommun; label: string }[] = [
  { value: "ecole",   label: "Même école" },
  { value: "filiere", label: "Même filière" },
  { value: "ville",   label: "Même ville" },
  { value: "aucun",   label: "Aucun lien commun" },
]

const VARIANTE_META: Record<ConnexionVariante["type"], { label: string; icon: React.ElementType }> = {
  conseil:          { label: "Demande de conseil",        icon: Lightbulb },
  mise_en_relation: { label: "Demande de mise en relation", icon: Handshake },
}

/** Un message éditable, avec compteur de caractères en direct. */
function VarianteCard({ variante, index }: { variante: ConnexionVariante; index: number }) {
  const [message, setMessage] = useState(variante.message)
  const meta = VARIANTE_META[variante.type]
  const over = message.length > MAX_CHARS

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="surface p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <meta.icon className="size-4 text-blue-400" />
          <h3 className="text-sm font-medium text-white">{meta.label}</h3>
        </div>
        <CopyBtn text={message} />
      </div>

      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        rows={4}
        className={`w-full px-4 py-3 rounded-xl text-[13px] text-white bg-white/[0.04] border leading-relaxed resize-none focus:outline-none transition-colors ${
          over ? "border-red-500/40 focus:border-red-500/60" : "border-white/[0.08] focus:border-blue-500/40"
        }`}
      />

      <div className="flex items-center justify-between mt-2">
        <span className={`text-[11px] ${over ? "text-red-400" : "text-zinc-600"}`}>
          {message.length} / {MAX_CHARS} caractères
        </span>
        {over && <span className="text-[11px] text-red-400">LinkedIn refusera l&apos;envoi</span>}
      </div>

      {/* Jauge de remplissage */}
      <div className="h-1 mt-2 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          animate={{ width: `${Math.min((message.length / MAX_CHARS) * 100, 100)}%` }}
          transition={{ duration: 0.2 }}
          style={{ background: over ? "#F87171" : "linear-gradient(90deg, #3B82F6, #2563EB)" }}
        />
      </div>
    </motion.div>
  )
}

export function ConnexionModule({ profil }: { profil: LinkedInProfil }) {
  const [nomPersonne,   setNomPersonne]   = useState("")
  const [postePersonne, setPostePersonne] = useState("")
  const [entreprise,    setEntreprise]    = useState("")
  const [lienCommun,    setLienCommun]    = useState<LienCommun>("ecole")
  const [loading,       setLoading]       = useState(false)
  const [result,        setResult]        = useState<ConnexionResult | null>(null)
  const [error,         setError]         = useState("")
  // Incrémenté à chaque génération : remonte les textareas éditables des variantes.
  const [generation,    setGeneration]    = useState(0)

  const ready = nomPersonne.trim().length > 0 && entreprise.trim().length > 0

  async function handleGenerate() {
    if (!ready) return
    setLoading(true)
    setError("")
    setResult(null)
    try {
      const res = await fetch("/api/linkedin/connexion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomPersonne, postePersonne, entreprise, lienCommun,
          prenom: profil.prenom, ecole: profil.ecole, niveau: profil.niveau,
          secteur: profil.secteur, region: profil.region, posteVise: profil.posteRecherche,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResult(data as ConnexionResult)
      setGeneration(g => g + 1)
    } catch {
      setError("Erreur lors de la génération. Réessaie.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

      <div className="flex flex-col gap-5">
        <ModuleCard icon={Users} title="La personne à contacter">
          <div className="flex flex-col gap-4">
            <Field label="Nom de la personne *">
              <TextInput value={nomPersonne} onChange={setNomPersonne} placeholder="ex: Camille Durand" onEnter={handleGenerate} />
            </Field>
            <Field label="Son poste">
              <TextInput value={postePersonne} onChange={setPostePersonne} placeholder="ex: Lead Data Analyst" onEnter={handleGenerate} />
            </Field>
            <Field label="Entreprise *">
              <TextInput value={entreprise} onChange={setEntreprise} placeholder="ex: Decathlon" onEnter={handleGenerate} />
            </Field>
            <Field label="Lien commun">
              <Select value={lienCommun} onChange={setLienCommun} options={LIENS} />
            </Field>
          </div>
        </ModuleCard>

        <GenerateButton
          loading={loading}
          disabled={!ready}
          onClick={handleGenerate}
          idleLabel="Générer mes 2 messages"
          loadingLabel="Thomas rédige tes messages…"
        />

        <ErrorText message={error} />

        <Hint icon={MessageSquarePlus}>
          Une note de connexion est limitée à {MAX_CHARS} caractères. Ne demande jamais un poste dès
          le premier message : demande 15 minutes d&apos;échange, la conversation fera le reste.
        </Hint>
      </div>

      <div className="flex flex-col gap-5">
        {!result && !loading && (
          <EmptyState
            emoji="🤝"
            text="Renseigne la personne à contacter : Thomas rédige deux notes de connexion prêtes à envoyer."
          />
        )}
        {loading && <LoadingState text="Thomas rédige tes messages…" />}
        {result?.variantes.map((v, i) => (
          <VarianteCard key={`${generation}-${v.type}`} variante={v} index={i} />
        ))}
      </div>
    </div>
  )
}
