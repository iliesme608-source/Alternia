"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Building2, ExternalLink, GraduationCap, Search, Target, UserSearch } from "lucide-react"
import { Field, Hint, ModuleCard, TextInput, type LinkedInProfil } from "./ui"

interface RechercheAlumni {
  icon: React.ElementType
  label: string
  description: string
  keywords: string[]
}

const LINKEDIN_PEOPLE_SEARCH = "https://www.linkedin.com/search/results/people/?keywords="

/** Construit l'URL de recherche LinkedIn à partir des mots-clés. */
function searchUrl(keywords: string[]): string {
  return LINKEDIN_PEOPLE_SEARCH + encodeURIComponent(keywords.filter(Boolean).join(" "))
}

export function AlumniModule({ profil }: { profil: LinkedInProfil }) {
  const [entreprise, setEntreprise] = useState("")
  const [poste,      setPoste]      = useState(profil.posteRecherche)

  const entrepriseClean = entreprise.trim()
  const posteClean      = poste.trim() || profil.posteRecherche
  const ecole           = profil.ecole.trim()

  const recherches: RechercheAlumni[] = [
    {
      icon: GraduationCap,
      label: "Alumni de ton école",
      description: ecole
        ? `Les ancien·nes de ${ecole} qui travaillent chez ${entrepriseClean || "l'entreprise"}`
        : "Renseigne ton école dans ton profil pour activer cette recherche",
      keywords: [ecole, entrepriseClean],
    },
    {
      icon: UserSearch,
      label: "Recruteurs & RH",
      description: `Les personnes qui gèrent le recrutement alternance chez ${entrepriseClean || "l'entreprise"}`,
      keywords: [entrepriseClean, "recrutement", "alternance"],
    },
    {
      icon: Target,
      label: "Manager du service visé",
      description: posteClean
        ? `Les managers ${posteClean} chez ${entrepriseClean || "l'entreprise"}`
        : "Indique le poste visé pour cibler le bon service",
      keywords: [entrepriseClean, posteClean],
    },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

      <div className="flex flex-col gap-5">
        <ModuleCard icon={Building2} title="Ton entreprise cible">
          <div className="flex flex-col gap-4">
            <Field label="Entreprise cible *">
              <TextInput
                value={entreprise}
                onChange={setEntreprise}
                placeholder="ex: Capgemini, Decathlon, BNP Paribas…"
              />
            </Field>
            <Field label="Poste visé">
              <TextInput
                value={poste}
                onChange={setPoste}
                placeholder="ex: Développeur Full Stack, Data Analyst…"
              />
            </Field>
            <div className="flex items-center gap-2 text-[11px] text-zinc-600">
              <GraduationCap className="size-3.5 shrink-0" />
              {ecole
                ? <span>École reprise de ton profil : <span className="text-zinc-400">{ecole}</span></span>
                : <span className="text-amber-400/80">Aucune école dans ton profil — complète-la dans /profil.</span>}
            </div>
          </div>
        </ModuleCard>

        <Hint icon={Search}>
          Un alumni te répond parce qu&apos;il a vécu la même formation que toi : le taux de réponse
          est bien plus élevé qu&apos;un email RH envoyé à froid, et une recommandation interne
          amène ton CV directement sur le bureau du manager.
        </Hint>
      </div>

      <div className="flex flex-col gap-4">
        {recherches.map((r, i) => {
          const active = entrepriseClean.length > 0 && r.keywords.every(Boolean)
          return (
            <motion.a
              key={r.label}
              href={active ? searchUrl(r.keywords) : undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!active}
              onClick={e => { if (!active) e.preventDefault() }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`surface p-5 flex items-start gap-4 transition-all ${
                active
                  ? "surface-hover hover:bg-white/[0.05] cursor-pointer"
                  : "opacity-40 cursor-not-allowed"
              }`}
            >
              <div className="size-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                <r.icon className="size-4 text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-medium text-white">{r.label}</h3>
                  {active && <ExternalLink className="size-3 text-zinc-600" />}
                </div>
                <p className="text-[13px] text-zinc-500 leading-relaxed">{r.description}</p>
              </div>
            </motion.a>
          )
        })}

        <p className="text-[11px] text-zinc-700 text-center">
          Les recherches s&apos;ouvrent dans un nouvel onglet LinkedIn.
        </p>
      </div>
    </div>
  )
}
