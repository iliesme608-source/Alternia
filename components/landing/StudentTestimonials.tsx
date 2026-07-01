"use client"

import FadeIn from "@/components/animations/FadeIn"
import { Quote } from "lucide-react"

const testimonials = [
  {
    name: "Yasmine B.",
    school: "BTS Commerce — Paris",
    text: "Avant AlternaAI, je cherchais dans le vide. Avec Sarah, j'ai trouvé 18 entreprises en 10 minutes. J'ai décroché mon alternance en 3 semaines.",
  },
  {
    name: "Kilian M.",
    school: "Bachelor Dev — Lyon",
    text: "Lucas m'a préparé avec des vrais entretiens simulés. Le jour J, j'étais calme. Mon score est passé de 5/10 à 8/10 en une semaine.",
  },
  {
    name: "Inès R.",
    school: "Master Marketing — Bordeaux",
    text: "Alex a repéré que mon CV avait un score ATS de 34%. Après optimisation : 89%. J'ai eu 4x plus de réponses la semaine suivante.",
  },
]

export default function StudentTestimonials() {
  return (
    <section className="px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <p className="text-zinc-500 text-xs tracking-widest uppercase text-center mb-4">
            Témoignages
          </p>
        </FadeIn>

        <FadeIn delay={0.05}>
          <h2 className="text-3xl font-semibold tracking-tight leading-tight text-white text-center mb-12">
            Ils ont décroché leur alternance.
          </h2>
        </FadeIn>

        <div className="grid gap-3 sm:grid-cols-3 max-w-4xl mx-auto">
          {testimonials.map((t, i) => (
            <FadeIn key={t.name} delay={0.08 * i}>
              <div className="surface surface-hover p-5 h-full flex flex-col">
                <Quote className="size-3.5 text-zinc-600 mb-4 shrink-0" />
                <p className="text-zinc-300 text-sm leading-relaxed flex-1 mb-5">
                  &ldquo;{t.text}&rdquo;
                </p>
                <div>
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{t.school}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
