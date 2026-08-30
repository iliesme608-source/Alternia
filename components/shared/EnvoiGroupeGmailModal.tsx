"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import {
  Loader2, Send, X, Check, ShieldCheck, AlertTriangle, Users, Clock,
} from "lucide-react"
import { GMAIL_DAILY_QUOTA, GMAIL_SEND_DELAY_MS, sendViaGmail } from "@/lib/gmail-client"

/** Une candidature à envoyer — le destinataire est déjà validé par le parent. */
export interface EnvoiGroupeItem {
  /** Clé stable de la candidature côté parent (sert au marquage « Envoyée »). */
  key: string
  entreprise: string
  to: string
  objet: string
  corps: string
}

interface Props {
  items: EnvoiGroupeItem[]
  /** Adresse Gmail reliée — expéditeur réel de tous les messages. */
  adresseGmail: string
  /** Prénom de l'étudiant : nom d'affichage de l'expéditeur. */
  prenom: string
  onClose: () => void
  /**
   * Appelé après chaque envoi réussi — marque la candidature comme « Envoyée ».
   * Une erreur ici n'annule pas l'envoi : l'email est déjà parti.
   */
  onSent: (key: string) => void | Promise<void>
}

type Phase = "recap" | "envoi" | "termine"

interface Resultat {
  key: string
  entreprise: string
  to: string
  ok: boolean
  error?: string
}

function attendre(ms: number, signal: { annule: boolean }): Promise<void> {
  return new Promise((resolve) => {
    const debut = Date.now()
    const tick = () => {
      if (signal.annule || Date.now() - debut >= ms) resolve()
      else setTimeout(tick, 200)
    }
    setTimeout(tick, 200)
  })
}

