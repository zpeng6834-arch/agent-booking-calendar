import { NextRequest, NextResponse } from 'next/server';
import { authenticate, getUserCalendar } from '@/lib/api-auth';
import { cancelBooking, rescheduleBooking } from '@/lib/booking-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 查询/取消/改期预约（面向 Agent）
 * 
 * GET    /api/bookings/{id}?calendar_id=xxx       → 查询预约详情
 * PATCH  /api/bookings/{id}                        → 改期预约
 * DELETE /api/bookings/{id}?calendar_id=xxx        → 取消预约
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
    const searchParams = request.nextUrl.searchParams;
    const calendarId = searchParams.get('calendar_id');

    if (!calendarId) {
      return NextResponse.json(
        { success: false, error: '缺少 calendar_id 参数' },
        { status: 400 }
      );
    }

    const { error: calError } = await getUserCalendar(userId, calendarId);
    if (calError) {
      return NextResponse.json(
        { success: false, error: calError },
        { status: 404 }
      );
    }

    const client = getSupabaseClient();
    const { data: booking, error: bkError } = await client
      .from('bookings')
      .select('*')
      .eq('id', id)
      .eq('calendar_id', calendarId)
      .maybeSingle();

    if (bkError || !booking) {
      return NextResponse.json(
        { success: false, error: '预约不存在或无权访问' },
        { status: 404 }
      );
    }

    // 获取服务名称
    const { data: service } = await client
      .from('services')
      .select('id, name, duration_minutes')
      .eq('id', booking.service_id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      data: {
        id: booking.id,
        calendar_id: booking.calendar_id,
        service: service ? {
          id: service.id,
          name: service.name,
          duration_minutes: service.duration_minutes,
        } : { id: booking.service_id, name: '未知服务', duration_minutes: 0 },
        customer_name: booking.customer_name,
        customer_email: booking.customer_email,
        customer_phone: booking.customer_phone,
        start_time: booking.start_time,
        end_time: booking.end_time,
        status: booking.status,
        notes: booking.notes,
        created_at: booking.created_at,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Get booking API error:', error);
    return NextResponse.json(
      { success: false, error: `查询预约失败: ${message}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    const searchParams = request.nextUrl.searchParams;
    const calendarId = searchParams.get('calendar_id');

    if (!calendarId) {
      return NextResponse.json(
        { success: false, error: '缺少 calendar_id 参数' },
        { status: 400 }
      );
    }

    const { error: calError } = await getUserCalendar(userId, calendarId);
    if (calError) {
      return NextResponse.json(
        { success: false, error: calError },
        { status: 404 }
      );
    }

    const result = await cancelBooking(id, calendarId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        booking_id: result.booking?.id,
        status: result.booking?.status,
        message: '预约已取消',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Cancel booking API error:', error);
    return NextResponse.json(
      { success: false, error: `取消预约失败: ${message}` },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const body = await request.json();
    const { calendar_id, new_start_time } = body;

    if (!calendar_id || !new_start_time) {
      return NextResponse.json(
        { 
          success: false, 
          error: '缺少必要参数',
          required: ['calendar_id', 'new_start_time'],
          hint: 'new_start_time 为新的预约开始时间（ISO 8601 格式），请先通过 GET /api/availability 查询可用时间',
        },
        { status: 400 }
      );
    }

    const { error: calError } = await getUserCalendar(userId, calendar_id);
    if (calError) {
      return NextResponse.json(
        { success: false, error: calError },
        { status: 404 }
      );
    }

    const result = await rescheduleBooking(id, calendar_id, new_start_time);

    if (!result.success) {
      const statusCode = result.failReason === 'service_full' || result.failReason === 'calendar_full' ? 409 : 400;
      
      let agentHint = '';
      switch (result.failReason) {
        case 'service_full':
          agentHint = '新时段该服务已约满，请从 suggested_slots 中推荐其他时间';
          break;
        case 'calendar_full':
          agentHint = '新时段全店预约已满，请从 suggested_slots 中推荐其他时间';
          break;
        default:
          agentHint = '请检查参数后重试';
      }

      return NextResponse.json(
        {
          success: false,
          error: result.error,
          fail_reason: result.failReason,
          agent_hint: agentHint,
          suggested_slots: result.suggestedSlots?.map(s => ({
            start_time: s.start,
            end_time: s.end,
            remaining_service_capacity: s.remainingServiceCapacity,
            remaining_calendar_capacity: s.remainingCalendarCapacity,
          })),
        },
        { status: statusCode }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        booking_id: result.booking?.id,
        start_time: result.booking?.start_time,
        end_time: result.booking?.end_time,
        status: result.booking?.status,
        message: '预约已改期',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Reschedule booking API error:', error);
    return NextResponse.json(
      { success: false, error: `改期预约失败: ${message}` },
      { status: 500 }
    );
  }
}
