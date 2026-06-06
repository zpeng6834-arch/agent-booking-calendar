import { NextRequest, NextResponse } from 'next/server';
import { authenticate, getUserCalendar } from '@/lib/api-auth';
import { cancelBooking, rescheduleBooking } from '@/lib/booking-utils';

/**
 * 取消预约
 * DELETE /api/bookings/[id]?calendar_id=xxx
 * 
 * 改期预约
 * PATCH /api/bookings/[id]
 * Body: { calendar_id, new_start_time }
 */
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
        { success: false, error: '缺少 calendar_id' },
        { status: 400 }
      );
    }

    // 验证日历访问权限
    const { error: calError } = await getUserCalendar(userId, calendarId);
    if (calError) {
      return NextResponse.json(
        { success: false, error: calError },
        { status: 404 }
      );
    }

    // 取消预约
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
  } catch (error) {
    console.error('Cancel booking API error:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误' },
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
        },
        { status: 400 }
      );
    }

    // 验证日历访问权限
    const { error: calError } = await getUserCalendar(userId, calendar_id);
    if (calError) {
      return NextResponse.json(
        { success: false, error: calError },
        { status: 404 }
      );
    }

    // 改期预约
    const result = await rescheduleBooking(id, calendar_id, new_start_time);

    if (!result.success) {
      const statusCode = result.failReason === 'service_full' || result.failReason === 'calendar_full' ? 409 : 400;
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          fail_reason: result.failReason,
          suggested_slots: result.suggestedSlots,
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
  } catch (error) {
    console.error('Reschedule booking API error:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    );
  }
}
