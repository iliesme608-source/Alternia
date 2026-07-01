import { NextResponse } from "next/server"

const NEWS_STATIC = [
  {
    titre: "Aide à l'embauche des alternants prolongée jusqu'en décembre 2026",
    resume: "Le gouvernement maintient l'aide de 6 000 € pour les entreprises embauchant un apprenti de moins de 30 ans préparant un diplôme jusqu'au niveau bac+5. Les PME de moins de 250 salariés restent prioritaires.",
    date: "2026-06-25",
    source: "Ministère du Travail",
    lien: "https://travail-emploi.gouv.fr/formation-professionnelle/formation-en-alternance-10751/",
  },
  {
    titre: "Record historique : plus d'un million d'apprentis en France",
    resume: "La France franchit le cap symbolique du million d'apprentis en 2026, confirmant l'attractivité de la voie de l'apprentissage auprès des jeunes et des entreprises. Les secteurs du numérique et de la santé tirent la croissance.",
    date: "2026-06-18",
    source: "DARES",
    lien: "https://dares.travail-emploi.gouv.fr/",
  },
  {
    titre: "Nouvelles règles OPCO : simplification des prises en charge 2026",
    resume: "Les Opérateurs de Compétences (OPCO) ont mis à jour leurs barèmes de prise en charge pour la rentrée 2026. Les formations numériques et green tech voient leurs plafonds relevés de 15 % en moyenne.",
    date: "2026-06-10",
    source: "France Compétences",
    lien: "https://www.francecompetences.fr/",
  },
  {
    titre: "Secteurs en tension : 5 métiers alternance qui recrutent en 2026",
    resume: "Cybersécurité, développement durable, logistique, santé et commerce international : ces cinq secteurs peinent à trouver des alternants qualifiés. Les entreprises proposent des conditions avantageuses et des embauches quasi garanties à la clé.",
    date: "2026-06-03",
    source: "France Travail",
    lien: "https://www.francetravail.fr/",
  },
  {
    titre: "Contrat de professionnalisation : le nouveau dispositif Pro-A élargi",
    resume: "Le dispositif Pro-A (promotion ou reconversion par l'alternance) est désormais accessible à tous les salariés sans condition de niveau de qualification. Il permet de financer une formation en alternance jusqu'au bac+5.",
    date: "2026-05-27",
    source: "service-public.fr",
    lien: "https://www.service-public.fr/particuliers/vosdroits/F15478",
  },
]

export async function GET() {
  return NextResponse.json(
    { news: NEWS_STATIC },
    { headers: { "Cache-Control": "s-maxage=7200, stale-while-revalidate=86400" } }
  )
}
