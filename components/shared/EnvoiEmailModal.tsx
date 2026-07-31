"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2, Send, X, Check, Info } from "lucide-react"

/**
 * Modal d'envoi d'une candidature via Resend.
 * Le parent la monte uniquement quand elle doit être visible : l'état du
 * formulaire est donc réinitialisé à chaque ouverture, sans effet de reset.
 */
interface Props {
  onClose: () => void
  /** Nom de l'entreprise — affiché en titre de la modal. */
  entreprise: string
  objetInitial: string
  corpsInitial: string
  /** Prénom de l'étudiant : sert de nom d'expéditeur affiché au destinataire. */
  prenom: string
  /**
   * Appelé après un envoi réussi — marque la candidature comme « Envoyée ».
   * Une erreur ici n'annule pas l'envoi : l'email est déjà parti.
   */
  onSent: () => void | Promise<void>
}

export function EnvoiEmailModal({
  onClose, entreprise, objetInitial, corpsInitial, prenom, onSent,
}: Props) {
  const [to, setTo]        = useState("")
  const [objet, setObjet]  = useState(objetInitial)
  const [corps, setCorps]  = useState(corpsInitial)
  const [sending, setSend] = useState(false)
  const [sent, setSent]    = useState(false)
  const [error, setError]  = useState("")

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Montée uniquement après un clic : `document` est toujours disponible ici.
  // Le portail est nécessaire — les cards parentes ont un transform Framer Motion,
  // qui redéfinirait le référentiel du `position: fixed` de l'overlay.
  if (typeof document === "undefined") return null

  async function envoyer() {
    setError("")
    if (!to.trim() || !objet.trim() || !corps.trim()) {
      setError("Renseigne le destinataire, l'objet et le message.")
      return
    }
    setSend(true)
    try {
      const res = await fetch("/api/candidatures/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          subject: objet.trim(),
          body: corps,
          fromName: prenom || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setError(typeof data.error === "string" ? data.error : "Envoi impossible. Réessaie dans un instant.")
        return
      }
      setSent(true)
      await onSent()
    } catch {
      setError("Envoi impossible. Vérifie ta connexion et réessaie.")
    } finally {
      setSend(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Envoyer la candidature à ${entreprise}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.1] bg-zinc-950 p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Envoyer via Alternia</p>
            <p className="text-xs text-zinc-500 truncate">{entreprise}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="size-5 text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-emerald-400">Email envoyé ✓</p>
            <p className="text-xs text-zinc-500 max-w-xs">
              La candidature a été marquée comme « Envoyée ».
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-lg border border-white/10 px-4 py-2 text-xs text-zinc-300 hover:bg-white/5 transition-colors"
            >
              Fermer
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-zinc-500">Email du destinataire</span>
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recrutement@entreprise.fr"
                autoFocus
                className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-blue-500/50"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-zinc-500">Objet</span>
              <input
                type="text"
                value={objet}
                onChange={(e) => setObjet(e.target.value)}
                className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-zinc-500">Message</span>
              <textarea
                value={corps}
                onChange={(e) => setCorps(e.target.value)}
                rows={10}
                className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm leading-relaxed text-zinc-200 outline-none focus:border-blue-500/50 resize-y"
              />
            </label>

            {error && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                className="rounded-lg px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={envoyer}
                disabled={sending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-60"
              >
                {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                {sending ? "Envoi…" : "Envoyer maintenant"}
              </button>
            </div>

            <p className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
              <Info className="size-3.5 shrink-0 mt-0.5" />
              <span>
                L&apos;email sera envoyé depuis candidatures@alternia.fr au nom de{" "}
                <span className="text-zinc-300">{prenom || "ton prénom"}</span>. Le destinataire verra
                ton prénom comme expéditeur.
              </span>
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
