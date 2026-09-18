import type { NextRequest } from 'next/server'
import { recommendationEvent } from '@/app/lib/recommendations/api'
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){return recommendationEvent(request,(await context.params).id,'response')}
