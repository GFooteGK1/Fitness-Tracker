import type { NextRequest } from 'next/server'
import { recommendationRequest } from '@/app/lib/recommendations/api'
export const GET=(request:NextRequest)=>recommendationRequest(request,false)
