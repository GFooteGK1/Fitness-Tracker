import { supervisedHttp } from '@/app/lib/coach/supervised-http-service'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** POST carries the exact original request; this endpoint only reads receipts. */
export async function POST(request: Request) { return supervisedHttp.resolution(request) }
