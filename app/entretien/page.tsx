"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Mic, MicOff, Volume2, VolumeX, ArrowRight, RotateCcw, ChevronDown } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { AgentAvatar } from "@/components/agents/AgentAvatar"
import { AgentBubble } from "@/components/shared/AgentBubble"
import type { Message, EntretienResumeFinal } from "@/types"

// ── Types ──────────────────────────────────────────────────────────────────────

type Screen = "intro" | "config" | "interview" | "summary"
type VoiceStatus = "idle" | "speaking" | "listening" | "analyzing"

type Langue = "fr" | "en" | "mixte"

interface Config {
  entreprise: string
  poste: string
  typeEntretien: "RH" | "Motivation" | "Technique" | "Commercial"
  niveau: "BTS" | "Bachelor" | "Master"
  langue: Langue
}

const TYPES = ["RH", "Motivation", "Technique", "Commercial"] as const
const NIVEAUX = ["BTS", "Bachelor", "Master"] as const

// En mode mixte, Lucas questionne en français : la dictée reste donc en fr-FR,
// seul le feedback bascule en anglais.
const LANGUES: { value: Langue; label: string; badge: string; hint?: string }[] = [
  { value: "fr",    label: "Français",                              badge: "🇫🇷 Français" },
  { value: "en",    label: "Anglais",                               badge: "🇬🇧 English" },
  { value: "mixte", label: "Français avec accompagnement anglais",  badge: "🇫🇷→🇬🇧 Mixte",
    hint: "Lucas pose ses questions en français et donne son feedback en anglais." },
]

const DEFAULT_CONFIG: Config = {
  entreprise: "",
  poste: "",
  typeEntretien: "RH",
  niveau: "Bachelor",
  langue: "fr",
}

function langueBadge(langue: Langue): string {
  return LANGUES.find(l => l.value === langue)?.badge ?? LANGUES[0].badge
}

function recognitionLang(langue: Langue): string {
  return langue === "en" ? "en-US" : "fr-FR"
}
const INTRO_MSG = "Bonjour ! Je suis Lucas, votre coach entretien. Je vais vous préparer pour décrocher votre alternance. Prêt à commencer ?"

// ── TTS (ElevenLabs) ───────────────────────────────────────────────────────────

// Sources en cours de lecture : la Web Audio API n'expose pas d'élément <audio>
// à mettre en pause, il faut garder la main sur les nodes pour pouvoir les
// couper au démontage (navigation / fermeture de la page).
const activeSources = new Set<AudioBufferSourceNode>()
// Incrémenté à chaque coupure : une requête TTS déjà en vol ne doit pas
// démarrer sa lecture après coup.
let speechEpoch = 0

function stopAllSpeech() {
  speechEpoch++
  activeSources.forEach(s => { try { s.stop() } catch { /* déjà arrêtée */ } })
  activeSources.clear()
}

async function speakText(text: string, audioContextRef: React.RefObject<AudioContext | null>): Promise<void> {
  const epoch = speechEpoch
  try {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    const audioCtx = audioContextRef.current
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume()
    }
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
    if (!res.ok) throw new Error('TTS failed')
    const arrayBuffer = await res.arrayBuffer()
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    if (epoch !== speechEpoch) return
    await new Promise<void>(resolve => {
      const source = audioCtx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioCtx.destination)
      source.onended = () => { activeSources.delete(source); resolve() }
      activeSources.add(source)
      source.start(0)
      console.log('[TTS] lecture démarrée, durée:', audioBuffer.duration, 's')
    })
  } catch (err) {
    console.error('[TTS] erreur:', err)
  }
}

// ── Typewriter ─────────────────────────────────────────────────────────────────

function useTypewriter(text: string, startDelay = 900) {
  const [displayed, setDisplayed] = useState("")
  const [done, setDone] = useState(false)
  useEffect(() => {
    setDisplayed(""); setDone(false)
    let i = 0
    const t = window.setTimeout(() => {
      const iv = window.setInterval(() => {
        i++; setDisplayed(text.slice(0, i))
        if (i >= text.length) { setDone(true); clearInterval(iv) }
      }, 25)
    }, startDelay)
    return () => clearTimeout(t)
  }, [text, startDelay])
  return { displayed, done }
}

// ── Confetti ───────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = ["#3B82F6", "#22D3EE", "#34D399", "#F59E0B", "#A78BFA", "#F472B6"]

function Confetti() {
  const pieces = Array.from({ length: 48 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 1.5,
    dur: 2 + Math.random() * 2,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 6 + Math.random() * 8,
    rot: Math.random() * 360,
  }))
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-40">
      {pieces.map(p => (
        <motion.div key={p.id}
          className="absolute rounded-sm"
          style={{ left: `${p.x}%`, top: -20, width: p.size, height: p.size * 0.5, background: p.color, rotate: p.rot }}
          animate={{ y: "110vh", rotate: p.rot + 720, opacity: [1, 1, 0] }}
          transition={{ duration: p.dur, delay: p.delay, ease: "easeIn" }} />
      ))}
    </div>
  )
}

// ── Score Circle ────────────────────────────────────────────────────────────────

function ScoreCircle({ score }: { score: number }) {
  const [counted, setCounted] = useState(0)

  useEffect(() => {
    const DELAY = 550
    const DURATION = 1300
    const origin = Date.now()
    const t = setTimeout(() => {
      const tick = () => {
        const elapsed = Date.now() - (origin + DELAY)
        const p = Math.min(elapsed / DURATION, 1)
        const eased = 1 - (1 - p) ** 3
        setCounted(Math.round(score * 10 * eased) / 10)
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, DELAY)
    return () => clearTimeout(t)
  }, [score])

  const r = 72
  const circ = 2 * Math.PI * r
  const pct = Math.min(score / 10, 1)
  const color = score >= 8 ? "#34D399" : score >= 5 ? "#F59E0B" : "#F87171"
  return (
    <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
      <svg width={180} height={180} style={{ position: "absolute", top: 0, left: 0 }}>
        <circle cx={90} cy={90} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
        <motion.circle cx={90} cy={90} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - pct) }}
          transition={{ duration: 1.4, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: "90px 90px", rotate: "-90deg" }} />
      </svg>
      <div className="flex flex-col items-center z-10">
        <motion.span className="text-5xl font-bold" style={{ color }}
          initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}>
          {counted.toFixed(1)}
        </motion.span>
        <span className="text-sm text-[#94A3B8] mt-0.5">/10</span>
      </div>
    </div>
  )
}

