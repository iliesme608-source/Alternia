"use client"

import { useRef, useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Upload, Loader2, Download, Copy, Check, ArrowRight,
  RotateCcw, CheckCircle2, Circle, AlertCircle, Lightbulb,
  Sparkles, FileText,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { AlexAvatar } from "@/components/agents/AgentAvatars"
import type { CVAdaptation } from "@/types"

// ── Helpers ────────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 80) return "#34D399"
  if (score >= 60) return "#F59E0B"
  return "#F87171"
}

function scoreGradient(score: number) {
  if (score >= 80) return "linear-gradient(90deg, #34D399, #10B981)"
  if (score >= 60) return "linear-gradient(90deg, #F59E0B, #D97706)"
  return "linear-gradient(90deg, #F87171, #EF4444)"
}

function scoreLabel(score: number) {
  if (score >= 80) return "Excellent"
  if (score >= 60) return "Bon"
  if (score >= 40) return "Moyen"
  return "Faible"
}

function generateAlexBubbles(result: CVAdaptation): string[] {
  const bubbles: string[] = []

  if (result.resume_modifications) {
    bubbles.push(result.resume_modifications)
  }

  if (result.mots_cles_ajoutes.length > 0) {
    const preview = result.mots_cles_ajoutes.slice(0, 3).join(", ")
    const more = result.mots_cles_ajoutes.length > 3 ? ` +${result.mots_cles_ajoutes.length - 3} autres` : ""
    bubbles.push(`J'ai intégré ${result.mots_cles_ajoutes.length} mot${result.mots_cles_ajoutes.length > 1 ? "s-clés" : "-clé"} ATS : ${preview}${more}.`)
  }

  if (result.mots_cles_manquants.length > 0) {
    bubbles.push(`${result.mots_cles_manquants.length} compétence${result.mots_cles_manquants.length > 1 ? "s" : ""} demandée${result.mots_cles_manquants.length > 1 ? "s" : ""} ne figure${result.mots_cles_manquants.length === 1 ? "" : "nt"} pas dans ton profil. Ajoute-les si tu les as.`)
  } else {
    bubbles.push("Toutes les compétences requises sont présentes dans ton CV. Excellent !")
  }

  return bubbles
}

// ── Analysis sequence ──────────────────────────────────────────────────────────

const STEPS = [
  "Lecture du CV",
  "Analyse de la fiche de poste",
  "Identification des mots-clés ATS",
  "Optimisation du contenu",
  "Calcul du score final",
]
const STEP_DELAYS = [0, 900, 1900, 3200, 4600]

