import { reviewedHttp } from '@/app/lib/coach/reviewed-http-service'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return reviewedHttp.readSession(request, (await params).id)
}
