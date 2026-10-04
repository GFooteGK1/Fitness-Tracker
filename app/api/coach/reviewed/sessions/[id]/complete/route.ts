import { reviewedHttp } from '@/app/lib/coach/reviewed-http-service'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return reviewedHttp.complete(request, (await params).id)
}
