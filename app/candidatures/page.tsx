"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { supabase } from "@/lib/supabase"
import { AgentChat } from "@/components/shared/AgentChat"
import { Plus, Mail, Calendar, X, Check, Loader2, Copy } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────

type ColumnId = "a_prospecter" | "email_envoye" | "entretien_planifie" | "relance" | "resultat"

interface Candidature {
  id: string
  entreprise: string
  poste: string
  dateContact: string
  colonne: ColumnId
  resultat?: "accepte" | "refuse"
  source: "prospection" | "manuel"
}

// ── Colonnes ──────────────────────────────────────────────────────────────────

const COLUMNS: { id: ColumnId; label: string; dotColor: string; bgColor: string; borderColor: string }[] = [
  { id: "a_prospecter",       label: "À prospecter",      dotColor: "#52525B", bgColor: "rgba(82,82,91,0.10)",   borderColor: "rgba(82,82,91,0.20)"   },
  { id: "email_envoye",       label: "Email envoyé",       dotColor: "#3B82F6", bgColor: "rgba(59,130,246,0.07)", borderColor: "rgba(59,130,246,0.18)" },
  { id: "entretien_planifie", label: "Entretien planifié", dotColor: "#7C3AED", bgColor: "rgba(124,58,237,0.07)", borderColor: "rgba(124,58,237,0.18)" },
  { id: "relance",            label: "Relance",            dotColor: "#EA580C", bgColor: "rgba(234,88,12,0.07)",  borderColor: "rgba(234,88,12,0.20)"  },
  { id: "resultat",           label: "Résultat",           dotColor: "#22C55E", bgColor: "rgba(34,197,94,0.05)",  borderColor: "rgba(34,197,94,0.15)"  },
]

// ── LocalStorage helpers ───────────────────────────────────────────────────────

const LS_KEY = "alternia-candidatures-v2"

function loadLS(): Candidature[] {
  if (typeof window === "undefined") return []
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") } catch { return [] }
}