function AnalysisSequence() {
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    const timers = STEP_DELAYS.slice(1).map((delay, i) =>
      window.setTimeout(() => setCurrentStep(i + 1), delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center min-h-[56vh] max-w-xs mx-auto"
    >
      {/* Avatar with animated rings */}
      <div className="relative mb-10">
        <motion.div
          animate={{ scale: [1, 1.18, 1], opacity: [0.3, 0, 0.3] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
          className="absolute inset-0 rounded-full border-2 border-[#3B82F6]/40"
        />
        <motion.div
          animate={{ scale: [1, 1.32, 1], opacity: [0.18, 0, 0.18] }}
          transition={{ repeat: Infinity, duration: 2.2, delay: 0.4, ease: "easeInOut" }}
          className="absolute inset-0 rounded-full border border-[#3B82F6]/25"
        />
        <div
          className="relative flex size-28 items-center justify-center rounded-full"
          style={{ background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.20)" }}
        >
          <AlexAvatar size={72} />
        </div>
      </div>

      <h2 className="text-white font-bold text-xl mb-1 tracking-tight">Alex analyse ton CV</h2>
      <p className="text-[#94A3B8] text-sm mb-10">Quelques secondes…</p>

      <div className="w-full space-y-3.5">
        {STEPS.map((label, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.06 * i, duration: 0.3 }}
            className="flex items-center gap-3"
          >
            {currentStep > i ? (
              <CheckCircle2 className="size-4 text-[#34D399] shrink-0" />
            ) : currentStep === i ? (
              <Loader2 className="size-4 text-[#3B82F6] animate-spin shrink-0" />
            ) : (
              <Circle className="size-4 text-white/15 shrink-0" />
            )}
            <span className={`text-sm transition-colors duration-300 ${
              currentStep > i
                ? "text-[#94A3B8] line-through decoration-white/20"
                : currentStep === i
                ? "text-white font-medium"
                : "text-white/25"
            }`}>
              {label}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

// ── Score Banner ───────────────────────────────────────────────────────────────

function ScoreBanner({ result }: { result: CVAdaptation }) {
  const before = result.score_ats_avant
  const after = result.score_ats
  const delta = before != null ? after - before : null

  return (
    <div className="surface-sm p-5 mb-6">
      <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-8">
        {/* Before */}
        {before != null && (
          <>
            <div className="flex-1 text-center sm:text-left w-full">
              <p className="text-[10px] text-[#94A3B8] uppercase tracking-widest mb-1.5">Avant</p>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-bold" style={{ color: scoreColor(before) }}>{before}</span>
                <span className="text-sm text-[#94A3B8]">/ 100</span>
                <span className="text-xs font-medium ml-1" style={{ color: scoreColor(before) }}>{scoreLabel(before)}</span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${before}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{ background: scoreGradient(before) }}
                />
              </div>
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center shrink-0">
              <div
                className="flex items-center gap-2 px-4 py-2 rounded-full"
                style={{ background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.20)" }}
              >
                {delta != null && delta > 0 && (
                  <span className="text-lg font-bold text-[#34D399]">+{delta}</span>
                )}
                <ArrowRight className="size-4 text-[#34D399]" />
              </div>
            </div>
          </>
        )}

        {/* After */}
        <div className="flex-1 text-center sm:text-left w-full">
          <p className="text-[10px] text-[#94A3B8] uppercase tracking-widest mb-1.5">
            {before != null ? "Après" : "Score ATS"}
          </p>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-4xl font-bold" style={{ color: scoreColor(after) }}>{after}</span>
            <span className="text-sm text-[#94A3B8]">/ 100</span>
            <span className="text-xs font-medium ml-1" style={{ color: scoreColor(after) }}>{scoreLabel(after)}</span>
          </div>
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${after}%` }}
              transition={{ duration: 1.0, delay: before != null ? 0.3 : 0, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: scoreGradient(after) }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Keyword chip ───────────────────────────────────────────────────────────────

function KeywordChip({ word, type }: { word: string; type: "added" | "missing" }) {
  const colors =
    type === "added"
      ? { bg: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.22)", text: "#34D399" }
      : { bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.22)", text: "#FBB924" }

  return (
    <span
      className="inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium"
      style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
    >
      {type === "added" ? "+ " : "— "}
      {word}
    </span>
  )
}

// ── Alex Sidebar ───────────────────────────────────────────────────────────────

function AlexSidebar({ result, onCopy, onDownload, onReset, copied, downloading }: {
  result: CVAdaptation
  onCopy: () => void
  onDownload: () => void
  onReset: () => void
  copied: boolean
  downloading: boolean
}) {
  const bubbles = generateAlexBubbles(result)

  return (
    <div className="space-y-4 lg:w-72 lg:shrink-0 lg:sticky lg:top-24 lg:self-start">
      {/* Alex messages — Limova bubbles */}
      <div className="space-y-3">
        {bubbles.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 * i, duration: 0.4 }}
            className="flex items-end gap-2.5"
          >
            {i === 0 && (
              <div
                className="shrink-0 flex size-8 items-center justify-center rounded-full"
                style={{ background: "rgba(59,130,246,0.14)", border: "1px solid rgba(59,130,246,0.25)" }}
              >
                <AlexAvatar size={22} />
              </div>
            )}
            {i > 0 && <div className="size-8 shrink-0" />}
            <div
              className="relative flex-1 px-3.5 py-2.5"
              style={{
                background: "rgba(255,255,255,0.05)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: "12px 12px 12px 4px",
              }}
            >
              {i === 0 && (
                <div
                  className="absolute"
                  style={{
                    left: "-5px", bottom: "10px",
                    width: 0, height: 0,
                    borderTop: "5px solid transparent",
                    borderBottom: "5px solid transparent",
                    borderRight: "5px solid rgba(255,255,255,0.10)",
                  }}
                />
              )}
              <p className="text-white text-[13px] leading-relaxed">{msg}</p>
              {i === bubbles.length - 1 && (
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[11px] font-semibold text-[#3B82F6]">Alex</span>
                  <span className="text-[10px] text-white/25">·</span>
                  <span className="text-[10px] text-[#34D399] font-medium">En ligne</span>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Keywords added */}
      {result.mots_cles_ajoutes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="surface-sm p-4"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5"
            style={{ color: "#34D399" }}>
            <CheckCircle2 className="size-3" />
            Ajoutés ({result.mots_cles_ajoutes.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.mots_cles_ajoutes.map((mot) => (
              <KeywordChip key={mot} word={mot} type="added" />
            ))}
          </div>
        </motion.div>
      )}

      {/* Keywords missing */}
      {result.mots_cles_manquants.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="surface-sm p-4"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5 text-amber-400">
            <AlertCircle className="size-3" />
            Manquants ({result.mots_cles_manquants.length})
          </p>
          <p className="text-[11px] text-[#94A3B8] mb-2.5 leading-snug">
            Ces compétences sont demandées mais absentes de ton profil.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.mots_cles_manquants.map((mot) => (
              <KeywordChip key={mot} word={mot} type="missing" />
            ))}
          </div>
        </motion.div>
      )}

      {/* Suggestions */}
      {result.suggestions && result.suggestions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="surface-sm p-4"
        >
          <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Lightbulb className="size-3" />
            Suggestions
          </p>
          <div className="space-y-2.5">
            {result.suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-xs font-bold text-[#3B82F6] shrink-0 mt-0.5">{i + 1}.</span>
                <p className="text-xs text-[#94A3B8] leading-relaxed">{s}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="space-y-2"
      >
        <button
          onClick={onDownload}
          disabled={downloading}
          className="pill-btn pill-btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ height: "40px", fontSize: "0.8125rem" }}
        >
          {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {downloading ? "Génération DOCX…" : "Exporter en DOCX"}
        </button>
        <button
          onClick={onCopy}
          className="pill-btn pill-btn-ghost w-full"
          style={{ height: "40px", fontSize: "0.8125rem" }}
        >
          {copied ? <Check className="size-4 text-[#34D399]" /> : <Copy className="size-4" />}
          {copied ? "Copié !" : "Copier le texte"}
        </button>
        <button
          onClick={onReset}
          className="pill-btn pill-btn-ghost w-full text-[#94A3B8]"
          style={{ height: "36px", fontSize: "0.8125rem" }}
        >
          <RotateCcw className="size-3.5" />
          Nouveau CV
        </button>
      </motion.div>
    </div>
  )
}

// ── CV Comparison ──────────────────────────────────────────────────────────────

function CVComparison({ result }: { result: CVAdaptation }) {
  const [tab, setTab] = useState<"adapted" | "original">("adapted")

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex-1 min-w-0"
    >
      {/* Tab switcher */}
      <div className="flex items-center gap-2 mb-4">
        {[
          { key: "adapted" as const, label: "CV optimisé" },
          { key: "original" as const, label: "CV original" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`pill-btn text-sm transition-all duration-200 ${tab === key ? "pill-btn-active" : "pill-btn-ghost"}`}
            style={tab === key ? {
              height: "36px",
              paddingLeft: "20px",
              paddingRight: "20px",
              background: "rgba(59,130,246,0.14)",
              borderColor: "rgba(59,130,246,0.30)",
              color: "#93C5FD",
            } : {
              height: "36px",
              paddingLeft: "20px",
              paddingRight: "20px",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* CV text */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          <div className="surface-sm p-6 overflow-y-auto max-h-[70vh]">
            <pre className="text-sm text-[#94A3B8] font-mono leading-relaxed whitespace-pre-wrap break-words">
              {tab === "adapted" ? result.cv_adapte : result.cv_original}
            </pre>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}

// ── Input Form ─────────────────────────────────────────────────────────────────

function InputForm({
  cvOriginal, setCvOriginal,
  fichePoste, setFichePoste,
  loading, extracting, needsVision, pdfIllisible,
  error, pendingFileName,
  onFileUpload, onSubmit,
  fileInputRef,
}: {
  cvOriginal: string
  setCvOriginal: (v: string) => void
  fichePoste: string
  setFichePoste: (v: string) => void
  loading: boolean
  extracting: boolean
  needsVision: boolean
  pdfIllisible: boolean
  error: string | null
  pendingFileName: string
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onSubmit: (e: React.FormEvent) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const canSubmit = !loading && !extracting && fichePoste.trim() && (needsVision || cvOriginal.trim())

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4 }}
    >
      {/* Alex greeting */}
      <div
        className="surface-sm p-5 mb-8 flex items-start gap-4"
        style={{ background: "rgba(59,130,246,0.07)", borderColor: "rgba(59,130,246,0.16)" }}
      >
        <div
          className="shrink-0 flex size-10 items-center justify-center rounded-xl"
          style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.25)" }}
        >
          <AlexAvatar size={28} />
        </div>
        <div>
          <p className="font-bold text-white text-sm mb-0.5">Alex — Agent CV</p>
          <p className="text-[#94A3B8] text-sm leading-relaxed">
            &ldquo;Colle ton CV et une offre. Je l&apos;optimise pour les ATS et t&apos;explique chaque modification.&rdquo;
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        {/* Upload */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={onFileUpload}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={extracting}
              className="pill-btn pill-btn-ghost"
              style={{ height: "38px", paddingLeft: "18px", paddingRight: "18px", fontSize: "0.8125rem" }}
            >
              {extracting ? (
                <><Loader2 className="size-3.5 animate-spin" />Lecture en cours…</>
              ) : (
                <><Upload className="size-3.5" />Uploader mon CV (PDF / DOCX)</>
              )}
            </button>
            {pdfIllisible && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-orange-500/10 text-orange-400 border border-orange-500/25">
                <AlertCircle className="size-3.5" />
                PDF non lisible par les ATS
              </span>
            )}
          </div>
          {!pdfIllisible && needsVision && pendingFileName && (
            <div className="mt-2 flex items-center gap-2">
              <CheckCircle2 className="size-4 text-[#34D399]" />
              <span className="text-xs text-[#94A3B8]">{pendingFileName} — Alex lira directement ce document.</span>
            </div>
          )}
        </div>

        {/* Two-column inputs */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* CV */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-[#94A3B8] uppercase tracking-widest flex items-center gap-1.5">
              <FileText className="size-3" />
              Ton CV
            </label>
            {pdfIllisible && (
              <div
                className="rounded-2xl px-4 py-3 flex items-start gap-2.5"
                style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.22)" }}
              >
                <AlertCircle className="size-4 text-orange-400 shrink-0 mt-px" />
                <p className="text-xs text-orange-300 leading-relaxed">
                  Ton CV semble être un PDF image ou généré sur Canva. Les recruteurs ATS ne peuvent
                  pas le lire non plus — c&apos;est important à savoir. Colle le texte de ton CV
                  ci-dessous pour continuer.
                </p>
              </div>
            )}
            {needsVision && !pdfIllisible ? (
              <div
                className="rounded-2xl h-56 flex flex-col items-center justify-center gap-3"
                style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.18)" }}
              >
                <CheckCircle2 className="size-8 text-[#34D399]" />
                <p className="text-sm text-white font-medium">{pendingFileName}</p>
                <p className="text-xs text-[#94A3B8]">Document prêt pour l&apos;analyse</p>
              </div>
            ) : (
              <textarea
                value={cvOriginal}
                onChange={(e) => setCvOriginal(e.target.value)}
                autoFocus={pdfIllisible}
                placeholder="Colle le texte de ton CV ici — expériences, compétences, formations…"
                className="h-56 resize-none rounded-2xl p-4 text-sm text-white placeholder-[#94A3B8]/40 transition-colors focus:outline-none"
                style={{
                  background: "#111C2F",
                  border: pdfIllisible ? "1px solid rgba(249,115,22,0.35)" : "1px solid rgba(255,255,255,0.08)",
                }}
                onFocus={(e) => { e.target.style.borderColor = "rgba(59,130,246,0.35)" }}
                onBlur={(e) => {
                  e.target.style.borderColor = pdfIllisible
                    ? "rgba(249,115,22,0.35)"
                    : "rgba(255,255,255,0.08)"
                }}
              />
            )}
          </div>

          {/* Job posting */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-[#94A3B8] uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="size-3" />
              Fiche de poste
            </label>
            <textarea
              value={fichePoste}
              onChange={(e) => setFichePoste(e.target.value)}
              placeholder="Colle la description du poste — missions, compétences requises, profil recherché…"
              required
              className="h-56 resize-none rounded-2xl p-4 text-sm text-white placeholder-[#94A3B8]/40 transition-colors focus:outline-none"
              style={{
                background: "#111C2F",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              onFocus={(e) => { e.target.style.borderColor = "rgba(34,211,238,0.35)" }}
              onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.08)" }}
            />
          </div>
        </div>

        {error && (
          <div
            className="flex items-center gap-2 rounded-2xl px-4 py-3"
            style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.18)" }}
          >
            <AlertCircle className="size-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="pill-btn pill-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Sparkles className="size-4" />
          Analyser et optimiser mon CV
          <ArrowRight className="size-4" />
        </button>
      </form>
    </motion.div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function CVBuilder() {
  const [phase, setPhase] = useState<"input" | "loading" | "results">("input")
  const [cvOriginal, setCvOriginal] = useState("")
  const [fichePoste, setFichePoste] = useState("")
  const [needsVision, setNeedsVision] = useState(false)
  // PDF image / Canva : texte inexploitable — on ne bloque pas, on propose le copier-coller.
  const [pdfIllisible, setPdfIllisible] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [result, setResult] = useState<CVAdaptation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingFileRef = useRef<File | null>(null)

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setExtracting(true)
    setNeedsVision(false)
    setPdfIllisible(false)
    setError(null)
    pendingFileRef.current = null

    const formData = new FormData()
    formData.append("file", file)
    const res = await fetch("/api/cv-extract", { method: "POST", body: formData })
    const data = await res.json().catch(() => ({} as { text?: string; error?: string; needs_vision?: boolean }))

    // 422 (texte vide / PDF image) ou needs_vision : on garde le fichier pour
    // l'analyse vision ET on ouvre la saisie manuelle du texte du CV.
    if (res.status === 422 || data.needs_vision) {
      pendingFileRef.current = file
      setNeedsVision(true)
      setPdfIllisible(true)
      setCvOriginal("")
    } else if (!res.ok || data.error) {
      setError(data.error ?? "Erreur lors de l'extraction du fichier.")
    } else {
      setCvOriginal(data.text ?? "")
    }

    setExtracting(false)
    e.target.value = ""
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const hasContent = needsVision ? !!pendingFileRef.current : !!cvOriginal.trim()
    if (!hasContent || !fichePoste.trim()) return

    setPhase("loading")
    setError(null)
    setResult(null)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    let res: Response

    // Si l'étudiant a collé le texte de son CV, il prime sur l'analyse du fichier.
    if (needsVision && pendingFileRef.current && !cvOriginal.trim()) {
      const formData = new FormData()
      formData.append("pdf", pendingFileRef.current)
      formData.append("fiche_poste", fichePoste)
      res = await fetch("/api/cv", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
    } else {
      res = await fetch("/api/cv", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ cv_original: cvOriginal, fiche_poste: fichePoste }),
      })
    }

    if (!res.ok) {
      setError("Une erreur est survenue. Réessaie.")
      setPhase("input")
      return
    }

    const data = await res.json()
    setResult(data)
    setPhase("results")
  }

  function copyToClipboard() {
    if (!result) return
    navigator.clipboard.writeText(result.cv_adapte)
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  async function downloadDocx() {
    if (!result) return
    setDownloading(true)
    try {
      const res = await fetch("/api/cv-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: result.cv_adapte }),
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "cv-optimise-alex.docx"
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError("Impossible de générer le fichier DOCX.")
    }
    setDownloading(false)
  }

  function reset() {
    setPhase("input")
    setResult(null)
    setNeedsVision(false)
    setPdfIllisible(false)
    setError(null)
    pendingFileRef.current = null
  }

  return (
    <AnimatePresence mode="wait">
      {phase === "input" && (
        <InputForm
          key="input"
          cvOriginal={cvOriginal}
          setCvOriginal={setCvOriginal}
          fichePoste={fichePoste}
          setFichePoste={setFichePoste}
          loading={false}
          extracting={extracting}
          needsVision={needsVision}
          pdfIllisible={pdfIllisible}
          error={error}
          pendingFileName={pendingFileRef.current?.name ?? ""}
          onFileUpload={handleFileUpload}
          onSubmit={handleSubmit}
          fileInputRef={fileInputRef}
        />
      )}

      {phase === "loading" && <AnalysisSequence key="loading" />}

      {phase === "results" && result && (
        <motion.div
          key="results"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <ScoreBanner result={result} />

          <div className="flex flex-col lg:flex-row gap-5">
            <AlexSidebar
              result={result}
              onCopy={copyToClipboard}
              onDownload={downloadDocx}
              onReset={reset}
              copied={copied}
              downloading={downloading}
            />
            <CVComparison result={result} />
          </div>

          {error && (
            <div
              className="mt-4 flex items-center gap-2 rounded-2xl px-4 py-3"
              style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.18)" }}
            >
              <AlertCircle className="size-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
