import type { NextRequest } from 'next/server'
import { recommendationRequest } from '@/app/lib/recommendations/api'
export const POST=(request:NextRequest)=>recommendationRequest(request,true)
