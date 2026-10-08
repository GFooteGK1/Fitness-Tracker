import { firstReviewWorkspaceHttp } from '@/app/lib/coach/first-reviewed-http-service'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  return firstReviewWorkspaceHttp.readProgram(request,(await params).id)
}
