import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export async function GET() {
  return NextResponse.json({ deployed: new Date().toISOString(), commit: 'f56d8bc+' })
}
