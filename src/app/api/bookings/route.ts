import { NextRequest, NextResponse } from 'next/server';
import { authenticate, getUserCalendar, getUserService } from '@/lib/api-auth';
import { createBooking } from '@/lib/booking-utils';

/**
 * 创建预约
 * POST /api/bookings
 * Body: { calendar_id, service_id, start_time, customer_name, customer_email, customer_phone?, notes? }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await authenticate();
    if (authError) {
      return NextResponse.json(
        { success: false, error: authError },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      calendar_id,
      service_id,
      start_time,
      customer_name,
      customer_email,
      customer_phone,
      notes,
    } = body;

    // 参数验证
    if (!calendar_id || !service_id || !start_time || !customer_name || !customer_email) {
      return NextResponse.json(
        { 
          success: false, 
          error: '缺少必要参数',
          required: ['calendar_id', 'service_id', 'start_time', 'customer_name', 'customer_email'],
        },
        { status: 400 }
      );
    }

    // 验证日历和服务访问权限
    const { error: calError } = await getUserCalendar(userId, calendar_id);
    if (calError) {
      return NextResponse.json(
        { success: false, error: calError },
        { status: 404 }
      );
    }

    const { error: svcError } = await getUserService(userId, service_id);
    if (svcError) {
      return NextResponse.json(
        { success: false, error: svcError },
        { status: 404 }
      );
    }

    // 创建预约
    const result = await createBooking(
      calendar_id,
      service_id,
      start_time,
      customer_name,
      customer_email,
      customer_phone,
      notes
    );

    if (!result.success) {
      const statusCode = result.error?.includes('已约满') ? 409 : 400;
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          suggested_slots: result.suggestedSlots,
        },
        { status: statusCode }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        booking_id: result.booking?.id,
        calendar_id: result.booking?.calendar_id,
        service_id: result.booking?.service_id,
        start_time: result.booking?.start_time,
        end_time: result.booking?.end_time,
        customer_name: result.booking?.customer_name,
        customer_email: result.booking?.customer_email,
        status: result.booking?.status,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Create booking API error:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    );
  }
}
