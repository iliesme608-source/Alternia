"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AgentChat } from "@/components/shared/AgentChat"
import { Brain, BarChart2, User2, Loader2, ChevronRight, RotateCcw, Check, X, Timer } from "lucide-react"
import type { Question, Categorie } from "@/app/api/tests/questions/route"

// ── Category config ────────────────────────────────────────────────────────────

const CATEGORIES: { id: Categorie; Icon: React.ElementType; label: string; desc: string; color: string }[] = [
  { id: "logique",      Icon: Brain,     label: "Tests Logiques",  desc: "Suites de chiffres, matrices, analogies verbales",  color: "#3B82F6" },
  { id: "numerique",    Icon: BarChart2, label: "Tests Numériques", desc: "Calcul rapide, pourcentages, lecture de tableaux",  color: "#8B5CF6" },
  { id: "personnalite", Icon: User2,     label: "Personnalité",     desc: "10 questions MBTI simplifiées, profil révélé",     color: "#EC4899" },
]

const TIMER_MAX = 30

// ── Personality result builder ────────────────────────────────────────────────

function buildPersonalityResult(answers: (number | null)[], questions: Question[]): { type: string; desc: string; emoji: string } {
  const counts: Record<string, number> = { Analytique: 0, Créatif: 0, Collaboratif: 0, Ambitieux: 0 }
  for (let i = 0; i < answers.length; i++) {
    const ans = answers[i]
    if (ans === null || ans < 0) continue
    const trait = questions[i]?.traits?.[ans]
    if (trait && trait in counts) counts[trait]++
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Analytique"
  const PROFILES: Record<string, { desc: string; emoji: string }> = {
    Analytique:   { desc: "Tu analyses avant d'agir, tu es méthodique et précis. Les recruteurs apprécient ton sens du détail et ta rigueur.", emoji: "🧠" },
    Créatif:      { desc: "Tu penses hors des sentiers battus et tu apportes des idées innovantes. Ton profil est recherché dans les équipes qui veulent se différencier.", emoji: "🎨" },
    Collaboratif: { desc: "Tu excelles en équipe et tu fais preuve d'empathie. Tu es le ciment d'une équipe soudée — qualité très valorisée en alternance.", emoji: "🤝" },
    Ambitieux:    { desc: "Tu es orienté résultats et tu sais te motiver seul. Ton dynamisme et ton leadership naturel séduisent les managers.", emoji: "🚀" },
  }
  return { type: top, ...PROFILES[top] }
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Phase = "select" | "loading" | "playing" | "result"

export default function TestsPage() {
  const [phase,      setPhase]      = useState<Phase>("select")
  const [categorie,  setCategorie]  = useState<Categorie | null>(null)
  const [questions,  setQuestions]  = useState<Question[]>([])
  const [currentQ,   setCurrentQ]   = useState(0)
  const [answers,    setAnswers]    = useState<(number | null)[]>([])
  const [timeLeft,   setTimeLeft]   = useState(TIMER_MAX)
  const [selected,   setSelected]   = useState<number | null>(null) // selected option for current Q
  const [error,      setError]      = useState("")

  // Refs so the timer callback always has fresh values
  const currentQRef  = useRef(currentQ)
  const answersRef   = useRef(answers)
  const questionsRef = useRef(questions)
  useEffect(() => { currentQRef.current  = currentQ },  [currentQ])
  useEffect(() => { answersRef.current   = answers },   [answers])
  useEffect(() => { questionsRef.current = questions }, [questions])

  // ── Advance to next question ──────────────────────────────────────────────

  const advance = useCallback((chosenIdx: number | null) => {
    const q = currentQRef.current
    const qs = questionsRef.current

    setAnswers(prev => {
      const u = [...prev]
      u[q] = chosenIdx
      return u
    })
    setSelected(null)

    if (q + 1 < qs.length) {
      setCurrentQ(q + 1)
      setTimeLeft(TIMER_MAX)
    } else {
      setPhase("result")
    }
  }, [])

  // ── Timer countdown ───────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "playing") return

    setTimeLeft(TIMER_MAX)
    let tl = TIMER_MAX

    const id = setInterval(() => {
      tl -= 1
      setTimeLeft(tl)
      if (tl <= 0) {
        clearInterval(id)
        advance(null) // time's up — no answer
      }
    }, 1000)

    return () => clearInterval(id)
  // advance is stable (useCallback with no deps), currentQ triggers reset
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentQ])

  // ── Start quiz ────────────────────────────────────────────────────────────

  async function startQuiz(cat: Categorie) {
    setCategorie(cat)
    setPhase("loading")
    setError("")
    try {
      const res = await fetch("/api/tests/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categorie: cat }),
      })
      const data = await res.json()
      if (!data.questions?.length) { setError("Impossible de charger les questions. Réessaie."); setPhase("select"); return }
      setQuestions(data.questions)
      setAnswers(new Array(data.questions.length).fill(null))
      setCurrentQ(0)
      setSelected(null)
      setPhase("playing")
    } catch {
      setError("Erreur réseau. Réessaie.")
      setPhase("select")
    }
  }

  function reset() {
    setPhase("select")
    setCategorie(null)
    setQuestions([])
    setAnswers([])
    setCurrentQ(0)
    setSelected(null)
    setError("")
  }

  // ── Answer selection ──────────────────────────────────────────────────────

  function handleAnswer(idx: number) {
    if (selected !== null) return // already answered
    setSelected(idx)
    setTimeout(() => advance(idx), 600) // brief highlight before advancing
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const q          = questions[currentQ]
  const catConfig  = CATEGORIES.find(c => c.id === categorie)
  const isPersonality = categorie === "personnalite"

  const score = isPersonality
    ? 0
    : answers.filter((a, i) => a !== null && a === questions[i]?.reponse).length

  const personalityResult = phase === "result" && isPersonality
    ? buildPersonalityResult(answers, questions)
    : null

  const timerPct = (timeLeft / TIMER_MAX) * 100
  const timerColor = timeLeft > 15 ? "#3B82F6" : timeLeft > 7 ? "#F59E0B" : "#EF4444"

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-7xl mx-auto px-6 lg:px-10 py-10">

      <div className="mb-8">
        <AgentChat
          agentName="Lucas" agentEmoji="🧪" agentTitle="Agent Entraînement"
          agentDescription="Je te prépare aux tests de recrutement avec des questions générées par IA et des corrections détaillées."
          features={["Tests logiques, numériques et personnalité", "Timer 30s par question", "Score final + corrections IA"]}
          userMessage="Lucas, entraîne-moi aux tests de recrutement !"
          agentMessage="Je te prépare aux tests de recrutement avec des questions générées par IA 🧪"
        />
      </div>

      <AnimatePresence mode="wait">

        {/* ── Sélection catégorie ── */}
        {phase === "select" && (
          <motion.div key="select" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <h2 className="text-xl font-semibold text-white mb-2">Choisir un test</h2>
            <p className="text-sm text-zinc-500 mb-6">10 questions générées par IA · Timer 30s par question · Correction détaillée</p>
            {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {CATEGORIES.map(cat => (
                <motion.button
                  key={cat.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => startQuiz(cat.id)}
                  className="surface p-6 text-left flex flex-col gap-4 hover:border-white/20 transition-all"
                >
                  <div className="size-12 rounded-xl flex items-center justify-center" style={{ background: `${cat.color}15`, border: `1px solid ${cat.color}30` }}>
                    <cat.Icon className="size-6" style={{ color: cat.color }} />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-1">{cat.label}</h3>
                    <p className="text-xs text-zinc-500 leading-relaxed">{cat.desc}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium mt-auto" style={{ color: cat.color }}>
                    Démarrer <ChevronRight className="size-3.5" />
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Chargement ── */}
        {phase === "loading" && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-32">
            <Loader2 className="size-10 text-blue-400 animate-spin mb-4" />
            <p className="text-zinc-500 text-sm">Lucas génère tes 10 questions…</p>
          </motion.div>
        )}

        {/* ── Jeu ── */}
        {phase === "playing" && q && (
          <motion.div key={`q-${currentQ}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="flex flex-col gap-6">

            {/* Header : progression + timer */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
                  <span className="font-medium text-white">Question {currentQ + 1} / {questions.length}</span>
                  <span>{catConfig?.label}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-blue"
                    animate={{ width: `${((currentQ) / questions.length) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>

              {/* Timer */}
              {!isPersonality && (
                <div className="flex items-center gap-2 shrink-0">
                  <Timer className="size-3.5" style={{ color: timerColor }} />
                  <div className="relative size-10">
                    <svg className="absolute inset-0 -rotate-90" width="40" height="40">
                      <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                      <circle
                        cx="20" cy="20" r="16" fill="none"
                        stroke={timerColor}
                        strokeWidth="3"
                        strokeDasharray={`${2 * Math.PI * 16}`}
                        strokeDashoffset={`${2 * Math.PI * 16 * (1 - timerPct / 100)}`}
                        style={{ transition: "stroke-dashoffset 0.9s linear, stroke 0.3s" }}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold" style={{ color: timerColor }}>
                      {timeLeft}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Question */}
            <div className="surface p-6">
              <p className="text-base font-medium text-white leading-relaxed">{q.enonce}</p>
            </div>

            {/* Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {q.options.map((opt, idx) => {
                const isSelected  = selected === idx
                const isCorrect   = !isPersonality && selected !== null && idx === q.reponse
                const isWrong     = !isPersonality && isSelected && idx !== q.reponse

                let bg    = "bg-white/[0.03] border-white/[0.08] text-zinc-300"
                if (isCorrect) bg = "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                if (isWrong)   bg = "bg-red-500/15 border-red-500/30 text-red-300"
                if (isSelected && isPersonality) bg = "bg-blue-500/15 border-blue-500/30 text-blue-300"

                return (
                  <motion.button
                    key={idx}
                    whileHover={selected === null ? { scale: 1.01 } : {}}
                    whileTap={selected === null ? { scale: 0.99 } : {}}
                    onClick={() => handleAnswer(idx)}
                    disabled={selected !== null}
                    className={`flex items-center gap-3 p-4 rounded-xl text-left border transition-all ${bg} ${selected === null ? "hover:border-white/20 cursor-pointer" : "cursor-default"}`}
                  >
                    <span className="size-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
                      {["A", "B", "C", "D"][idx]}
                    </span>
                    <span className="text-sm leading-snug flex-1">{opt}</span>
                    {isCorrect && <Check className="size-4 text-emerald-400 shrink-0" />}
                    {isWrong   && <X    className="size-4 text-red-400 shrink-0" />}
                  </motion.button>
                )
              })}
            </div>

          </motion.div>
        )}

        {/* ── Résultats ── */}
        {phase === "result" && (
          <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>

            {/* Score card */}
            <div className="surface p-8 text-center mb-8">
              {isPersonality ? (
                <>
                  <p className="text-5xl mb-3">{personalityResult?.emoji}</p>
                  <h2 className="text-2xl font-bold text-white mb-2">Profil {personalityResult?.type}</h2>
                  <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">{personalityResult?.desc}</p>
                </>
              ) : (
                <>
                  <p className="text-6xl font-bold text-white mb-2">{score}<span className="text-3xl text-zinc-600">/{questions.length}</span></p>
                  <p className="text-zinc-400 text-sm">
                    {score >= 8 ? "Excellent ! Tu maîtrises ce type de tests 🎯" :
                     score >= 6 ? "Bon résultat, encore un peu de pratique 👍" :
                     score >= 4 ? "Des lacunes à combler — lis les corrections 📚" :
                                  "Il faut s'entraîner davantage — les corrections t'aideront 💪"}
                  </p>
                </>
              )}
            </div>

            {/* Corrections */}
            {!isPersonality && (
              <div className="flex flex-col gap-4 mb-8">
                <h3 className="text-white font-semibold">Corrections détaillées</h3>
                {questions.map((qs, i) => {
                  const userAns = answers[i]
                  const correct = qs.reponse
                  const isOk    = userAns === correct
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={`surface p-5 border-l-2 ${isOk ? "border-l-emerald-500" : "border-l-red-500"}`}
                    >
                      <div className="flex items-start gap-2 mb-3">
                        {isOk
                          ? <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" />
                          : <X    className="size-4 text-red-400 shrink-0 mt-0.5" />
                        }
                        <p className="text-sm text-white font-medium leading-snug">{qs.enonce}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {userAns !== null && userAns !== correct && (
                          <div className="col-span-2 sm:col-span-1 rounded-lg p-2 text-xs bg-red-500/10 border border-red-500/20 text-red-300">
                            Ta réponse : {qs.options[userAns]}
                          </div>
                        )}
                        {userAns === null && (
                          <div className="col-span-2 sm:col-span-1 rounded-lg p-2 text-xs bg-zinc-500/10 border border-zinc-500/20 text-zinc-500">
                            Pas de réponse (temps écoulé)
                          </div>
                        )}
                        <div className={`rounded-lg p-2 text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 ${!isOk && userAns !== null ? "col-span-2 sm:col-span-1" : "col-span-2"}`}>
                          Bonne réponse : {qs.options[correct]}
                        </div>
                      </div>

                      <p className="text-xs text-zinc-500 leading-relaxed">{qs.explication}</p>
                    </motion.div>
                  )
                })}
              </div>
            )}

            {isPersonality && (
              <div className="flex flex-col gap-4 mb-8">
                <h3 className="text-white font-semibold">Ce que tes réponses révèlent</h3>
                {questions.map((qs, i) => {
                  const ans = answers[i]
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="surface p-5">
                      <p className="text-sm font-medium text-white mb-2">{qs.enonce}</p>
                      {ans !== null && ans >= 0 && (
                        <p className="text-xs text-blue-400 mb-1.5">Ta réponse : <span className="text-white">{qs.options[ans]}</span></p>
                      )}
                      <p className="text-xs text-zinc-500 leading-relaxed">{qs.explication}</p>
                    </motion.div>
                  )
                })}
              </div>
            )}

            <button
              onClick={reset}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-blue text-white font-semibold glow-blue-sm hover:opacity-90 transition-opacity"
            >
              <RotateCcw className="size-4" />
              Recommencer
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