function saveLS(data: Candidature[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CandidaturesPage() {
  const [cards, setCards]           = useState<Candidature[]>([])
  const [dragId, setDragId]         = useState<string | null>(null)
  const [overCol, setOverCol]       = useState<ColumnId | null>(null)
  const [showAdd, setShowAdd]       = useState(false)
  const [addForm, setAddForm]       = useState({ entreprise: "", poste: "" })
  const [relanceId, setRelanceId]   = useState<string | null>(null)
  const [relanceModal, setRelanceModal] = useState<{ id: string; email: string } | null>(null)
  const [copied, setCopied]         = useState(false)
  const [prenom, setPrenom]         = useState("")

  // ── Mount: load localStorage then merge Supabase ───────────────────────────
  useEffect(() => {
    const local = loadLS()
    setCards(local)

    async function loadSupabase() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      setPrenom(session.user.user_metadata?.prenom ?? "")

      const { data } = await supabase
        .from("prospection_campagnes")
        .select("id, entreprises, created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })

      if (!data) return

      setCards(prev => {
        const existingIds = new Set(prev.map(c => c.id))
        const newCards: Candidature[] = []

        for (const campagne of data) {
          const ents = (campagne.entreprises ?? []) as Array<{ nom: string; statut: string }>
          for (const e of ents) {
            const id = `prosp-${campagne.id}-${e.nom}`
            if (existingIds.has(id)) continue
            let colonne: ColumnId = "a_prospecter"
            let resultat: Candidature["resultat"] = undefined
            if (e.statut === "envoye")    { colonne = "email_envoye" }
            if (e.statut === "repondu")   { colonne = "resultat"; resultat = "accepte" }
            if (e.statut === "sans_suite"){ colonne = "resultat"; resultat = "refuse" }
            newCards.push({ id, entreprise: e.nom, poste: "Alternance", dateContact: campagne.created_at, colonne, resultat, source: "prospection" })
          }
        }

        const merged = [...prev, ...newCards]
        saveLS(merged)
        return merged
      })
    }

    loadSupabase()
  }, [])

  // ── Card mutations ─────────────────────────────────────────────────────────

  const moveCard = useCallback((cardId: string, toCol: ColumnId) => {
    setCards(prev => {
      const updated = prev.map(c => c.id === cardId ? { ...c, colonne: toCol } : c)
      saveLS(updated)
      return updated
    })
  }, [])

  function setResultat(cardId: string, res: "accepte" | "refuse") {
    setCards(prev => {
      const updated = prev.map(c => c.id === cardId ? { ...c, resultat: res, colonne: "resultat" as ColumnId } : c)
      saveLS(updated)
      return updated
    })
  }

  function removeCard(cardId: string) {
    setCards(prev => {
      const updated = prev.filter(c => c.id !== cardId)
      saveLS(updated)
      return updated
    })
  }

  function addManual() {
    if (!addForm.entreprise.trim()) return
    const card: Candidature = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      entreprise: addForm.entreprise.trim(),
      poste: addForm.poste.trim() || "Alternance",
      dateContact: new Date().toISOString(),
      colonne: "a_prospecter",
      source: "manuel",
    }
    setCards(prev => { const u = [...prev, card]; saveLS(u); return u })
    setAddForm({ entreprise: "", poste: "" })
    setShowAdd(false)
  }

  // ── Relance ────────────────────────────────────────────────────────────────

  async function handleRelance(card: Candidature) {
    setRelanceId(card.id)
    try {
      const res = await fetch("/api/candidatures/relance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entreprise: card.entreprise,
          poste: card.poste,
          prenom,
          dateContact: new Date(card.dateContact).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }),
        }),
      })
      const data = await res.json()
      if (data.email) {
        setRelanceModal({ id: card.id, email: data.email })
        moveCard(card.id, "relance")
      }
    } catch { /* silent */ }
    setRelanceId(null)
  }

  function copyEmail() {
    if (!relanceModal) return
    navigator.clipboard.writeText(relanceModal.email)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  const byCol = (id: ColumnId) => cards.filter(c => c.colonne === id)

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-[1440px] mx-auto px-6 lg:px-10 py-10">

      <div className="mb-8">
        <AgentChat
          agentName="Emma" agentEmoji="📅" agentTitle="Agent Organisation"
          agentDescription="Je surveille tes candidatures et je te rappelle de relancer au bon moment."
          features={["Suivi Kanban en temps réel", "Import depuis Prospection", "Emails de relance IA"]}
          userMessage="Emma, où en sont mes candidatures ?"
          agentMessage="Je surveille tes candidatures et je te rappelle de relancer au bon moment 📅"
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Candidatures</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {cards.length} candidature{cards.length !== 1 ? "s" : ""} suivie{cards.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-gradient-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold glow-blue-sm hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <Plus className="size-4" />
          Ajouter
        </button>
      </div>

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto pb-6" style={{ minHeight: "62vh" }}>
        {COLUMNS.map(col => {
          const colCards = byCol(col.id)
          const isOver = overCol === col.id
          return (
            <div
              key={col.id}
              className="flex-none w-[230px] flex flex-col"
              onDragOver={(e) => { e.preventDefault(); setOverCol(col.id) }}
              onDragLeave={(e) => {
                if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOverCol(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                const id = e.dataTransfer.getData("card-id")
                if (id) moveCard(id, col.id)
                setOverCol(null)
                setDragId(null)
              }}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 px-1 mb-2">
                <div className="size-2 rounded-full shrink-0" style={{ background: col.dotColor }} />
                <span className="text-xs font-medium text-zinc-400">{col.label}</span>
                <span className="ml-auto text-xs text-zinc-600 font-mono">{colCards.length}</span>
              </div>

              {/* Drop zone */}
              <div
                className="flex-1 rounded-xl p-2 flex flex-col gap-2 min-h-[200px] transition-all duration-150"
                style={{
                  background: isOver ? "rgba(255,255,255,0.05)" : col.bgColor,
                  border: `1px dashed ${isOver ? "rgba(255,255,255,0.25)" : col.borderColor}`,
                }}
              >
                {colCards.map(card => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("card-id", card.id); setDragId(card.id) }}
                    onDragEnd={() => { setDragId(null); setOverCol(null) }}
                    className="rounded-xl p-3 cursor-grab active:cursor-grabbing select-none group transition-all duration-100"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      opacity: dragId === card.id ? 0.35 : 1,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                    }}
                  >
                    {/* Card header */}
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <p className="text-sm font-medium text-white leading-tight line-clamp-2">{card.entreprise}</p>
                      <button
                        onClick={() => removeCard(card.id)}
                        className="text-zinc-800 hover:text-zinc-500 transition-colors shrink-0 mt-0.5 opacity-0 group-hover:opacity-100"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                    <p className="text-[11px] text-zinc-500 mb-2.5 truncate">{card.poste}</p>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-600 mb-3">
                      <Calendar className="size-3 shrink-0" />
                      {fmtDate(card.dateContact)}
                    </div>

                    {/* Résultat toggles */}
                    {col.id === "resultat" && (
                      <div className="flex gap-1 mb-2">
                        <button
                          onClick={() => setResultat(card.id, "accepte")}
                          className={`flex-1 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                            card.resultat === "accepte"
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "border border-white/[0.06] text-zinc-700 hover:text-zinc-400"
                          }`}
                        >
                          <Check className="size-2.5 inline mr-0.5" />Accepté
                        </button>
                        <button
                          onClick={() => setResultat(card.id, "refuse")}
                          className={`flex-1 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                            card.resultat === "refuse"
                              ? "bg-red-500/15 text-red-400 border border-red-500/25"
                              : "border border-white/[0.06] text-zinc-700 hover:text-zinc-400"
                          }`}
                        >
                          <X className="size-2.5 inline mr-0.5" />Refusé
                        </button>
                      </div>
                    )}

                    {/* Relancer button */}
                    <button
                      onClick={() => handleRelance(card)}
                      disabled={relanceId === card.id}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-60 border border-blue-500/20 bg-blue-500/[0.07] text-blue-400 hover:bg-blue-500/[0.14]"
                    >
                      {relanceId === card.id
                        ? <Loader2 className="size-3 animate-spin" />
                        : <Mail className="size-3" />
                      }
                      {relanceId === card.id ? "Génération…" : "Relancer"}
                    </button>
                  </div>
                ))}

                {colCards.length === 0 && !isOver && (
                  <div className="flex-1 flex items-center justify-center py-8">
                    <p className="text-[11px] text-zinc-800">Dépose une carte ici</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setShowAdd(false)}
          >
            <motion.div
              initial={{ scale: 0.97, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 10 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-xl border border-white/[0.08] bg-[#0C1221] p-6"
            >
              <h2 className="text-white font-semibold mb-5">Ajouter une candidature</h2>
              <div className="flex flex-col gap-3 mb-5">
                <input
                  autoFocus
                  value={addForm.entreprise}
                  onChange={e => setAddForm(f => ({ ...f, entreprise: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && addManual()}
                  placeholder="Nom de l'entreprise *"
                  className="h-11 px-4 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] placeholder-zinc-700 focus:border-blue-500/40 focus:outline-none transition-colors"
                />
                <input
                  value={addForm.poste}
                  onChange={e => setAddForm(f => ({ ...f, poste: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && addManual()}
                  placeholder="Poste visé (optionnel)"
                  className="h-11 px-4 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] placeholder-zinc-700 focus:border-blue-500/40 focus:outline-none transition-colors"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-zinc-300 text-sm hover:bg-white/5 transition-colors">
                  Annuler
                </button>
                <button
                  onClick={addManual}
                  disabled={!addForm.entreprise.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-blue text-white text-sm font-semibold glow-blue-sm hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  Ajouter
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Relance email modal */}
      <AnimatePresence>
        {relanceModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
            onClick={() => setRelanceModal(null)}
          >
            <motion.div
              initial={{ scale: 0.97, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 10 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg rounded-xl border border-white/[0.08] bg-[#0C1221] p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-blue-400" />
                  <h2 className="text-white font-semibold">Email de relance généré</h2>
                </div>
                <button onClick={() => setRelanceModal(null)} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                  <X className="size-4" />
                </button>
              </div>
              <pre className="text-[13px] text-zinc-300 whitespace-pre-wrap leading-relaxed bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] font-sans max-h-72 overflow-y-auto mb-4">
                {relanceModal.email}
              </pre>
              <div className="flex gap-2">
                <button
                  onClick={copyEmail}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 text-zinc-300 text-sm hover:bg-white/5 transition-colors"
                >
                  {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                  {copied ? "Copié !" : "Copier"}
                </button>
                <button onClick={() => setRelanceModal(null)} className="flex-1 py-2.5 rounded-xl bg-gradient-blue text-white text-sm font-semibold hover:opacity-90 transition-opacity">
                  Fermer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
