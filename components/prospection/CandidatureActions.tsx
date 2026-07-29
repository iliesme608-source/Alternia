"use client"

import { useState } from "react"
import { Copy, Check, Mail, Send, Loader2 } from "lucide-react"
import { fullEmailText, gmailUrl, mailtoUrl } from "@/lib/suivi"

interface CandidatureActionsProps {
  objet: string
  corps: string
  /** Marque la candidature comme envoyée (PATCH /api/prospection/update-status). */
  onMarkSent?: () => void | Promise<void>
  marking?: boolean
  /** true quand la candidature est déjà au statut « Envoyée ». */
  sent?: boolean
}

const btn =
  "inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-[11px] font-medium border transition-colors disabled:opacity-50"

/**
 * Les 4 actions d'une candidature : copier, Gmail, messagerie, marquer envoyée.
 * Utilisé sur la page prospection (après génération) et sur la page de suivi.
 */
export function CandidatureActions({
  objet,
  corps,
  onMarkSent,
  marking = false,
  sent = false,
}: CandidatureActionsProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(fullEmailText(objet, corps))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className={`${btn} border-white/[0.10] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]`}
      >
        {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
        {copied ? "Copié ✓" : "Copier l'email"}
      </button>

      <a
        href={gmailUrl(objet, corps)}
        target="_blank"
        rel="noopener noreferrer"
        className={`${btn} border-red-500/20 bg-red-500/[0.08] text-red-300 hover:bg-red-500/[0.14]`}
      >
        <Mail className="size-3" />
        Ouvrir dans Gmail
      </a>

      <a
        href={mailtoUrl(objet, corps)}
        className={`${btn} border-white/[0.10] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]`}
      >
        <Send className="size-3" />
        Ouvrir dans ma messagerie
      </a>

      {onMarkSent && (
        <button
          type="button"
          onClick={() => onMarkSent()}
          disabled={marking || sent}
          className={`${btn} ${
            sent
              ? "border-blue-500/25 bg-blue-500/[0.14] text-blue-300"
              : "border-blue-500/20 bg-blue-500/[0.08] text-blue-400 hover:bg-blue-500/[0.14]"
          }`}
        >
          {marking ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
          {sent ? "Marquée envoyée" : "Marquer comme envoyée"}
        </button>
      )}
    </div>
  )
}

export default CandidatureActions
