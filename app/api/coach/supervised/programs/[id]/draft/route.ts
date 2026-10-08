import { supervisedHttp } from '@/app/lib/coach/supervised-http-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return supervisedHttp.draft(request, (await params).id)
}
