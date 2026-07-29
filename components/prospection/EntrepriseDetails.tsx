"use client"

import { useState } from "react"
import { ChevronDown, ExternalLink } from "lucide-react"
import { annuaireUrl } from "@/lib/suivi"

interface EntrepriseDetailsProps {
  siret?: string | null
  siren?: string | null
  naf_code?: string | null
  ville?: string | null
  code_postal?: string | null
  /** Empêche le clic de sélectionner/désélectionner la card parente. */
  stopPropagation?: boolean
}

/**
 * Badges de vérification SIRENE + détails repliés par défaut.
 * Affiché sous le nom de l'entreprise sur chaque card.
 */
export function EntrepriseDetails({
  siret,
  siren,
  naf_code,
  ville,
  code_postal,
  stopPropagation = false,
}: EntrepriseDetailsProps) {
  const [open, setOpen] = useState(false)

  const sirenValue = siren ?? (/^\d{14}$/.test(siret ?? "") ? siret!.slice(0, 9) : null)
  const url = annuaireUrl(sirenValue)

  const rows: Array<[string, string]> = []
  if (sirenValue) rows.push(["SIREN", sirenValue])
  if (siret) rows.push(["SIRET", siret])
  if (naf_code) rows.push(["Code NAF", naf_code])
  if (ville) rows.push(["Ville", code_postal ? `${ville} (${code_postal})` : ville])

  return (
    <div className="mt-2">
      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          ✓ Entreprise réelle vérifiée
        </span>
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-400">
          ◎ Cible de prospection
        </span>
      </div>

      {/* Toggle */}
      <button
        type="button"
        onClick={(e) => {
          if (stopPropagation) e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ChevronDown className={`size-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
        {open ? "Masquer les détails" : "Voir les détails"}
      </button>

      {/* Détails */}
      {open && (
        <div
          className="mt-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 space-y-1"
          onClick={(e) => { if (stopPropagation) e.stopPropagation() }}
        >
          {rows.map(([label, value]) => (
            <p key={label} className="text-[11px] text-zinc-400">
              <span className="text-zinc-500">{label} :</span>{" "}
              <span className="font-mono text-zinc-300">{value}</span>
            </p>
          ))}
          <p className="text-[11px] text-zinc-500">Source : registre SIRENE officiel</p>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { if (stopPropagation) e.stopPropagation() }}
              className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
            >
              Voir la fiche officielle
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export default EntrepriseDetails
