"use client"

import { useState } from "react"
import {
  AlertTriangle, AtSign, BadgeCheck, Building2, Check, ChevronDown, Copy,
  ExternalLink, Globe, ContactRound, Loader2, Search, ShieldCheck, UserSearch,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Contacts décideurs d'une entreprise.
 *
 * Ce panneau montre TOUJOURS d'où vient chaque information :
 *   • un dirigeant issu du registre public est une donnée officielle ;
 *   • l'email qui l'accompagne est une convention, pas une certitude.
 * Rien n'est présenté comme confirmé tant que l'étudiant ne l'a pas vérifié.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Contact {
  id?: string
  full_name: string
  job_title: string
  email: string
  domain: string
  linkedin_search: string
  source: "registre_officiel" | "email_generique" | "email_nominatif" | "site_web" | "saisie_etudiant"
  email_status: "hypothese" | "confirme" | "invalide"
  outreach_rank: number
  is_primary?: boolean
  note: string
}

interface SearchLinks {
  linkedinRecruteur: string
  linkedinDirection: string
  google: string
  officialRecord: string | null
  website: string | null
}

interface Props {
  companyTargetId: string
  companyName: string
  /** Renseigne le champ « destinataire » de la candidature. */
  onUseEmail?: (email: string) => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Libellé + couleur de chaque provenance — l'étudiant doit pouvoir juger en un
// coup d'œil ce qui est vérifié et ce qui ne l'est pas.
const SOURCE_META: Record<Contact["source"], { label: string; className: string }> = {
  registre_officiel: {
    label: "Registre officiel",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  saisie_etudiant: {
    label: "Vérifié par toi",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  site_web: {
    label: "Publiée sur son site",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  email_generique: {
    label: "Adresse type",
    className: "bg-[#3B82F6]/15 text-[#93C5FD] border-[#3B82F6]/30",
  },
  email_nominatif: {
    label: "Adresse supposée",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
}

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

// ── Composant ─────────────────────────────────────────────────────────────────

export function ContactsPanel({ companyTargetId, companyName, onUseEmail }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [links, setLinks] = useState<SearchLinks | null>(null)
  const [domain, setDomain] = useState<string | null>(null)
  const [pagesRead, setPagesRead] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const [manualEmail, setManualEmail] = useState("")
  const [confirming, setConfirming] = useState(false)

  async function call(payload: Record<string, unknown>) {
    const token = await getToken()
    const res = await fetch("/api/autopilot/find-contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ companyTargetId, ...payload }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error ?? `Erreur ${res.status}`)
    return data
  }

  async function chercher() {
    setOpen(true)
    if (contacts) return // déjà chargé — on ne relance pas pour rien
    setLoading(true)
    setError(null)
    try {
      const data = await call({ action: "find" })
      setContacts(data.contacts ?? [])
      setLinks(data.searchLinks ?? null)
      setDomain(data.domain ?? null)
      setPagesRead(data.pagesRead ?? 0)
      if (data.migrationMissing) setError(data.message ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recherche impossible.")
    }
    setLoading(false)
  }

  async function confirmer() {
    const email = manualEmail.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) {
      setError("Adresse e-mail invalide.")
      return
    }
    setConfirming(true)
    setError(null)
    try {
      await call({ action: "confirm", email })
      // La liste est rechargée pour refléter le nouveau contact principal.
      const data = await call({ action: "find" })
      setContacts(data.contacts ?? [])
      setManualEmail("")
      onUseEmail?.(email)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.")
    }
    setConfirming(false)
  }

  function copier(email: string) {
    navigator.clipboard.writeText(email)
    setCopied(email)
    setTimeout(() => setCopied((c) => (c === email ? null : c)), 1800)
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs transition-transform duration-200 hover:-translate-y-px"
        onClick={chercher}
      >
        <UserSearch className="size-3.5" /> Trouver les décideurs
      </Button>
    )
  }

  const dirigeants = (contacts ?? []).filter((c) => c.source === "registre_officiel")
  const publiees = (contacts ?? []).filter((c) => c.source === "site_web")
  const services = (contacts ?? []).filter(
    (c) => c.source !== "registre_officiel" && c.source !== "site_web",
  )

  return (
    <div className="animate-fade-in flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UserSearch className="size-4 text-[#60A5FA]" />
          Contacts décideurs
        </div>
        <div className="flex items-center gap-2">
          {domain && (
            <Badge className="border-emerald-500/30 bg-emerald-500/15 text-[10px] text-emerald-300">
              <Globe className="mr-1 size-3" /> {domain} vérifié
            </Badge>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown className="size-3.5 rotate-180" />
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Lecture du registre, puis des pages contact du site de l&apos;entreprise…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && contacts && (
        <>
          {/* Dirigeants officiels */}
          {dirigeants.length > 0 && (
            <section className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Dirigeants (registre public)
              </p>
              {dirigeants.map((c, i) => (
                <ContactRow
                  key={c.id ?? `d-${i}`}
                  contact={c}
                  copied={copied === c.email}
                  onCopy={() => copier(c.email)}
                  onUse={onUseEmail ? () => onUseEmail(c.email) : undefined}
                />
              ))}
            </section>
          )}

          {/* Adresses publiées par l'entreprise elle-même */}
          {publiees.length > 0 && (
            <section className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Publiées par l&apos;entreprise
              </p>
              {publiees.map((c, i) => (
                <ContactRow
                  key={c.id ?? `p-${i}`}
                  contact={c}
                  copied={copied === c.email}
                  onCopy={() => copier(c.email)}
                  onUse={onUseEmail ? () => onUseEmail(c.email) : undefined}
                />
              ))}
            </section>
          )}

          {pagesRead > 0 && publiees.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              {pagesRead} page{pagesRead > 1 ? "s" : ""} du site lue{pagesRead > 1 ? "s" : ""} : aucune adresse
              publiée. Les adresses ci-dessous sont des formats types, à vérifier.
            </p>
          )}

          {/* Adresses types / confirmées */}
          {services.length > 0 && (
            <section className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Adresses de contact
              </p>
              {services.map((c, i) => (
                <ContactRow
                  key={c.id ?? `s-${i}`}
                  contact={c}
                  copied={copied === c.email}
                  onCopy={() => copier(c.email)}
                  onUse={onUseEmail ? () => onUseEmail(c.email) : undefined}
                />
              ))}
            </section>
          )}

          {contacts.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Aucun dirigeant publié au registre et aucun domaine e-mail vérifiable pour cette
              entreprise. Utilise les recherches ci-dessous pour identifier la bonne personne.
            </p>
          )}

          {/* Liens de recherche */}
          {links && (
            <section className="flex flex-col gap-2 border-t border-white/[0.06] pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Retrouver la bonne personne
              </p>
              <div className="flex flex-wrap gap-2">
                <SearchLink href={links.linkedinRecruteur} icon={<ContactRound className="size-3.5" />}>
                  Recruteur sur LinkedIn
                </SearchLink>
                <SearchLink href={links.linkedinDirection} icon={<ContactRound className="size-3.5" />}>
                  Direction
                </SearchLink>
                <SearchLink href={links.google} icon={<Search className="size-3.5" />}>
                  Recherche Google
                </SearchLink>
                {links.website && (
                  <SearchLink href={links.website} icon={<Globe className="size-3.5" />}>
                    Site de l&apos;entreprise
                  </SearchLink>
                )}
                {links.officialRecord && (
                  <SearchLink href={links.officialRecord} icon={<Building2 className="size-3.5" />}>
                    Fiche officielle
                  </SearchLink>
                )}
              </div>
            </section>
          )}

          {/* Confirmation manuelle */}
          <section className="flex flex-col gap-2 border-t border-white/[0.06] pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              J&apos;ai trouvé la bonne adresse
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <AtSign className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  placeholder={`prenom.nom@${domain ?? "entreprise.fr"}`}
                  className="h-9 pl-8 text-sm"
                />
              </div>
              <Button
                size="sm"
                className="h-9 gap-1.5 text-xs"
                disabled={confirming || !manualEmail.trim()}
                onClick={confirmer}
              >
                {confirming ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
                Confirmer ce contact
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Une adresse confirmée devient le contact principal de {companyName} : elle est
              réutilisée par l&apos;agent de démarchage et prioritaire sur toute adresse supposée.
            </p>
          </section>
        </>
      )}
    </div>
  )
}

// ── Sous-composants ───────────────────────────────────────────────────────────

function ContactRow({
  contact, copied, onCopy, onUse,
}: {
  contact: Contact
  copied: boolean
  onCopy: () => void
  onUse?: () => void
}) {
  const meta = SOURCE_META[contact.source]
  const confirme = contact.email_status === "confirme"

  return (
    <div className="group flex flex-col gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 transition-colors duration-200 hover:border-white/[0.14]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {contact.full_name || contact.job_title}
          </p>
          {contact.full_name && contact.job_title && (
            <p className="truncate text-xs text-muted-foreground">{contact.job_title}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {confirme && (
            <Badge className="border-emerald-500/30 bg-emerald-500/15 text-[10px] text-emerald-300">
              <BadgeCheck className="mr-1 size-3" /> Confirmé
            </Badge>
          )}
          <Badge className={`text-[10px] ${meta.className}`}>{meta.label}</Badge>
        </div>
      </div>

      {contact.email && (
        <div className="flex flex-wrap items-center gap-2">
          <code className="truncate rounded bg-black/30 px-2 py-1 text-xs text-[#93C5FD]">
            {contact.email}
          </code>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onCopy}>
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? "Copié" : "Copier"}
          </Button>
          {onUse && (
            <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onUse}>
              Utiliser
            </Button>
          )}
          {contact.linkedin_search && (
            <a
              href={contact.linkedin_search}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#60A5FA] transition-opacity hover:opacity-80"
            >
              <ContactRound className="size-3" /> LinkedIn
            </a>
          )}
        </div>
      )}

      {/* La provenance est toujours dite en clair — jamais de faux contact. */}
      {contact.note && !confirme && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{contact.note}</p>
      )}
    </div>
  )
}

function SearchLink({
  href, icon, children,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-zinc-300 transition-all duration-200 hover:-translate-y-px hover:border-white/20 hover:bg-white/5 hover:text-white"
    >
      {icon}
      {children}
      <ExternalLink className="size-3 opacity-50" />
    </a>
  )
}
