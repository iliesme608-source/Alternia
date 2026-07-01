import HeroSection from "@/components/landing/HeroSection"
import AgentsSection from "@/components/landing/AgentsSection"
import BenefitsSection from "@/components/landing/BenefitsSection"
import GamificationSection from "@/components/landing/GamificationSection"
import StudentTestimonials from "@/components/landing/StudentTestimonials"
import CTASection from "@/components/landing/CTASection"

export default function LandingPage() {
  return (
    <div className="relative flex flex-col">
      <HeroSection />
      <AgentsSection />
      <BenefitsSection />
      <GamificationSection />
      <StudentTestimonials />
      <CTASection />
    </div>
  )
}
