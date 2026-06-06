import { NextRequest, NextResponse } from 'next/server';
import { authenticate, getUserCalendar, getUserService } from '@/lib/api-auth';
import { getAvailableSlots } from '@/lib/booking-utils';

/**
 * 查询可预约时间
 * GET /api/availability?calendar_id=xxx&service_id=xxx&date=2024-01-15
 */
export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await authenticate();
    if (authError) {
      return NextResponse.json(
        { success: false, error: authError },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const calendarId = searchParams.get('calendar_id');
    const serviceId = searchParams.get('service_id');
    const dateStr = searchParams.get('date');
    const daysStr = searchParams.get('days');

    if (!calendarId || !serviceId) {
      return NextResponse.json(
        { success: false, error: '缺少 calendar_id 或 service_id' },
        { status: 400 }
      );
    }

    // 获取日历和服务
    const { calendar, error: calError } = await getUserCalendar(userId, calendarId);
    if (calError) {
      return NextResponse.json(
        { success: false, error: calError },
        { status: 404 }
      );
    }

    const { service, error: svcError } = await getUserService(userId, serviceId);
    if (svcError) {
      return NextResponse.json(
        { success: false, error: svcError },
        { status: 404 }
      );
    }

    if (!service.is_active) {
      return NextResponse.json(
        { success: false, error: '服务已停用' },
        { status: 400 }
      );
    }

    // 计算日期范围
    const startDate = dateStr ? new Date(dateStr) : new Date();
    startDate.setHours(0, 0, 0, 0);
    
    const days = daysStr ? parseInt(daysStr) : 7;
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);

    // 获取可用时间槽
    const { slots, error: slotsError } = await getAvailableSlots(
      calendar,
      service,
      startDate,
      endDate
    );

    if (slotsError) {
      return NextResponse.json(
        { success: false, error: slotsError },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        calendar_id: calendarId,
        service_id: serviceId,
        service_name: service.name,
        duration_minutes: service.duration_minutes,
        capacity: service.capacity,
        slots: slots.filter(s => s.available),
        total_available: slots.filter(s => s.available).length,
      },
    });
  } catch (error) {
    console.error('Availability API error:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    );
  }
}
