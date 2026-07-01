"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Send, RotateCcw, Star, Mic, MicOff, Loader2, Volume2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { Message, EntretienResumeFinal } from "@/types"

interface EntretienChatProps {
  entreprise: string
  poste: string
  onReset: () => void
}

type VoiceStatus = "idle" | "speaking" | "listening" | "analyzing"

export default function EntretienChat({ entreprise, poste, onReset }: EntretienChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [resumeFinal, setResumeFinal] = useState<EntretienResumeFinal | null>(null)
  const [started, setStarted] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [hasMic, setHasMic] = useState(false)
  const [avatarConnecting, setAvatarConnecting] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle")
  const sessionIdRef = useRef<string | null>(null)
  const authTokenRef = useRef<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingTranscriptRef = useRef("")
  const autoConvRef = useRef(false)
  const submitAnswerRef = useRef<((text: string) => Promise<void>) | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Recognizer = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    setHasMic(!!Recognizer)
  }, [])

  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    }
  }, [])

  // ─── Speech helpers ────────────────────────────────────────────────────────

  async function speakAndWait(text: string): Promise<void> {
    setVoiceStatus("speaking")
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
      if (!res.ok) {
        console.error('[TTS] API error:', res.status, await res.text())
        return
      }
      const blob = await res.blob()
      console.log('[TTS] blob reçu:', blob.size, 'bytes, type:', blob.type)
      if (blob.size < 100) {
        console.error('[TTS] blob trop petit — probablement vide')
        return
      }
      const url = URL.createObjectURL(blob)
      if (audioRef.current) {
        audioRef.current.pause()
        URL.revokeObjectURL(audioRef.current.src)
      }
      const audio = new Audio()
      audio.src = url
      audioRef.current = audio
      await new Promise<void>((resolve) => {
        audio.onended = () => { URL.revokeObjectURL(url); resolve() }
        audio.onerror = (e) => { console.error('[TTS] erreur lecture:', e); resolve() }
        audio.play().catch((e) => { console.error('[TTS] play() error:', e); resolve() })
      })
    } catch (err) {
      console.error('[TTS] erreur globale:', err)
    }
  }

  // ─── Auto listening ────────────────────────────────────────────────────────

  function startAutoListening() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Recognizer = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!Recognizer) return

    pendingTranscriptRef.current = ""
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new Recognizer()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = "fr-FR"

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      let transcript = ""
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setInput(transcript)
      pendingTranscriptRef.current = transcript

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => rec.stop(), 1500)
    }

    rec.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
      const pending = pendingTranscriptRef.current.trim()
      if (autoConvRef.current && pending) {
        pendingTranscriptRef.current = ""
        submitAnswerRef.current?.(pending)
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      if (e.error === "no-speech") {
        rec.stop()
        return
      }
      console.error("[Mic] Erreur reconnaissance:", e.error)
      setIsListening(false)
      recognitionRef.current = null
    }

    recognitionRef.current = rec
    rec.start()
    setIsListening(true)
    setVoiceStatus("listening")
  }

  function toggleMic() {
    if (isListening && recognitionRef.current) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      autoConvRef.current = false
      recognitionRef.current.stop()
      setIsListening(false)
      setVoiceStatus("idle")
      return
    }
    if (!loading && !isFinished) {
      autoConvRef.current = true
      startAutoListening()
    }
  }

  // ─── LiveAvatar iframe ─────────────────────────────────────────────────────

  async function initAvatar() {
    setAvatarConnecting(true)
    try {
      const res = await fetch("/api/liveavatar-token", { method: "POST" })
      const json = await res.json()
      if (!json.embedUrl) throw new Error(json.error ?? "URL manquante")
      setAvatarUrl(json.embedUrl)
      setAvatarConnecting(false)
    } catch (err) {
      console.error("[LiveAvatar] init échoué — fallback Web Speech activé:", err)
      setAvatarConnecting(false)
      setAvatarFailed(true)
    }
  }

  // ─── Core submit ───────────────────────────────────────────────────────────

  async function submitAnswer(text: string) {
    if (!text.trim() || loading || isFinished) return

    if (recognitionRef.current) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
    setVoiceStatus("analyzing")
    setInput("")
    pendingTranscriptRef.current = ""

    const userMsg: Message = { role: "user", content: text, timestamp: new Date().toISOString() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setLoading(true)

    const res = await fetch("/api/entretien", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authTokenRef.current ? { Authorization: `Bearer ${authTokenRef.current}` } : {}),
      },
      body: JSON.stringify({
        entreprise,
        poste,
        messages: newMessages,
        action: "reply",
        session_id: sessionIdRef.current,
      }),
    })
    const data = await res.json()

    setMessages([
      ...newMessages,
      {
        role: "assistant",
        content: data.question,
        feedback: data.feedback ?? undefined,
        score: data.score,
        timestamp: new Date().toISOString(),
      },
    ])
    setLoading(false)

    if (data.est_termine) {
      setIsFinished(true)
      autoConvRef.current = false
      setVoiceStatus("idle")
      if (data.resume_final) setResumeFinal(data.resume_final)
      return
    }

    if (data.question) {
      await speakAndWait(data.question)
      if (autoConvRef.current) startAutoListening()
    }
  }

  submitAnswerRef.current = submitAnswer

  // ─── Session start ─────────────────────────────────────────────────────────

  async function startSession() {
    setLoading(true)
    setStarted(true)

    // Fetch auth token once for the session lifetime
    const { data: { session } } = await supabase.auth.getSession()
    authTokenRef.current = session?.access_token ?? null

    const res = await fetch("/api/entretien", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authTokenRef.current ? { Authorization: `Bearer ${authTokenRef.current}` } : {}),
      },
      body: JSON.stringify({ entreprise, poste, messages: [], action: "start" }),
    })
    const data = await res.json()
    if (data.session_id) sessionIdRef.current = data.session_id

    const firstQuestion = data.question
    setMessages([{ role: "assistant", content: firstQuestion, timestamp: new Date().toISOString() }])
    setLoading(false)

    initAvatar().catch((err) => console.error("[LiveAvatar] init uncaught:", err))

    autoConvRef.current = true
    await speakAndWait(firstQuestion)
    if (autoConvRef.current) startAutoListening()
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return
    autoConvRef.current = true
    await submitAnswer(input.trim())
  }

  // ─── UI ────────────────────────────────────────────────────────────────────

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-center max-w-sm">
          <p className="text-muted-foreground mb-6">
            L&apos;IA va jouer le rôle d&apos;un recruteur de{" "}
            <strong>{entreprise}</strong> pour un poste de{" "}
            <strong>{poste}</strong>. Répondez naturellement.
          </p>
          <Button onClick={startSession} disabled={loading} size="lg">
            {loading ? "Démarrage…" : "Démarrer l'entretien"}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[600px]">
      {/* Left: LiveAvatar iframe */}
      <div className="w-56 flex-shrink-0 relative bg-muted border-r border-border overflow-hidden">
        {avatarConnecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-muted text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-xs text-center px-4">Connexion au recruteur...</p>
          </div>
        )}
        {!avatarUrl && !avatarConnecting && avatarFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-3">
            <p className="text-xs text-muted-foreground">Avatar indisponible</p>
            <p className="text-[10px] text-muted-foreground/60">Mode vocal actif</p>
          </div>
        )}
        {avatarUrl && (
          <iframe
            src={avatarUrl}
            className="w-full h-full border-0"
            allow="camera; microphone"
          />
        )}
      </div>

      {/* Right: Chat */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <span className="text-xs text-muted-foreground">Entretien en cours</span>
          {voiceStatus !== "idle" && (
            <div className="flex items-center gap-1.5 text-xs font-medium">
              {voiceStatus === "speaking" && (
                <><Volume2 className="size-3 text-[#3B82F6] animate-pulse" /><span className="text-[#3B82F6]">Annie parle…</span></>
              )}
              {voiceStatus === "listening" && (
                <><span className="size-2 rounded-full bg-red-500 animate-ping inline-flex" /><span className="text-red-600 dark:text-red-400">Votre tour…</span></>
              )}
              {voiceStatus === "analyzing" && (
                <><Loader2 className="size-3 animate-spin text-amber-500" /><span className="text-amber-600 dark:text-amber-400">Analyse…</span></>
              )}
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col gap-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className="max-w-[82%] rounded-[18px] px-4 py-3 text-sm text-white cursor-default transition-transform active:scale-[0.97]"
                style={{ background: msg.role === "user" ? "#323232" : "#272727" }}
              >
                {msg.content}
              </div>

              {msg.score !== null && msg.score !== undefined && (
                <Badge
                  variant={msg.score >= 7 ? "default" : "secondary"}
                  className="text-[11px] px-2 gap-1"
                >
                  <Star className="size-2.5" />
                  {msg.score}/10
                </Badge>
              )}

              {msg.feedback && (
                <div
                  className="max-w-[82%] rounded-[18px] px-4 py-3 text-xs space-y-2"
                  style={{ background: "#272727" }}
                >
                  <div className="space-y-0.5">
                    <p className="text-white/35 font-medium text-[10px] uppercase tracking-widest">Point fort</p>
                    <p className="text-[#34D399]">{msg.feedback.point_fort}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-white/35 font-medium text-[10px] uppercase tracking-widest">À améliorer</p>
                    <p className="text-amber-400">{msg.feedback.a_ameliorer}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-white/35 font-medium text-[10px] uppercase tracking-widest">Conseil</p>
                    <p className="text-white/70">{msg.feedback.conseil}</p>
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-start">
              <div
                className="rounded-[18px] px-4 py-3 text-sm text-white/40"
                style={{ background: "#272727" }}
              >
                <span className="animate-pulse">Le recruteur réfléchit…</span>
              </div>
            </div>
          )}

          {isFinished && resumeFinal && (
            <Card className="mt-2 border-white/[0.08] bg-white/[0.03]">
              <CardHeader className="py-3 pb-1">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Star className="size-4 text-amber-500" />
                  Bilan final —{" "}
                  <Badge variant={resumeFinal.score_global >= 7 ? "default" : "secondary"} className="text-xs">
                    {resumeFinal.score_global}/10
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3 text-xs space-y-2.5">
                <div>
                  <p className="font-semibold text-green-700 dark:text-green-400 mb-1">✅ Points forts</p>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    {resumeFinal.points_forts.map((pt, j) => <li key={j}>{pt}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">⚡ Axes d&apos;amélioration</p>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    {resumeFinal.axes_amelioration.map((ax, j) => <li key={j}>{ax}</li>)}
                  </ul>
                </div>
                <div className="border-t border-white/[0.06] pt-2">
                  <p className="font-semibold text-[#3B82F6] mb-1">Conseil final</p>
                  <p className="text-muted-foreground">{resumeFinal.conseil_final}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-border shrink-0">
          <form onSubmit={sendMessage} className="flex gap-2 p-4">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isFinished
                  ? "Entretien terminé"
                  : voiceStatus === "listening"
                  ? "En cours d'écoute… (silence 1,5 s = envoi auto)"
                  : voiceStatus === "speaking"
                  ? "Annie parle…"
                  : "Votre réponse… (ou parlez directement)"
              }
              disabled={loading || isFinished}
              className="flex-1"
            />
            {hasMic && !isFinished && (
              <Button
                type="button"
                variant={isListening ? "destructive" : "outline"}
                size="icon"
                onClick={toggleMic}
                disabled={loading || voiceStatus === "speaking"}
                title={isListening ? "Arrêter l'écoute" : "Activer le micro"}
              >
                {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>
            )}
            <Button type="submit" size="icon" disabled={loading || !input.trim() || isFinished}>
              <Send className="size-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={onReset} title="Recommencer">
              <RotateCcw className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
