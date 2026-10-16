import { firstReviewedHttp } from '@/app/lib/coach/first-reviewed-http-service'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  return firstReviewedHttp.readSnapshot((await context.params).id)
}