// ── Radar Chart ────────────────────────────────────────────────────────────────

const DIMS = ["Communication", "Pertinence", "Structure", "Confiance", "Vocabulaire"]

function radarPts(vals: number[], cx: number, cy: number, r: number) {
  return vals.map((v, i) => {
    const a = (2 * Math.PI * i / vals.length) - Math.PI / 2
    return `${(cx + (v / 10) * r * Math.cos(a)).toFixed(1)},${(cy + (v / 10) * r * Math.sin(a)).toFixed(1)}`
  }).join(" ")
}

function RadarChart({ scores }: { scores: number[] }) {
  const cx = 110, cy = 110, r = 78
  return (
    <svg width={220} height={220} viewBox="0 0 220 220">
      {[2, 4, 6, 8, 10].map(lv => (
        <polygon key={lv} points={radarPts(Array(5).fill(lv), cx, cy, r)}
          fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      {DIMS.map((_, i) => {
        const a = (2 * Math.PI * i / 5) - Math.PI / 2
        return <line key={i} x1={cx} y1={cy}
          x2={(cx + r * Math.cos(a)).toFixed(1)} y2={(cy + r * Math.sin(a)).toFixed(1)}
          stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      })}
      <motion.polygon
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.4 }}
        points={radarPts(scores, cx, cy, r)}
        fill="rgba(59,130,246,0.12)" stroke="#3B82F6" strokeWidth="1.5" />
      {scores.map((v, i) => {
        const a = (2 * Math.PI * i / 5) - Math.PI / 2
        return (
          <motion.circle key={i}
            cx={(cx + (v / 10) * r * Math.cos(a)).toFixed(1)}
            cy={(cy + (v / 10) * r * Math.sin(a)).toFixed(1)}
            r={3} fill="#3B82F6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.6 + i * 0.08 }} />
        )
      })}
      {DIMS.map((label, i) => {
        const a = (2 * Math.PI * i / 5) - Math.PI / 2
        return (
          <text key={i}
            x={(cx + (r + 20) * Math.cos(a)).toFixed(1)}
            y={(cy + (r + 20) * Math.sin(a)).toFixed(1)}
            textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.35)" fontSize="8.5" fontFamily="system-ui,sans-serif">
            {label}
          </text>
        )
      })}
    </svg>
  )
}

// ── Waveform ───────────────────────────────────────────────────────────────────

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-[3px] h-4">
      {[5, 12, 18, 10, 16, 8, 14].map((h, i) => (
        <motion.div key={i} className="w-[3px] rounded-full bg-blue-400"
          animate={active ? { height: [`${Math.ceil(h / 2)}px`, `${h}px`, `${Math.ceil(h / 2)}px`] } : { height: "3px" }}
          transition={active ? { repeat: Infinity, duration: 0.45 + i * 0.05, ease: "easeInOut" } : { duration: 0.2 }}
          style={{ height: "3px" }} />
      ))}
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 0.15, 0.3].map((delay, i) => (
        <motion.div key={i} className="size-1.5 rounded-full bg-blue-400/60"
          animate={{ y: [0, -5, 0] }}
          transition={{ repeat: Infinity, duration: 0.55, delay }} />
      ))}
    </div>
  )
}

// ── Intro Screen ───────────────────────────────────────────────────────────────

function IntroScreen({ onGo }: { onGo: () => void }) {
  const { displayed, done } = useTypewriter(INTRO_MSG)
  return (
    <motion.div key="intro"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.35 }}
      className="min-h-[calc(100vh-64px)] w-full flex flex-col items-center justify-center px-6">

      {/* Halo */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 65%)" }} />

      {/* Avatar */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.75, ease: [0.34, 1.56, 0.64, 1] }}
        className="relative mb-8">
        <div className="flex size-40 items-center justify-center rounded-full border border-blue-500/20 relative"
          style={{ background: "radial-gradient(circle, rgba(59,130,246,0.09) 0%, rgba(59,130,246,0.02) 100%)" }}>
          <AgentAvatar agentId="lucas" size={136} />
        </div>
        <div className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-[#080D1A]">
          <div className="size-4 rounded-full bg-blue-500 animate-pulse" />
        </div>
      </motion.div>

      {/* Name */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }} className="text-center mb-8">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Lucas</h1>
        <p className="text-[#94A3B8] text-sm mt-0.5">Coach Entretien IA</p>
      </motion.div>

      {/* Bubble */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65 }} className="w-full max-w-sm px-2 sm:px-0 mb-10">
        <motion.div
          className="relative px-4 py-3.5 pb-6 rounded-[18px] cursor-pointer select-none"
          style={{ background: "#272727" }}
          whileTap={{ scale: 0.97, transition: { duration: 0.12 } }}
          whileHover={{ backgroundColor: "#2e2e2e", transition: { duration: 0.15 } }}
        >
          <p className="text-white text-[13px] leading-relaxed pr-6">
            {displayed}
            {!done && <span className="ml-0.5 inline-block w-[2px] h-[13px] bg-white/60 align-middle animate-pulse" />}
          </p>
          <div className="absolute -bottom-3 -right-3 rounded-full border-2" style={{ borderColor: "#07111F" }}>
            <AgentAvatar agentId="lucas" size={32} />
          </div>
        </motion.div>
      </motion.div>

      {/* CTAs */}
      <AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
            className="flex flex-col sm:flex-row gap-3">
            <button onClick={onGo}
              className="h-11 px-7 rounded-full bg-blue-500 text-white text-sm font-semibold hover:bg-blue-400 transition-colors duration-200 flex items-center gap-2 justify-center">
              Oui, on commence !
              <ArrowRight className="size-4" />
            </button>
            <button onClick={onGo}
              className="h-11 px-7 rounded-full text-white/60 text-sm border border-white/10 hover:bg-white/[0.04] hover:text-white/80 transition-all duration-200">
              Choisir une entreprise d&apos;abord
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Config Screen ──────────────────────────────────────────────────────────────

