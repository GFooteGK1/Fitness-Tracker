import {NextRequest,NextResponse} from 'next/server'
import {createServerClient} from '@/app/lib/auth/supabase-server'
import {isValidTimezoneOffset} from '@/app/lib/timezone-utils'
import {confirmedUnwrittenEvent} from '@/app/lib/recommendations/event-recovery'
export async function POST(request:NextRequest){
  try{
    const db=await createServerClient();const {data:{user},error}=await db.auth.getUser()
    if(error||!user)return NextResponse.json({error:'Unauthorized'},{status:401})
    const b=await request.json()
    if(b.expectedUserId!==user.id)return NextResponse.json({error:'The signed-in account changed.'},{status:403})
    if(b.domain!=='nutrition'||!Number.isInteger(b.tzOffset)||!isValidTimezoneOffset(b.tzOffset)||!Number.isSafeInteger(b.expectedSourceRevision)||b.expectedSourceRevision<0||!['complete_through','partial','unknown'].includes(b.status)||typeof b.requestId!=='string'||!/^[\w:-]{8,160}$/.test(b.requestId))return NextResponse.json({error:'Review your coverage report.'},{status:422})
    const result=await db.rpc('confirm_logging_coverage',{p_domain:b.domain,p_local_date:b.localDate,p_coverage_through:b.coverageThrough,p_status:b.status,p_request_id:b.requestId,p_expected_source_revision:b.expectedSourceRevision,p_timezone_offset:b.tzOffset})
    if(result.error){
      const noWriteConfirmed=confirmedUnwrittenEvent(result.error,'coverage')
      return NextResponse.json({error:noWriteConfirmed?'The log or date changed before this report was saved. Review current totals.':'Coverage could not be confirmed. Retry the same report.',code:result.error.code,noWriteConfirmed,refreshRequired:noWriteConfirmed},{status:409})
    }
    return NextResponse.json({coverage:result.data})
  }catch{return NextResponse.json({error:'Coverage could not be confirmed.'},{status:503})}
}
