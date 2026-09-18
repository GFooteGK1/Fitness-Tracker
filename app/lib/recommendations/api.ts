import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/auth/supabase-server';
import { getRecommendationView } from '@/app/lib/recommendations/service';
import { runtimeFingerprint } from './context';
import { isValidTimezoneOffset } from '@/app/lib/timezone-utils';
import { confirmedUnwrittenEvent } from './event-recovery';
export async function recommendationRequest(request: NextRequest, refresh: boolean) {
    try {
        const db = await createServerClient();
        const { data: { user }, error } = await db.auth.getUser();
        if (error || !user)
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const raw = request.nextUrl.searchParams.get('tzOffset');
        const tzOffset = Number(raw);
        if (raw === null || !/^-?\d{1,3}$/.test(raw) || !Number.isInteger(tzOffset) || !isValidTimezoneOffset(tzOffset))
            return NextResponse.json({ error: 'A valid timezone offset is required.' }, { status: 422 });
        const expected = request.nextUrl.searchParams.get('expectedUserId');
        if (!expected || expected !== user.id)
            return NextResponse.json({ error: 'The signed-in account changed.' }, { status: 403 });
        return NextResponse.json(await getRecommendationView(db, user.id, tzOffset, refresh),{headers:{'Cache-Control':'private, no-store'}});
    }
    catch {
        return NextResponse.json({ status: 'unavailable', recommendations: [], error: 'Your next action is unavailable. Your plan and logging remain available.' }, { status: 503 });
    }
}
export async function recommendationEvent(request: NextRequest, id: string, kind: 'response' | 'shown') {
    try {
        const db = await createServerClient();
        const { data: { user }, error } = await db.auth.getUser();
        if (error || !user)
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const body = await request.json();
        if (body.expectedUserId !== user.id)
            return NextResponse.json({ error: 'The signed-in account changed.' }, { status: 403 });
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || typeof body.requestId !== 'string' || !/^[\w:-]{8,160}$/.test(body.requestId))
            return NextResponse.json({ error: 'Invalid request identity.' }, { status: 422 });
        if (kind === 'response' && !['done_reported', 'not_applicable', 'deferred', 'adjust_requested'].includes(body.response))
            return NextResponse.json({ error: 'Choose a supported response.' }, { status: 422 });
        if (!Number.isInteger(body.tzOffset) || !isValidTimezoneOffset(body.tzOffset))
            return NextResponse.json({ error: 'A valid timezone offset is required.' }, { status: 422 });
        const runtimeArgs = { p_runtime_fingerprint: runtimeFingerprint(), p_timezone_offset: body.tzOffset };
        const args = kind === 'shown' ? { ...runtimeArgs, p_recommendation_id: id, p_request_id: body.requestId } : { ...runtimeArgs, p_recommendation_id: id, p_request_id: body.requestId, p_response: body.response, p_defer_until: body.deferUntil ?? null };
        const result = await db.rpc(kind === 'shown' ? 'acknowledge_recommendation_shown' : 'respond_recommendation', args);
        if (result.error) {
            const noWriteConfirmed = confirmedUnwrittenEvent(result.error, kind);
            return NextResponse.json({ error: noWriteConfirmed ? 'The action changed before this response was saved. Refresh your current action.' : 'The response could not be confirmed. Retry the same response.', code: result.error.code, noWriteConfirmed, refreshRequired: noWriteConfirmed }, { status: ['22023', '40001', '55000'].includes(result.error.code) ? 409 : 503 });
        }
        return NextResponse.json({ event: result.data });
    }
    catch {
        return NextResponse.json({ error: 'The response could not be confirmed. Retry the same response.' }, { status: 503 });
    }
}
