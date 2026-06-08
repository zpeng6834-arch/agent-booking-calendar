import { NextRequest, NextResponse } from 'next/server';
import { authenticate, getUserCalendar } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 获取日历下的服务列表（面向 Agent）
 * GET /api/calendars/{id}/services
 * 
 * 让 Agent 知道有哪些服务可以预约，以及每个服务的时长和容量
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await authenticate();
    if (authError) {
      return NextResponse.json(
        { success: false, error: authError },
        { status: 401 }
      );
    }

    const { id: calendarId } = await params;
    const { error: calError } = await getUserCalendar(userId, calendarId);
    if (calError) {
      return NextResponse.json(
        { success: false, error: calError },
        { status: 404 }
      );
    }

    const client = getSupabaseClient();
    const { data: services, error: svcError } = await client
      .from('services')
      .select('id, name, description, duration_minutes, capacity, is_active')
      .eq('calendar_id', calendarId)
      .order('created_at', { ascending: true });

    if (svcError) {
      return NextResponse.json(
        { success: false, error: '获取服务列表失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        calendar_id: calendarId,
        services: (services || []).map(s => ({
          id: s.id,
          name: s.name,
          description: s.description || '',
          duration_minutes: s.duration_minutes,
          capacity_per_slot: s.capacity,
          capacity_description: `每时段最多 ${s.capacity} 人预约`,
          is_available: s.is_active,
        })),
        total: services?.length || 0,
        available_count: services?.filter(s => s.is_active).length || 0,
      },
    });
  } catch (error) {
    console.error('List services API error:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    );
  }
}
