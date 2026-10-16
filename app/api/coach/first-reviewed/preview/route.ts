import { firstReviewedPreviewHttp } from '@/app/lib/coach/first-reviewed-http-service'
export const runtime='nodejs'
export async function POST(request:Request){return firstReviewedPreviewHttp.preview(request)}
