import { supervisedHttp } from '@/app/lib/coach/supervised-http-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  return supervisedHttp.readDecision((await params).requestId)
}
