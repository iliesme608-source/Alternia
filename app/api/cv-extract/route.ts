export const runtime = 'nodejs'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'

// Réponse d'échec « douce » : toujours HTTP 200 + JSON valide, jamais un 500 muet.
// Le client bascule alors sur la saisie manuelle du CV sans être bloqué.
function fallback(reason: string, status = 200) {
  return NextResponse.json({ text: '', needs_vision: true, reason }, { status })
}

// pdf2json : rapide, suffisant pour la majorité des PDF texte.
async function extractWithPdf2json(buffer: Buffer): Promise<string> {
  const PDFParser = (await import('pdf2json')).default
  return new Promise<string>((resolve, reject) => {
    const parser = new PDFParser()
    const timeout = setTimeout(() => reject(new Error('Timeout pdf2json')), 15000)
    parser.on('pdfParser_dataError', (err: unknown) => { clearTimeout(timeout); reject(err) })
    parser.on('pdfParser_dataReady', () => { clearTimeout(timeout); resolve(parser.getRawTextContent()) })
    parser.parseBuffer(buffer)
  })
}

// pdf-parse v2 : API classe `PDFParse` (et non plus une fonction par défaut).
async function extractWithPdfParse(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    return result?.text ?? ''
  } finally {
    await parser.destroy().catch(() => {})
  }
}

export async function POST(request: NextRequest) {
  try {
    let file: File | null = null
    try {
      const formData = await request.formData()
      const f = formData.get('file')
      if (f instanceof File) file = f
    } catch (err) {
      console.error('[cv-extract] formData illisible:', err)
      return NextResponse.json({ error: 'Fichier illisible.' }, { status: 400 })
    }
    if (!file) return NextResponse.json({ error: 'Aucun fichier' }, { status: 400 })

    console.log('[cv-extract] fichier:', file.name, 'taille:', file.size, 'bytes')

    const name = file.name.toLowerCase()
    if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
      return NextResponse.json({ error: 'Format non supporté. Utilisez PDF ou DOCX.' }, { status: 400 })
    }

    let buffer: Buffer
    try {
      buffer = Buffer.from(await file.arrayBuffer())
    } catch (err) {
      console.error('[cv-extract] lecture du fichier échouée:', err)
      return fallback('read_failed')
    }

    let text = ''

    if (name.endsWith('.docx')) {
      // Import dynamique : une erreur de chargement de mammoth ne doit jamais
      // faire planter le module de la route (source des "Connection error").
      try {
        const mammoth = (await import('mammoth')).default
        const result = await mammoth.extractRawText({ buffer })
        text = result.value ?? ''
      } catch (err) {
        console.error('[cv-extract] mammoth échoué:', err)
      }
    } else {
      // Tentative 1 : pdf-parse (pdfjs) — le plus tolérant sur les PDF réels.
      try {
        text = await extractWithPdfParse(buffer)
      } catch (err) {
        console.error('[cv-extract] pdf-parse échoué:', err)
      }

      // Tentative 2 : pdf2json
      if (!text || text.trim().length < 10) {
        console.log('[cv-extract] pdf-parse vide, fallback pdf2json')
        try {
          text = await extractWithPdf2json(buffer)
        } catch (err) {
          console.error('[cv-extract] pdf2json échoué:', err)
        }
      }
    }

    console.log('[cv-extract] texte longueur:', text.length, 'début:', text.substring(0, 100))

    // PDF image / DOCX sans texte : pas une erreur, le client propose le collage manuel.
    if (!text || text.trim().length < 10) return fallback('empty_text')

    return NextResponse.json({ text })
  } catch (err) {
    // Filet de sécurité : on renvoie TOUJOURS du JSON exploitable par le client.
    console.error('[cv-extract] erreur:', err)
    return fallback('server_error')
  }
}
