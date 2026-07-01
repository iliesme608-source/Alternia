"use client"

import FadeIn from "@/components/animations/FadeIn"

const steps = [
  {
    number: "01",
    title: "Crée ton profil",
    description: "Renseigne ton secteur, ton niveau d'études et tes objectifs. En 2 minutes, ton équipe d'agents est configurée.",
  },
  {
    number: "02",
    title: "Active tes agents",
    description: "Alex optimise ton CV, Sarah trouve les entreprises, Lucas t'entraîne aux entretiens. Chaque agent a sa spécialité.",
  },
  {
    number: "03",
    title: "Avance chaque jour",
    description: "Des missions quotidiennes, de l'XP à gagner, des relances automatiques. Chaque jour te rapproche de l'alternance.",
  },
]

export default function BenefitsSection() {
  return (
    <section className="px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <p className="text-zinc-500 text-xs tracking-widest uppercase text-center mb-4">
            Comment ça marche
          </p>
        </FadeIn>

        <FadeIn delay={0.05}>
          <h2 className="text-3xl font-semibold tracking-tight leading-tight text-white text-center mb-12">
            De zéro à alternant, étape par étape.
          </h2>
        </FadeIn>

        <div className="space-y-3 max-w-3xl mx-auto">
          {steps.map((step, i) => (
            <FadeIn key={step.number} delay={i * 0.08}>
              <div className="surface surface-hover px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="shrink-0 flex size-9 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03]">
                  <span className="text-xs font-medium text-zinc-400">{step.number}</span>
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium text-sm mb-1">{step.title}</p>
                  <p className="text-zinc-500 text-sm leading-relaxed">{step.description}</p>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  )
}
