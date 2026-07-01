import { NextResponse } from 'next/server'

export async function POST() {
  const res = await fetch('https://api.liveavatar.com/v2/embeddings', {
    method: 'POST',
    headers: {
      'X-API-KEY': process.env.LIVEAVATAR_API_KEY ?? '',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      avatar_id: '9650a758-1085-4d49-8bf3-f347565ec229',
      context_id: '1b50682e-2d2b-4c6f-b590-2c8c9110af58',
      is_sandbox: true
    })
  })
  const text = await res.text()
  console.log('[liveavatar] status:', res.status, 'body:', text)
  const json = JSON.parse(text)
  const embedUrl = json?.data?.url
  if (!embedUrl) return NextResponse.json({ error: 'URL manquante', raw: json }, { status: 500 })
  return NextResponse.json({ embedUrl })
}
