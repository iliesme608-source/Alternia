import { NextResponse } from 'next/server'

export async function POST() {
  const res = await fetch('https://api.liveavatar.com/v1/streaming.create_token', {
    method: 'POST',
    headers: { 'x-api-key': process.env.LIVEAVATAR_API_KEY ?? '' }
  })
  const text = await res.text()
  console.log('[liveavatar-token] status:', res.status, 'body:', text)
  const json = JSON.parse(text)
  const token = json?.data?.token || json?.token
  if (!token) return NextResponse.json({ error: 'Token manquant', raw: json }, { status: 500 })
  return NextResponse.json({ token })
}
