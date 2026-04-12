import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/auth/supabase-server';
import { validateTemplate, type WorkoutTemplate } from '@/app/lib/workout-templates';

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('custom_workout_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching custom templates:', error);
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }

    const templates: WorkoutTemplate[] = (data || []).map((row: any) => ({
      id: `custom-${row.id}`,
      name: row.name,
      category: row.category || 'custom',
      description: row.description || '',
      type: row.type,
      movements: row.movements || [],
      timeCap: row.time_cap,
      rounds: row.rounds,
      tags: row.tags || [],
      isCustom: true,
      userId: row.user_id,
    }));

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error in GET /api/templates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, type, movements, timeCap, rounds, tags, category } = body;

    const validationErrors = validateTemplate({ name, type, movements, timeCap, rounds });
    if (validationErrors.length > 0) {
      return NextResponse.json({ error: validationErrors.join(', ') }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('custom_workout_templates')
      .insert({
        user_id: user.id,
        name,
        description: description || '',
        type,
        category: category || 'custom',
        movements,
        time_cap: timeCap || null,
        rounds: rounds || null,
        tags: tags || [],
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating template:', error);
      return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
    }

    return NextResponse.json({
      template: {
        id: `custom-${data.id}`,
        name: data.name,
        category: data.category || 'custom',
        description: data.description || '',
        type: data.type,
        movements: data.movements || [],
        timeCap: data.time_cap,
        rounds: data.rounds,
        tags: data.tags || [],
        isCustom: true,
        userId: data.user_id,
      },
    });
  } catch (error) {
    console.error('Error in POST /api/templates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const templateId = searchParams.get('id');

    if (!templateId) {
      return NextResponse.json({ error: 'Template ID required' }, { status: 400 });
    }

    // Strip the custom- prefix to get the DB id
    const dbId = templateId.replace('custom-', '');

    const { error } = await supabase
      .from('custom_workout_templates')
      .delete()
      .eq('id', dbId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting template:', error);
      return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/templates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
