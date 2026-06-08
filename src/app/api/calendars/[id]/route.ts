import { NextRequest, NextResponse } from 'next/server';
import { authenticate, getUserCalendar } from '@/lib/api-auth';

/**
 * 获取日历元数据（面向 Agent）
 * GET /api/calendars/{id}
 * 
 * 返回日历的营业时间、时区、容量等信息，让 Agent 了解日历规则
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

    const { id } = await params;
    const { calendar, error: calError } = await getUserCalendar(userId, id);
    if (calError) {
      return NextResponse.json(
        { success: false, error: calError },
        { status: 404 }
      );
    }

    // 格式化营业时间为 Agent 友好的格式
    const businessHours = calendar.business_hours as Record<string, { enabled: boolean; slots: { start: string; end: string }[] }>;
    const formattedHours: Record<string, { is_open: boolean; time_ranges: string[] }> = {};
    for (const [day, config] of Object.entries(businessHours)) {
      formattedHours[day] = {
        is_open: config.enabled,
        time_ranges: config.slots.map(s => `${s.start}-${s.end}`),
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        id: calendar.id,
        name: calendar.name,
        timezone: calendar.timezone,
        capacity_per_slot: calendar.default_capacity,
        capacity_description: `同一时段全店最多接待 ${calendar.default_capacity} 位客户`,
        business_hours: formattedHours,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Calendar metadata API error:', error);
    return NextResponse.json(
      { success: false, error: `获取日历信息失败: ${message}` },
      { status: 500 }
    );
  }
}
