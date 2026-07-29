import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Extraction de CV : ces paquets chargent des fichiers à côté d'eux (worker pdfjs,
  // polices) — bundlés par Next.js, leurs chemins cassent et /api/cv-extract échoue.
  serverExternalPackages: ['pdf2json', 'pdf-parse', 'pdfjs-dist'],
};

export default nextConfig;
