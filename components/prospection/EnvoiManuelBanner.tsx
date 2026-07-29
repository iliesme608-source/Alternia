import { Info } from "lucide-react"

/**
 * Bandeau de contrôle légal — l'envoi reste toujours manuel.
 * Affiché après génération des emails (prospection) et sur la page de suivi.
 */
export function EnvoiManuelBanner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-start gap-2.5 bg-blue-500/8 border border-blue-500/15 text-blue-300 text-xs rounded-xl px-4 py-3 ${className}`}
    >
      <Info className="size-4 shrink-0 mt-px" />
      <p className="leading-relaxed">
        AlternaAI génère et prépare tes candidatures. L&apos;envoi est toujours manuel — tu vérifies
        le message, tu l&apos;envoies depuis ta propre boîte mail, puis tu le marques comme envoyé ici.
      </p>
    </div>
  )
}

export default EnvoiManuelBanner
