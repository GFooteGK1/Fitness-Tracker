import { firstReviewSetupActionsHttp } from '@/app/lib/coach/first-reviewed-http-service'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  return firstReviewSetupActionsHttp.read(request,(await params).id)
}
