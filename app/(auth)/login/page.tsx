"use client"

import { Suspense, useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (searchParams.get("error") === "auth") {
      setError("Le lien de connexion a expiré. Essayez de vous reconnecter.")
    }
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      if (error.message.includes("Email not confirmed")) {
        setError("Confirmez d'abord votre email avant de vous connecter.")
      } else if (error.message.includes("Invalid login credentials")) {
        setError("Email ou mot de passe incorrect.")
      } else if (error.message === "Failed to fetch" || error.message.toLowerCase().includes("fetch") || error.message.toLowerCase().includes("network")) {
        setError("Impossible de contacter Supabase. Vérifiez que votre projet Supabase est actif (non mis en pause) sur supabase.com.")
      } else {
        setError(error.message)
      }
      setLoading(false)
      return
    }

    if (data.session && data.user) {
      const meta = data.user.user_metadata
      if (meta?.prenom) {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          email: data.user.email,
          prenom: meta.prenom,
          nom: meta.nom,
          ecole: meta.ecole,
          niveau: meta.niveau,
          secteur: meta.secteur,
          region: meta.region,
        })
      }
    }

    router.push("/dashboard")
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">Email</label>
        <Input id="email" type="email" placeholder="vous@exemple.fr" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">Mot de passe</label>
        <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full rounded-full">
        {loading ? "Connexion…" : "Se connecter"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Pas encore de compte ?{" "}
        <Link href="/register" className="text-[#3B82F6] hover:text-[#60A5FA] underline underline-offset-4">
          S&apos;inscrire
        </Link>
      </p>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-sm border-white/[0.08] bg-[#111C2F]">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#3B82F6] to-[#22D3EE]">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2 L11 7 L7 12" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 2 L3 7 L7 12" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5"/>
              </svg>
            </div>
          </div>
          <CardTitle>Connexion</CardTitle>
          <CardDescription>Accède à ton espace AlternaAI</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="h-40" />}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
