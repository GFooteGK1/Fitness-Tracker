import { reviewedHttp } from '@/app/lib/coach/reviewed-http-service'

export async function GET(request: Request) {
  return reviewedHttp.listProposals(request)
}

export async function POST(request: Request) {
  return reviewedHttp.propose(request)
}