export function EnvoiGroupeGmailModal({ items, adresseGmail, prenom, onClose, onSent }: Props) {
  const [phase, setPhase] = useState<Phase>("recap")
  const [index, setIndex] = useState(0)
  const [enCours, setEnCours] = useState<string | null>(null)
  const [resultats, setResultats] = useState<Resultat[]>([])
  const [needsConnection, setNeedsConnection] = useState(false)
  // Permet d'interrompre proprement si l'étudiant ferme la modal en plein envoi.
  const annulation = useRef({ annule: false })

  useEffect(() => {
    const signal = annulation.current
    return () => { signal.annule = true }
  }, [])

  // Pendant l'envoi, Échap et le clic sur l'overlay ne ferment pas : un envoi
  // séquentiel interrompu laisserait des statuts incohérents.
  const fermerAutorise = phase !== "envoi"

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && fermerAutorise) onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, fermerAutorise])

  const lancer = useCallback(async () => {
    setPhase("envoi")
    setResultats([])
    setNeedsConnection(false)

    const acc: Resultat[] = []

    for (let i = 0; i < items.length; i++) {
      if (annulation.current.annule) break
      const item = items[i]
      setIndex(i)
      setEnCours(item.entreprise)

      const res = await sendViaGmail({
        to: item.to,
        subject: item.objet,
        body: item.corps,
        fromName: prenom || undefined,
      })

      const ligne: Resultat = {
        key: item.key,
        entreprise: item.entreprise,
        to: item.to,
        ok: res.ok,
        error: res.error,
      }
      acc.push(ligne)
      setResultats([...acc])

      if (res.ok) {
        // Le statut passe à « Envoyée » dès le succès, candidature par candidature.
        try { await onSent(item.key) } catch { /* l'email est parti : on n'échoue pas ici */ }
      } else if (res.needsConnection) {
        // Gmail déconnecté / autorisation révoquée : inutile de continuer.
        setNeedsConnection(true)
        break
      }

      // Respiration de 3 s entre deux envois — évite le throttling Gmail.
      if (i < items.length - 1) await attendre(GMAIL_SEND_DELAY_MS, annulation.current)
    }

    setEnCours(null)
    setIndex(items.length)
    setPhase("termine")
  }, [items, prenom, onSent])

  if (typeof document === "undefined") return null

  const total = items.length
  const traites = resultats.length
  const progression = total === 0 ? 0 : Math.round((traites / total) * 100)
  const succes = resultats.filter((r) => r.ok).length
  const echecs = resultats.filter((r) => !r.ok)

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={() => { if (fermerAutorise) onClose() }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Envoi groupé depuis Gmail"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.1] bg-zinc-950 p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">
              {phase === "recap" ? "Tout envoyer depuis mon Gmail"
                : phase === "envoi" ? "Envoi en cours…"
                : "Envoi terminé"}
            </p>
            <p className="text-xs text-zinc-500 truncate">Expéditeur : {adresseGmail}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!fermerAutorise}
            aria-label="Fermer"
            className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ── Récapitulatif avant confirmation ──────────────────────────── */}
        {phase === "recap" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
              <Users className="size-4 shrink-0 text-zinc-400" />
              <p className="text-sm text-white">
                <span className="font-semibold">{total}</span> candidature{total > 1 ? "s" : ""} à envoyer
              </p>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-lg border border-white/[0.06] divide-y divide-white/[0.05]">
              {items.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-xs font-medium text-zinc-200 truncate">{item.entreprise}</span>
                  <span className="text-xs text-zinc-500 truncate">{item.to}</span>
                </div>
              ))}
            </div>

            <p className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-[11px] leading-relaxed text-amber-300">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span>
                Gmail limite un compte gratuit à <span className="font-semibold">{GMAIL_DAILY_QUOTA} messages
                par jour</span>. Au-delà, Google bloque temporairement l&apos;envoi. Les messages partent
                un par un, espacés de 3 secondes.
              </span>
            </p>

            <p className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
              <ShieldCheck className="size-3.5 shrink-0 mt-0.5" />
              <span>
                Une seule confirmation : après validation, les {total} messages partent depuis{" "}
                <span className="text-zinc-300">{adresseGmail}</span> sans nouvelle demande.
              </span>
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={lancer}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors"
              >
                <Send className="size-3.5" />
                Confirmer et envoyer les {total} messages
              </button>
            </div>
          </div>
        )}

        {/* ── Envoi séquentiel ──────────────────────────────────────────── */}
        {phase === "envoi" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">
                {Math.min(index + 1, total)} / {total}
              </span>
              <span className="text-zinc-600">{progression} %</span>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progression}%` }}
                role="progressbar"
                aria-valuenow={progression}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>

            {enCours && (
              <p className="flex items-center gap-2 text-xs text-zinc-400">
                <Loader2 className="size-3.5 animate-spin shrink-0" />
                Envoi à <span className="text-white font-medium">{enCours}</span>…
              </p>
            )}

            {resultats.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-white/[0.06] divide-y divide-white/[0.05]">
                {resultats.map((r) => (
                  <div key={r.key} className="flex items-center gap-2 px-3 py-1.5">
                    {r.ok
                      ? <Check className="size-3 shrink-0 text-emerald-400" />
                      : <X className="size-3 shrink-0 text-red-400" />}
                    <span className="text-xs text-zinc-300 truncate">{r.entreprise}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-zinc-600">
              <Clock className="size-3.5 shrink-0 mt-0.5" />
              Ne ferme pas cette fenêtre : les messages partent un par un, espacés de 3 secondes.
            </p>
          </div>
        )}

        {/* ── Récapitulatif final ───────────────────────────────────────── */}
        {phase === "termine" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-1.5 text-xs text-emerald-300">
                <Check className="size-3" /> {succes} envoyée{succes > 1 ? "s" : ""}
              </span>
              {echecs.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3 py-1.5 text-xs text-red-300">
                  <X className="size-3" /> {echecs.length} échec{echecs.length > 1 ? "s" : ""}
                </span>
              )}
              {traites < total && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-zinc-400">
                  {total - traites} non traitée{total - traites > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {echecs.length > 0 && (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-red-500/15 divide-y divide-white/[0.05]">
                {echecs.map((r) => (
                  <div key={r.key} className="px-3 py-2">
                    <p className="text-xs font-medium text-zinc-200 truncate">{r.entreprise}</p>
                    <p className="text-[11px] text-red-300/90 mt-0.5">{r.error ?? "Envoi refusé."}</p>
                  </div>
                ))}
              </div>
            )}

            {needsConnection && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-300">
                L&apos;envoi s&apos;est interrompu : ton Gmail n&apos;est plus relié.{" "}
                <Link href="/profil" className="underline hover:text-red-200">Reconnecter mon Gmail →</Link>
              </p>
            )}

            {succes > 0 && (
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Les candidatures envoyées sont passées au statut « Envoyée ». Les réponses des
                recruteurs arriveront dans ta boîte {adresseGmail}.
              </p>
            )}

            <div className="flex items-center justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/10 px-4 py-2 text-xs text-zinc-300 hover:bg-white/5 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
