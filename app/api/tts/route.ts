import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { text } = await req.json()

  const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB', {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '',
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    })
  })

  const audioData = await res.arrayBuffer()
  console.log('[TTS] status:', res.status, 'bytes:', audioData.byteLength)

  if (audioData.byteLength < 1000) {
    const errorText = new TextDecoder().decode(audioData)
    console.error('[TTS] ERREUR ElevenLabs:', errorText)
    return NextResponse.json({ error: errorText }, { status: 400 })
  }

  return new NextResponse(audioData, {
    headers: { 'Content-Type': 'audio/mpeg' }
  })
}
