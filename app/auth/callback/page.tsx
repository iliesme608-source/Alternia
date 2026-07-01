"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const code = new URL(window.location.href).searchParams.get("code")

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        router.replace(error ? "/login?error=auth" : "/dashboard")
      })
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        router.replace(session ? "/dashboard" : "/login")
      })
    }
  }, [router])

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <p className="text-sm text-muted-foreground">Connexion en cours…</p>
    </div>
  )
}
