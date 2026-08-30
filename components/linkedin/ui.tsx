"use client"

import { useState } from "react"
import { Check, ChevronDown, Copy, Loader2, Sparkles } from "lucide-react"

/** Profil Supabase de l'étudiant, partagé par tous les modules LinkedIn. */
export interface LinkedInProfil {
  prenom: string
  ecole: string
  niveau: string
  secteur: string
  region: string
  posteRecherche: string
}

export const EMPTY_PROFIL: LinkedInProfil = {
  prenom: "", ecole: "", niveau: "", secteur: "", region: "", posteRecherche: "",
}

const INPUT_CLASS =
  "w-full h-11 px-4 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] placeholder-zinc-700 focus:border-blue-500/40 focus:outline-none transition-colors"

export function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
    >
      {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
      {copied ? "Copié !" : "Copier"}
    </button>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-zinc-500 mb-1.5 block">{label}</label>
      {children}
    </div>
  )
}

export function TextInput({
  value, onChange, placeholder, onEnter,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onEnter?: () => void
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter" && onEnter) onEnter() }}
      placeholder={placeholder}
      className={INPUT_CLASS}
    />
  )
}

export function Select<T extends string>({
  value, onChange, options,
}: {
  value: T
  onChange: (value: T) => void
  options: readonly { value: T; label: string }[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className={`${INPUT_CLASS} pr-10 appearance-none`}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-zinc-600 pointer-events-none" />
    </div>
  )
}

export function ModuleCard({
  icon: Icon, title, children,
}: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="surface p-6">
      <h2 className="text-white font-semibold mb-5 flex items-center gap-2">
        <Icon className="size-4 text-blue-400" />
        {title}
      </h2>
      {children}
    </div>
  )
}

/** Encart pédagogique bleu — le « pourquoi » derrière chaque module. */
export function Hint({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.07] px-4 py-3">
      <Icon className="size-4 text-blue-400 shrink-0 mt-0.5" />
      <p className="text-[13px] text-blue-100/70 leading-relaxed">{children}</p>
    </div>
  )
}

export function GenerateButton({
  loading, disabled, onClick, idleLabel, loadingLabel,
}: {
  loading: boolean
  disabled: boolean
  onClick: () => void
  idleLabel: string
  loadingLabel: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-blue text-white font-semibold glow-blue-sm hover:opacity-90 transition-opacity disabled:opacity-50"
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      {loading ? loadingLabel : idleLabel}
    </button>
  )
}

export function ErrorText({ message }: { message: string }) {
  if (!message) return null
  return <p className="text-sm text-red-400 text-center">{message}</p>
}

export function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-20 text-center surface">
      <p className="text-4xl mb-4">{emoji}</p>
      <p className="text-zinc-500 text-sm max-w-xs">{text}</p>
    </div>
  )
}

export function LoadingState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 surface">
      <Loader2 className="size-8 text-blue-400 animate-spin mb-4" />
      <p className="text-sm text-zinc-500">{text}</p>
    </div>
  )
}
