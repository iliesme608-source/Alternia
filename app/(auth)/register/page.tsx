"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const niveaux = ["BTS", "Bachelor", "Master", "Autre"]
const secteurs = [
  "Informatique / Tech",
  "Commerce / Marketing",
  "Finance / Comptabilité",
  "RH / Management",
  "Communication / Média",
  "Ingénierie / Industrie",
  "Santé / Social",
  "Droit / Juridique",
  "Autre",
]

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    email: "",
    password: "",
    prenom: "",
    nom: "",
    ecole: "",
    niveau: "",
    secteur: "",
    region: "",
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          prenom: form.prenom,
          nom: form.nom,
          ecole: form.ecole,
          niveau: form.niveau,
          secteur: form.secteur,
          region: form.region,
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    if (data.session && data.user) {
      // Upsert profile directly (fallback if DB trigger isn't set up)
      await supabase.from("profiles").upsert({
        id: data.user.id,
        email: form.email,
        prenom: form.prenom,
        nom: form.nom,
        ecole: form.ecole,
        niveau: form.niveau,
        secteur: form.secteur,
        region: form.region,
      })
      router.push("/dashboard")
    } else if (data.user) {
      // Email confirmation required
      setError("Compte créé ! Vérifiez votre email pour confirmer votre inscription, puis connectez-vous.")
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md border-white/[0.08] bg-[#111C2F]">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#3B82F6] to-[#22D3EE]">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2 L11 7 L7 12" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 2 L3 7 L7 12" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5"/>
              </svg>
            </div>
          </div>
          <CardTitle>Crée ton compte</CardTitle>
          <CardDescription>Rejoins Alternia gratuitement</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="prenom" className="text-sm font-medium">Prénom</label>
                <Input
                  id="prenom"
                  placeholder="Jean"
                  value={form.prenom}
                  onChange={(e) => set("prenom", e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="nom" className="text-sm font-medium">Nom</label>
                <Input
                  id="nom"
                  placeholder="Dupont"
                  value={form.nom}
                  onChange={(e) => set("nom", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <Input
                id="email"
                type="email"
                placeholder="vous@exemple.fr"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium">Mot de passe</label>
              <Input
                id="password"
                type="password"
                placeholder="8 caractères minimum"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="ecole" className="text-sm font-medium">École / Université</label>
              <Input
                id="ecole"
                placeholder="Ex : EPITECH, Université Lyon 2…"
                value={form.ecole}
                onChange={(e) => set("ecole", e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Niveau</label>
                <Select onValueChange={(v) => set("niveau", v)} required>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    {niveaux.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="region" className="text-sm font-medium">Région</label>
                <Input
                  id="region"
                  placeholder="Ex : Île-de-France"
                  value={form.region}
                  onChange={(e) => set("region", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Secteur visé</label>
              <Select onValueChange={(v) => set("secteur", v)} required>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choisir un secteur" />
                </SelectTrigger>
                <SelectContent>
                  {secteurs.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" disabled={loading} className="w-full rounded-full">
              {loading ? "Création…" : "Créer mon compte"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Déjà un compte ?{" "}
              <Link href="/login" className="text-[#3B82F6] hover:text-[#60A5FA] underline underline-offset-4">
                Se connecter
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
