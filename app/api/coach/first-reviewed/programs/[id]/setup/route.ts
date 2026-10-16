import { firstReviewedSetupHttp } from '@/app/lib/coach/first-reviewed-http-service'
export const runtime='nodejs'
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  return firstReviewedSetupHttp.read(request,(await params).id)
}