function ConfigScreen({ config, setConfig, onStart, audioContextRef }: {
  config: Config
  setConfig: (c: Partial<Config>) => void
  onStart: () => void
  audioContextRef: React.RefObject<AudioContext | null>
}) {
  const [saidEntreprise, setSaidEntreprise] = useState("")
  const [audioEnabled, setAudioEnabled] = useState(false)

  function speakEntreprise(name: string) {
    if (!name.trim() || name === saidEntreprise) return
    setSaidEntreprise(name)
    speakText(`Excellent choix ! Je connais bien ${name}, je vais adapter mes questions.`, audioContextRef)
  }

  const canStart = config.entreprise.trim() && config.poste.trim()

  return (
    <motion.div key="config"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
      className="flex min-h-[calc(100vh-64px)]">

      {/* Form */}
      <motion.div
        initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.55, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1 flex flex-col justify-center px-6 sm:px-12 py-14 max-w-lg">

        <div className="mb-12">
          <AgentBubble agentId="lucas" agentName="Lucas" message="Je suis prêt pour votre simulation, allons-y !" />
        </div>
        <p className="text-[#94A3B8] text-[10px] uppercase tracking-widest mb-6">Configuration</p>
        <h2 className="text-xl font-semibold text-white tracking-tight mb-8">Personnalisons votre entretien</h2>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] text-[#94A3B8] uppercase tracking-wider">Entreprise cible</label>
            <input
              value={config.entreprise}
              onChange={e => { setConfig({ entreprise: e.target.value }); setSaidEntreprise("") }}
              onBlur={() => speakEntreprise(config.entreprise)}
              placeholder="Ex : Société Générale, Décathlon…"
              className="w-full h-11 px-4 rounded-2xl text-sm text-white outline-none transition-colors bg-white/[0.03] border border-white/[0.08] placeholder-white/20 focus:border-blue-500/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-[#94A3B8] uppercase tracking-wider">Poste visé</label>
            <input
              value={config.poste}
              onChange={e => setConfig({ poste: e.target.value })}
              placeholder="Ex : Développeur Full Stack, Commercial…"
              className="w-full h-11 px-4 rounded-2xl text-sm text-white outline-none bg-white/[0.03] border border-white/[0.08] placeholder-white/20 focus:border-blue-500/40 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] text-[#94A3B8] uppercase tracking-wider">Type d&apos;entretien</label>
            <div className="flex flex-wrap gap-2">
              {TYPES.map(t => (
                <button key={t} onClick={() => setConfig({ typeEntretien: t })}
                  className="h-9 px-4 rounded-full text-sm transition-all duration-200"
                  style={config.typeEntretien === t
                    ? { background: "rgba(59,130,246,0.14)", border: "1px solid rgba(59,130,246,0.38)", color: "#93C5FD" }
                    : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }
                  }>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-[#94A3B8] uppercase tracking-wider">Langue de l&apos;entretien</label>
            <div className="relative">
              <select
                value={config.langue}
                onChange={e => setConfig({ langue: e.target.value as Langue })}
                className="w-full h-11 px-4 pr-10 rounded-2xl text-sm text-white outline-none appearance-none bg-white/[0.03] border border-white/[0.08] focus:border-blue-500/40 transition-colors"
              >
                {LANGUES.map(l => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-white/25 pointer-events-none" />
            </div>
            {LANGUES.find(l => l.value === config.langue)?.hint && (
              <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                {LANGUES.find(l => l.value === config.langue)?.hint}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-[10px] text-[#94A3B8] uppercase tracking-wider">Niveau</label>
            <div className="flex gap-2">
              {NIVEAUX.map(n => (
                <button key={n} onClick={() => setConfig({ niveau: n })}
                  className="h-9 px-4 rounded-full text-sm transition-all duration-200"
                  style={config.niveau === n
                    ? { background: "rgba(59,130,246,0.14)", border: "1px solid rgba(59,130,246,0.38)", color: "#93C5FD" }
                    : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }
                  }>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          {!audioEnabled && (
            <button
              type="button"
              onClick={() => {
                audioContextRef.current = new AudioContext()
                setAudioEnabled(true)
              }}
              className="h-11 px-8 rounded-full text-sm font-semibold flex items-center gap-2 justify-center transition-all duration-200"
              style={{ background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.30)", color: "#34D399" }}>
              <Volume2 className="size-4" />
              Activer le son
            </button>
          )}
          {audioEnabled && (
            <p className="text-[11px] text-[#34D399] text-center">Son activé ✓</p>
          )}
          <button onClick={onStart} disabled={!canStart}
            className="h-11 px-8 rounded-full bg-blue-500 text-white text-sm font-semibold hover:bg-blue-400 transition-colors duration-200 disabled:opacity-35 disabled:cursor-not-allowed flex items-center gap-2 justify-center">
            Lancer l&apos;entretien avec Lucas
            <ArrowRight className="size-4" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Interview Screen ───────────────────────────────────────────────────────────

interface InterviewScreenProps {
  config: Config
  muted: boolean
  setMuted: (v: boolean) => void
  onFinished: (r: EntretienResumeFinal) => void
  onReset: () => void
  audioContextRef: React.RefObject<AudioContext | null>
}

function InterviewScreen({ config, muted, setMuted, onFinished, onReset, audioContextRef }: InterviewScreenProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [transcript, setTranscript] = useState("")
  const [loading, setLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle")
  const [questionCount, setQuestionCount] = useState(0)
  const [lastQuestion, setLastQuestion] = useState("")
  const [lastFeedback, setLastFeedback] = useState<{ score: number | null; point_fort: string; a_ameliorer: string } | null>(null)
  const [textInput, setTextInput] = useState("")
  const [showTextInput, setShowTextInput] = useState(false)
  const [hasMic, setHasMic] = useState(false)
  const [micError, setMicError] = useState<"none" | "network" | "not-allowed">("none")
  const [micHint, setMicHint] = useState(false)

  const sessionIdRef = useRef<string | null>(null)
  const authTokenRef = useRef<string | null>(null)
  const sessionStartedRef = useRef(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef("")
  const autoConvRef = useRef(false)
  const submitRef = useRef<((t: string) => Promise<void>) | null>(null)
  const mutedRef = useRef(muted)
  const messagesRef = useRef<Message[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const noSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const barsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { mutedRef.current = muted }, [muted])
  useEffect(() => { messagesRef.current = messages }, [messages])

  // Démontage (navigation vers une autre page / fermeture) : on coupe tout ce
  // qui pourrait survivre au composant — lecture ElevenLabs, micro, synthèse.
  useEffect(() => {
    return () => {
      stopAllSpeech()
      if (recognitionRef.current) {
        recognitionRef.current.stop()
        recognitionRef.current = null
      }
      window.speechSynthesis?.cancel()
    }
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useEffect(() => {
    const R = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    setHasMic(!!R)
    if (window.speechSynthesis) window.speechSynthesis.getVoices()
    startSession()
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current)
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (analyserRef.current) { analyserRef.current.disconnect(); analyserRef.current = null }
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
      window.speechSynthesis?.cancel()
      recognitionRef.current?.stop()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function speakWithStatus(text: string): Promise<void> {
    if (mutedRef.current) return
    setVoiceStatus("speaking")
    await speakText(text, audioContextRef)
  }

  function stopAnalyzer() {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    if (analyserRef.current) { analyserRef.current.disconnect(); analyserRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }

  function startAnalyzer() {
    navigator.mediaDevices?.getUserMedia({ audio: true }).then(stream => {
      streamRef.current = stream
      let ctx = audioContextRef.current
      if (!ctx) { ctx = new AudioContext(); audioContextRef.current = ctx }
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      src.connect(analyser)
      analyserRef.current = analyser
      const data = new Uint8Array(analyser.frequencyBinCount)
      const N = 7
      const step = Math.max(1, Math.floor(data.length / N))
      function tick() {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(data)
        if (barsRef.current) {
          const children = barsRef.current.children
          for (let i = 0; i < Math.min(children.length, N); i++) {
            const level = data[Math.min(i * step, data.length - 1)] / 255
            ;(children[i] as HTMLElement).style.height = `${Math.max(3, level * 20)}px`
          }
        }
        animFrameRef.current = requestAnimationFrame(tick)
      }
      tick()
    }).catch(() => { /* mic access denied — SpeechRecognition error will handle UI */ })
  }

  function startListening() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const R = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!R) return
    setMicError("none")
    pendingRef.current = ""
    setTranscript("")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new R()
    rec.continuous = true; rec.interimResults = true; rec.lang = recognitionLang(config.langue)

    // 20s total-silence timeout → reveal text input
    noSpeechTimerRef.current = setTimeout(() => {
      setMicHint(true)
      setShowTextInput(true)
    }, 20000)

    rec.onspeechstart = () => {
      if (noSpeechTimerRef.current) { clearTimeout(noSpeechTimerRef.current); noSpeechTimerRef.current = null }
      setMicHint(false)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let t = ""
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
      setTranscript(t); pendingRef.current = t
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => rec.stop(), 2000)
    }
    rec.onend = () => {
      setIsListening(false); recognitionRef.current = null
      if (noSpeechTimerRef.current) { clearTimeout(noSpeechTimerRef.current); noSpeechTimerRef.current = null }
      stopAnalyzer()
      const p = pendingRef.current.trim()
      if (autoConvRef.current && p) { pendingRef.current = ""; submitRef.current?.(p) }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      if (e.error === "no-speech") {
        // Silent retry after 1 second — no error shown to user
        rec.stop()
        retryTimerRef.current = setTimeout(() => {
          if (autoConvRef.current) startListening()
        }, 1000)
        return
      }
      if (e.error === "network") {
        setMicError("network")
        setShowTextInput(true)
        setIsListening(false); recognitionRef.current = null
        stopAnalyzer()
        return
      }
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicError("not-allowed")
        setIsListening(false); recognitionRef.current = null
        stopAnalyzer()
        return
      }
      setIsListening(false); recognitionRef.current = null
      stopAnalyzer()
    }
    recognitionRef.current = rec; rec.start()
    setIsListening(true); setVoiceStatus("listening")
    startAnalyzer()
  }

  async function startSession() {
    if (sessionStartedRef.current) return
    sessionStartedRef.current = true
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    authTokenRef.current = session?.access_token ?? null

    const res = await fetch("/api/entretien", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authTokenRef.current ? { Authorization: `Bearer ${authTokenRef.current}` } : {}),
      },
      body: JSON.stringify({
        entreprise: config.entreprise,
        poste: `${config.poste} (type: ${config.typeEntretien}, niveau: ${config.niveau})`,
        langue: config.langue,
        messages: [],
        action: "start",
      }),
    })
    const data = await res.json()
    if (data.session_id) sessionIdRef.current = data.session_id

    const q: string = data.question ?? ""
    const firstMsg: Message = { role: "assistant", content: q, timestamp: new Date().toISOString() }
    setMessages([firstMsg]); messagesRef.current = [firstMsg]
    setLastQuestion(q); setQuestionCount(1); setLoading(false)

    autoConvRef.current = true
    await speakWithStatus(q)
    setVoiceStatus("idle")
    if (autoConvRef.current) startListening()
  }

  const submitAnswer = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    if (recognitionRef.current) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      recognitionRef.current.stop(); recognitionRef.current = null
    }
    setIsListening(false); setVoiceStatus("analyzing")
    setTranscript(""); setTextInput(""); pendingRef.current = ""

    const userMsg: Message = { role: "user", content: text, timestamp: new Date().toISOString() }
    const newMsgs = [...messagesRef.current, userMsg]
    setMessages(newMsgs); messagesRef.current = newMsgs; setLoading(true)

    const res = await fetch("/api/entretien", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authTokenRef.current ? { Authorization: `Bearer ${authTokenRef.current}` } : {}),
      },
      body: JSON.stringify({
        entreprise: config.entreprise,
        poste: `${config.poste} (type: ${config.typeEntretien}, niveau: ${config.niveau})`,
        langue: config.langue,
        messages: newMsgs,
        action: "reply",
        session_id: sessionIdRef.current,
      }),
    })
    const data = await res.json()

    const aMsg: Message = {
      role: "assistant", content: data.question,
      feedback: data.feedback ?? undefined, score: data.score,
      timestamp: new Date().toISOString(),
    }
    const updated = [...newMsgs, aMsg]
    setMessages(updated); messagesRef.current = updated; setLoading(false)

    if (data.feedback) {
      setLastFeedback({ score: data.score, point_fort: data.feedback.point_fort, a_ameliorer: data.feedback.a_ameliorer })
    }

    if (data.est_termine) {
      setVoiceStatus("idle"); autoConvRef.current = false
      await speakWithStatus(data.question)
      if (data.resume_final) onFinished(data.resume_final)
      return
    }

    setLastQuestion(data.question); setQuestionCount(c => c + 1)
    autoConvRef.current = true
    await speakWithStatus(data.question)
    setVoiceStatus("idle")
    if (autoConvRef.current) startListening()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, onFinished])

  useEffect(() => { submitRef.current = submitAnswer }, [submitAnswer])

  function toggleMic() {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
    if (isListening && recognitionRef.current) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      if (noSpeechTimerRef.current) { clearTimeout(noSpeechTimerRef.current); noSpeechTimerRef.current = null }
      autoConvRef.current = false; recognitionRef.current.stop()
      setIsListening(false); setVoiceStatus("idle"); return
    }
    if (!loading) { autoConvRef.current = true; startListening() }
  }

  const isSpeaking = voiceStatus === "speaking"
  const isAnalyzing = voiceStatus === "analyzing" || (loading && voiceStatus !== "speaking")

  return (
    <motion.div key="interview"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
      className="flex flex-col md:flex-row min-h-[calc(100vh-64px)]">

      {/* ── Left: Lucas ── */}
      <div className="md:w-[40%] flex flex-col items-center justify-center px-6 py-10 relative border-b md:border-b-0 md:border-r border-white/[0.06]"
        style={{ background: "rgba(6,12,24,0.6)" }}>

        {/* Progress */}
        <div className="absolute top-5 left-0 right-0 px-6">
          <div className="flex items-center justify-between text-[10px] text-[#94A3B8] mb-2">
            <span>Question {Math.min(questionCount, 6)} / 6</span>
            <button onClick={onReset} className="text-white/20 hover:text-white/40 transition-colors">
              <RotateCcw className="size-3" />
            </button>
          </div>
          <div className="h-px bg-white/[0.06] rounded-full overflow-hidden">
            <motion.div className="h-full bg-blue-500/50 rounded-full"
              animate={{ width: `${Math.min((questionCount / 6) * 100, 100)}%` }}
              transition={{ duration: 0.5 }} />
          </div>
        </div>

        {/* Avatar + speaking rings */}
        <div className="relative my-6 md:my-0 flex items-center justify-center">
          {/* 3 concentric pulsing rings when speaking */}
          {isSpeaking && <>
            <motion.div
              className="absolute rounded-full border-2 border-blue-400/40"
              style={{ width: 220, height: 220, borderRadius: "50%" }}
              animate={{ scale: [1, 1.18], opacity: [0.55, 0] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut" }} />
            <motion.div
              className="absolute rounded-full border-2 border-blue-400/25"
              style={{ width: 220, height: 220, borderRadius: "50%" }}
              animate={{ scale: [1, 1.38], opacity: [0.4, 0] }}
              transition={{ repeat: Infinity, duration: 1.5, delay: 0.38, ease: "easeOut" }} />
            <motion.div
              className="absolute rounded-full border border-blue-400/15"
              style={{ width: 220, height: 220, borderRadius: "50%" }}
              animate={{ scale: [1, 1.58], opacity: [0.28, 0] }}
              transition={{ repeat: Infinity, duration: 1.5, delay: 0.76, ease: "easeOut" }} />
          </>}
          {/* Avatar — continuous float + avatar 3D */}
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
            className="relative flex items-center justify-center"
            style={{ width: 220, height: 220, flexShrink: 0 }}
          >
            <AgentAvatar agentId="lucas" size={200} />
          </motion.div>
        </div>

        {/* Status row */}
        <div className="h-5 flex items-center mb-3">
          {isSpeaking && <Waveform active />}
          {isAnalyzing && <ThinkingDots />}
          {isListening && (
            <div className="flex items-center gap-1.5 text-[11px] text-red-400">
              <div className="size-1.5 rounded-full bg-red-400 animate-ping" />
              À vous...
            </div>
          )}
        </div>

        <p className="text-white text-sm font-medium">Lucas</p>
        <p className="text-[#94A3B8] text-xs mt-0.5 text-center">{config.entreprise} · {config.poste}</p>

        {/* Langue active */}
        <div className="mt-2.5 h-7 px-3 rounded-full flex items-center text-[11px] font-medium"
          style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.30)", color: "#93C5FD" }}>
          {langueBadge(config.langue)}
        </div>

        {/* Mute */}
        <button onClick={() => setMuted(!muted)}
          className="absolute bottom-5 right-5 flex size-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
          {muted ? <VolumeX className="size-3.5 text-[#94A3B8]" /> : <Volume2 className="size-3.5 text-[#94A3B8]" />}
        </button>
      </div>

      {/* ── Right: Candidate ── */}
      <div className="flex-1 flex flex-col px-6 sm:px-8 py-8 gap-6">

        {/* Last question */}
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">Question de Lucas</p>
          <motion.div
            className="rounded-[18px] px-5 py-4 text-sm text-white leading-relaxed min-h-[60px] flex items-center cursor-default"
            style={{ background: "#272727" }}
            whileTap={{ scale: 0.98, transition: { duration: 0.12 } }}
          >
            {loading && !lastQuestion
              ? <div className="flex items-center gap-2 text-white/40"><ThinkingDots /><span>Lucas prépare...</span></div>
              : lastQuestion || <span className="text-white/30">En attente...</span>
            }
          </motion.div>
        </div>

        {/* Mic + transcription */}
        <div className="flex-1 flex flex-col items-center justify-center gap-5">

          {/* ── Erreur micro non autorisé ─────────────────────────── */}
          {micError === "not-allowed" && (
            <div className="w-full max-w-sm rounded-xl px-4 py-3.5 border border-red-500/20 bg-red-500/[0.07] text-center">
              <p className="text-sm text-red-300 mb-2.5">Autorisez le micro dans Chrome pour utiliser la voix.</p>
              <button
                onClick={() => { try { window.open("chrome://settings/content/microphone") } catch { /* noop */ } }}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-500/25 text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Paramètres Chrome →
              </button>
            </div>
          )}

          {/* ── Erreur réseau ─────────────────────────────────────── */}
          {micError === "network" && (
            <div className="w-full max-w-sm rounded-xl px-4 py-3 border border-amber-500/20 bg-amber-500/[0.07] text-sm text-amber-300 text-center">
              Connexion instable, passage en mode texte.
            </div>
          )}

          {/* ── Bouton micro + barre niveau sonore ───────────────── */}
          {hasMic && micError === "none" && (
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                {isListening && (
                  <motion.div className="absolute inset-0 rounded-full border-2 border-blue-400/40"
                    animate={{ scale: [1, 1.45], opacity: [0.5, 0] }}
                    transition={{ repeat: Infinity, duration: 1.4 }} />
                )}
                <button onClick={toggleMic} disabled={loading && !isListening}
                  className="flex size-20 items-center justify-center rounded-full transition-all duration-300 disabled:opacity-40"
                  style={{
                    background: isListening ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.04)",
                    border: isListening ? "2px solid rgba(59,130,246,0.5)" : "2px solid rgba(255,255,255,0.1)",
                  }}>
                  {isListening
                    ? <MicOff className="size-8 text-blue-400" />
                    : <Mic className="size-8 text-[#94A3B8]" />
                  }
                </button>
              </div>

              {/* Barre niveau sonore — mise à jour directe via ref (pas de setState) */}
              <div ref={barsRef} className="flex items-center justify-center gap-0.5" style={{ height: 20, width: 56 }}>
                {Array.from({ length: 7 }, (_, i) => (
                  <div
                    key={i}
                    className="w-1 rounded-full"
                    style={{
                      height: 3,
                      background: isListening ? "rgba(96,165,250,0.7)" : "rgba(255,255,255,0.08)",
                      transition: "background 0.3s",
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="w-full max-w-sm text-center min-h-[40px] flex items-center justify-center">
            {transcript
              ? <p className="text-white/80 text-sm leading-relaxed">{transcript}</p>
              : <p className="text-[#94A3B8]/40 text-sm">
                  {isListening ? "Je vous écoute..." : "Cliquez sur le micro pour répondre"}
                </p>
            }
          </div>

          {/* ── Hint timeout 20s ──────────────────────────────────── */}
          {micHint && micError === "none" && !showTextInput && (
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-xs text-white/35 text-center -mt-2"
            >
              Vous pouvez aussi répondre à l&apos;écrit ↓
            </motion.p>
          )}

          {/* Text input fallback */}
          <div className="w-full max-w-sm">
            {!showTextInput
              ? <button onClick={() => setShowTextInput(true)}
                  className="text-[11px] text-[#94A3B8]/35 hover:text-[#94A3B8]/60 transition-colors block mx-auto">
                  Répondre à l&apos;écrit →
                </button>
              : <form onSubmit={e => {
                    e.preventDefault()
                    if (textInput.trim()) { autoConvRef.current = true; submitAnswer(textInput.trim()) }
                  }}
                  className="flex gap-2">
                  <input value={textInput} onChange={e => setTextInput(e.target.value)}
                    placeholder="Tapez votre réponse..."
                    className="flex-1 h-10 px-4 rounded-full text-sm text-white outline-none bg-white/[0.04] border border-white/[0.08] placeholder-white/20 focus:border-blue-500/40 transition-colors" />
                  <button type="submit" disabled={!textInput.trim() || loading}
                    className="h-10 w-10 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 disabled:opacity-30 flex items-center justify-center">
                    <ArrowRight className="size-4" />
                  </button>
                </form>
            }
          </div>
        </div>

        {/* Feedback previous */}
        {lastFeedback && (
          <motion.div
            className="rounded-[18px] px-5 py-4 text-xs space-y-1.5 cursor-default"
            style={{ background: "#272727" }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98, transition: { duration: 0.12 } }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/35 text-[10px] uppercase tracking-wider">Réponse précédente</span>
              {lastFeedback.score !== null && <span className="text-white font-semibold text-xs">{lastFeedback.score}/10</span>}
            </div>
            <p><span className="text-white/40">Force — </span><span className="text-[#34D399]">{lastFeedback.point_fort}</span></p>
            <p><span className="text-white/40">Améliorer — </span><span className="text-amber-400">{lastFeedback.a_ameliorer}</span></p>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

// ── Summary Screen ─────────────────────────────────────────────────────────────

function SummaryScreen({ resume, config, onReset }: { resume: EntretienResumeFinal; config: Config; onReset: () => void }) {
  const [confettiDone, setConfettiDone] = useState(false)
  const { displayed: conseilDisplayed, done: conseilDone } = useTypewriter(resume.conseil_final, 900)
  const axesScores = resume.scores_axes
    ? [resume.scores_axes.communication, resume.scores_axes.pertinence, resume.scores_axes.structure, resume.scores_axes.confiance, resume.scores_axes.vocabulaire]
    : [resume.score_global * 0.92, resume.score_global * 1.1, resume.score_global * 0.88, resume.score_global * 1.05, resume.score_global * 0.95].map(v => Math.min(10, Math.max(1, v)))

  const verdictColor = resume.score_global >= 8 ? "#34D399" : resume.score_global >= 5 ? "#F59E0B" : "#F87171"

  async function downloadPDF() {
    const { jsPDF } = await import("jspdf")
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
    const W = 210, margin = 20

    doc.setFillColor(7, 17, 31)
    doc.rect(0, 0, W, 297, "F")

    doc.setFont("helvetica", "bold")
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(22)
    doc.text("Rapport d'entretien Alternia", margin, 28)

    doc.setFont("helvetica", "normal")
    doc.setTextColor(148, 163, 184)
    doc.setFontSize(11)
    doc.text(`${config.entreprise} · ${config.poste}`, margin, 38)
    doc.text(`Date : ${new Date().toLocaleDateString("fr-FR")}`, margin, 45)

    doc.setDrawColor(59, 130, 246)
    doc.setLineWidth(0.4)
    doc.line(margin, 52, W - margin, 52)

    doc.setFont("helvetica", "bold")
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.text(`Score global : ${resume.score_global.toFixed(1)}/10  —  ${resume.verdict ?? ""}`, margin, 62)

    if (resume.scores_axes) {
      doc.setFontSize(11)
      doc.setTextColor(148, 163, 184)
      doc.text("Scores par axe :", margin, 72)
      const axes = [
        ["Communication", resume.scores_axes.communication],
        ["Pertinence", resume.scores_axes.pertinence],
        ["Structure", resume.scores_axes.structure],
        ["Vocabulaire", resume.scores_axes.vocabulaire],
        ["Confiance", resume.scores_axes.confiance],
      ] as [string, number][]
      axes.forEach(([k, v], i) => {
        doc.setTextColor(255, 255, 255)
        doc.text(`${k} : ${v}/10`, margin + 5, 80 + i * 7)
      })
    }

    let y = 117
    doc.setDrawColor(52, 211, 153)
    doc.setFillColor(52, 211, 153)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(52, 211, 153)
    doc.setFontSize(12)
    doc.text("Points forts", margin, y); y += 7
    doc.setFont("helvetica", "normal")
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(10)
    resume.points_forts.forEach(pt => {
      doc.text(`• ${pt}`, margin + 4, y); y += 7
    })

    y += 5
    doc.setFont("helvetica", "bold")
    doc.setTextColor(245, 158, 11)
    doc.setFontSize(12)
    doc.text("Axes d'amélioration", margin, y); y += 7
    doc.setFont("helvetica", "normal")
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(10)
    resume.axes_amelioration.forEach(ax => {
      doc.text(`• ${ax}`, margin + 4, y); y += 7
    })

    y += 5
    doc.setFont("helvetica", "bold")
    doc.setTextColor(59, 130, 246)
    doc.setFontSize(12)
    doc.text("Conseil de Lucas", margin, y); y += 7
    doc.setFont("helvetica", "normal")
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(10)
    const lines = doc.splitTextToSize(resume.conseil_final, W - margin * 2 - 4)
    doc.text(lines, margin + 4, y)

    doc.save(`rapport-entretien-${config.entreprise.replace(/\s+/g, "-")}.pdf`)
  }

  useEffect(() => {
    const t = setTimeout(() => setConfettiDone(true), 4000)
    return () => clearTimeout(t)
  }, [])

  return (
    <motion.div key="summary"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
      className="relative min-h-[calc(100vh-64px)] overflow-y-auto px-4 py-10"
      style={{ background: "#080D1A" }}>

      {!confettiDone && <Confetti />}

      {/* Halo */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full opacity-30"
        style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.18) 0%, transparent 70%)" }} />

      <div className="relative z-10 max-w-screen-2xl mx-auto flex flex-col items-center gap-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }} className="flex flex-col items-center gap-3 text-center">
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
            className="relative flex size-28 items-center justify-center rounded-full border-2 border-blue-400/30"
            style={{ background: "radial-gradient(circle, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0.03) 100%)" }}>
            <AgentAvatar agentId="lucas" size={112} />
            <div className="absolute -bottom-1 -right-1 size-6 rounded-full bg-[#080D1A] flex items-center justify-center">
              <div className="size-3.5 rounded-full bg-[#34D399] animate-pulse" />
            </div>
          </motion.div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Entretien terminé !</h1>
            <p className="text-[#94A3B8] text-sm mt-1">{config.entreprise} · {config.poste}</p>
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold"
            style={{ background: `${verdictColor}18`, border: `1px solid ${verdictColor}40`, color: verdictColor }}>
            {resume.verdict ?? (resume.score_global >= 8 ? "Excellent" : resume.score_global >= 5 ? "Bien" : "À améliorer")}
          </motion.div>
        </motion.div>

        {/* Score + Radar */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="w-full rounded-3xl p-6 flex flex-col sm:flex-row items-center gap-8"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex flex-col items-center gap-3">
            <p className="text-[10px] text-[#94A3B8] uppercase tracking-widest">Score global</p>
            <ScoreCircle score={resume.score_global} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-[10px] text-[#94A3B8] uppercase tracking-widest mb-2">Performance</p>
            <RadarChart scores={axesScores} />
          </div>
        </motion.div>

        {/* Forces + Axes */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">

          <div className="rounded-2xl p-5" style={{ background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.15)" }}>
            <p className="text-[10px] text-[#34D399] uppercase tracking-widest mb-4 font-semibold">Forces</p>
            <ul className="space-y-3">
              {resume.points_forts.map((pt, i) => (
                <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.08 }}
                  className="flex items-start gap-2.5 text-sm">
                  <div className="size-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)" }}>
                    <span className="text-[#34D399] text-[10px] font-bold">{i + 1}</span>
                  </div>
                  <span className="text-white/80 leading-snug">{pt}</span>
                </motion.li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl p-5" style={{ background: "rgba(59,130,246,0.04)", border: "1px solid rgba(59,130,246,0.18)" }}>
            <p className="text-[10px] text-[#60A5FA] uppercase tracking-widest mb-4 font-semibold">À améliorer</p>
            <ul className="space-y-3">
              {resume.axes_amelioration.map((ax, i) => (
                <motion.li key={i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.08 }}
                  className="flex items-start gap-2.5 text-sm">
                  <div className="size-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "rgba(59,130,246,0.18)", border: "1px solid rgba(59,130,246,0.35)" }}>
                    <span className="text-[#60A5FA] text-[10px] font-bold">{i + 1}</span>
                  </div>
                  <span className="text-white/80 leading-snug">{ax}</span>
                </motion.li>
              ))}
            </ul>
          </div>
        </motion.div>

        {/* Conseil Lucas */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }} className="w-full">
          <motion.div
            className="relative px-4 py-3.5 pb-7 rounded-[18px] cursor-pointer select-none"
            style={{ background: "#272727" }}
            whileTap={{ scale: 0.97, transition: { duration: 0.12 } }}
            whileHover={{ backgroundColor: "#2e2e2e", transition: { duration: 0.15 } }}
          >
            <p className="text-[10px] text-white/40 font-semibold mb-1.5 uppercase tracking-wider">Conseil de Lucas</p>
            <p className="text-white text-sm leading-relaxed pr-6">
              {conseilDisplayed}
              {!conseilDone && <span className="ml-0.5 inline-block w-[2px] h-[13px] bg-white/60 align-middle animate-pulse" />}
            </p>
            <div className="absolute -bottom-3 -right-3 rounded-full border-2" style={{ borderColor: "#080D1A" }}>
              <AgentAvatar agentId="lucas" size={32} />
            </div>
          </motion.div>
        </motion.div>

        {/* Buttons */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
          className="flex flex-col sm:flex-row gap-3 pb-4">
          <button onClick={onReset}
            className="h-11 px-7 rounded-full bg-blue-500 text-white text-sm font-semibold hover:bg-blue-400 transition-colors duration-200 flex items-center gap-2 justify-center">
            <RotateCcw className="size-4" />
            Recommencer un entretien
          </button>
          <button onClick={downloadPDF}
            className="h-11 px-7 rounded-full text-sm font-semibold flex items-center gap-2 justify-center transition-all duration-200"
            style={{ background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.30)", color: "#34D399" }}>
            Télécharger mon rapport PDF
          </button>
          <a href="/dashboard"
            className="h-11 px-7 rounded-full text-white/60 text-sm border border-white/10 hover:bg-white/[0.04] hover:text-white/80 transition-all duration-200 flex items-center justify-center">
            Retour au QG
          </a>
        </motion.div>
      </div>
    </motion.div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function EntretienPage() {
  const [screen, setScreen] = useState<Screen>("intro")
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [resumeFinal, setResumeFinal] = useState<EntretienResumeFinal | null>(null)
  const [muted, setMuted] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)

  // L'AudioContext vit ici, au-dessus des écrans : sans fermeture explicite il
  // continuerait à jouer après le départ de la page.
  useEffect(() => {
    return () => {
      stopAllSpeech()
      audioContextRef.current?.close().catch(() => { /* déjà fermé */ })
      audioContextRef.current = null
    }
  }, [])

  function updateConfig(partial: Partial<Config>) {
    setConfig(c => ({ ...c, ...partial }))
  }

  function handleReset() {
    setScreen("intro")
    setConfig(DEFAULT_CONFIG)
    setResumeFinal(null)
  }

  return (
    <div className="w-full min-h-[calc(100vh-64px)]">
      <AnimatePresence mode="wait">
        {screen === "intro" && <IntroScreen key="intro" onGo={() => setScreen("config")} />}
        {screen === "config" && (
          <ConfigScreen key="config" config={config} setConfig={updateConfig}
            onStart={() => setScreen("interview")} audioContextRef={audioContextRef} />
        )}
        {screen === "interview" && (
          <InterviewScreen key="interview" config={config}
            muted={muted} setMuted={setMuted}
            onFinished={r => { setResumeFinal(r); setScreen("summary") }}
            onReset={handleReset} audioContextRef={audioContextRef} />
        )}
        {screen === "summary" && resumeFinal && (
          <SummaryScreen key="summary" resume={resumeFinal} config={config} onReset={handleReset} />
        )}
      </AnimatePresence>
    </div>
  )
}
