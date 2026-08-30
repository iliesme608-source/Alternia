"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

/** Quota d'envoi Gmail d'un compte gratuit — rappelé avant tout envoi groupé. */
export const GMAIL_DAILY_QUOTA = 500

/** Pause entre deux envois groupés (ms). */
export const GMAIL_SEND_DELAY_MS = 3000

export interface GmailConnection {
  loading: boolean
  connected: boolean
  /** Adresse Gmail reliée, ou null. */
  address: string | null
  /** La migration supabase/gmail_tokens.sql n'a pas encore été exécutée. */
  tableMissing: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  refresh: () => Promise<void>
}

/**
 * Lit l'état de la connexion Gmail via la RLS de gmail_tokens
 * (`auth.uid() = user_id`) : on ne sélectionne que l'adresse, jamais le refresh_token.
 */
async function lireConnexion(): Promise<{ address: string | null; tableMissing: boolean }> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.user) return { address: null, tableMissing: false }

  const { data, error } = await supabase
    .from("gmail_tokens")
    .select("email_address")
    .eq("user_id", session.user.id)
    .maybeSingle()

  // 42P01 = relation inexistante : migration non jouée, on ne casse pas la page.
  if (error) return { address: null, tableMissing: error.code === "42P01" }
  return { address: (data?.email_address as string | undefined) ?? null, tableMissing: false }
}

/**
 * État de la connexion Gmail de l'étudiant.
 */
export function useGmailConnection(): GmailConnection {
  const [loading, setLoading] = useState(true)
  const [address, setAddress] = useState<string | null>(null)
  const [tableMissing, setTableMissing] = useState(false)

  const refresh = useCallback(async () => {
    const etat = await lireConnexion()
    setAddress(etat.address)
    setTableMissing(etat.tableMissing)
    setLoading(false)
  }, [])

  useEffect(() => {
    let annule = false
    // Le setState vit dans le callback de la promesse, jamais dans le corps de
    // l'effet : sinon React déclenche un rendu en cascade au montage.
    lireConnexion().then((etat) => {
      if (annule) return
      setAddress(etat.address)
      setTableMissing(etat.tableMissing)
      setLoading(false)
    })
    return () => { annule = true }
  }, [])

  const connect = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) return
    // Navigation plein écran : Google refuse d'afficher son écran de consentement
    // dans une iframe, et un fetch ne peut pas suivre la redirection utilement.
    window.location.href = `/api/gmail/auth?token=${encodeURIComponent(session.access_token)}`
  }, [])

  const disconnect = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) return
    await supabase.from("gmail_tokens").delete().eq("user_id", session.user.id)
    setAddress(null)
  }, [])

  return { loading, connected: !!address, address, tableMissing, connect, disconnect, refresh }
}

export interface GmailSendResult {
  ok: boolean
  error?: string
  /** true quand il faut (re)connecter Gmail — 403 côté API. */
  needsConnection?: boolean
}

/** Envoie un email via /api/gmail/send avec le jeton Supabase de l'étudiant. */
export async function sendViaGmail(input: {
  to: string
  subject: string
  body: string
  fromName?: string
}): Promise<GmailSendResult> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) return { ok: false, error: "Session expirée. Reconnecte-toi." }

    const res = await fetch("/api/gmail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok || !data?.success) {
      return {
        ok: false,
        error: typeof data?.error === "string" ? data.error : "Envoi impossible.",
        needsConnection: data?.needsConnection === true,
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: "Envoi impossible. Vérifie ta connexion." }
  }
}
