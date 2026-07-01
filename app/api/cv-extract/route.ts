import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Aucun fichier' }, { status: 400 })

    const name = file.name.toLowerCase()
    const buffer = Buffer.from(await file.arrayBuffer())
    let text = ''

    if (name.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else if (name.endsWith('.pdf')) {
      // Tentative 1 : pdf2json
      try {
        const PDFParser = (await import('pdf2json')).default
        text = await new Promise<string>((resolve, reject) => {
          const parser = new PDFParser()
          const timeout = setTimeout(() => reject(new Error('Timeout')), 15000)
          parser.on('pdfParser_dataError', (err: unknown) => { clearTimeout(timeout); reject(err) })
          parser.on('pdfParser_dataReady', () => { clearTimeout(timeout); resolve(parser.getRawTextContent()) })
          parser.parseBuffer(buffer)
        })
      } catch (err) {
        console.error('[cv-extract] pdf2json échoué:', err)
      }

      // Tentative 2 : pdf-parse (Node.js natif, sans worker)
      if (!text || text.trim().length < 10) {
        console.log('[cv-extract] pdf2json vide, fallback pdf-parse')
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pdfParse = (await import('pdf-parse')) as any
          const fn = pdfParse.default ?? pdfParse
          const data = await fn(buffer)
          text = data.text
        } catch (err) {
          console.error('[cv-extract] pdf-parse échoué:', err)
        }
      }
    } else {
      return NextResponse.json({ error: 'Format non supporté. Utilisez PDF ou DOCX.' }, { status: 400 })
    }

    console.log('[cv-extract] fichier:', name, 'taille:', buffer.length, 'texte extrait:', text.length, 'car.')

    if (!text || text.trim().length < 10) {
      return NextResponse.json({ text: '', needs_vision: true })
    }

    return NextResponse.json({ text })
  } catch (err) {
    console.error('[cv-extract] erreur:', err)
    return NextResponse.json({ error: 'Erreur extraction: ' + String(err) }, { status: 500 })
  }
}
