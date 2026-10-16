import { firstReviewSetupActionsHttp } from '@/app/lib/coach/first-reviewed-http-service'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function POST(request:Request){return firstReviewSetupActionsHttp.close(request)}
