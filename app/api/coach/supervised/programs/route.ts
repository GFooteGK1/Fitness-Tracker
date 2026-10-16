import { supervisedHttp } from '@/app/lib/coach/supervised-http-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return supervisedHttp.listPrograms(request)
}
