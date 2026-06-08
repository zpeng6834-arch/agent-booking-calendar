import { NextRequest, NextResponse } from 'next/server';
import { authenticate, getUserCalendar, getUserService } from '@/lib/api-auth';
import { createBooking } from '@/lib/booking-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 创建预约（面向 Agent）
 * POST /api/bookings
 * 
 * Body: { 
 *   calendar_id, service_id, start_time, 
 *   customer_name, customer_email, customer_phone?, notes? 
 * }
 * 
 * 成功: 201 + 预约详情
 * 失败: 返回 fail_reason + suggested_slots，Agent 可直接推荐给用户
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
          required: {
            calendar_id: '日历ID（从 GET /api/calendars/{id} 获取）',
            service_id: '服务ID（从 GET /api/calendars/{id}/services 获取）',
            start_time: '预约开始时间，ISO 8601 格式（从 GET /api/availability 获取可选时间）',
            customer_name: '客户姓名',
            customer_email: '客户邮箱',
          },
          optional: {
            customer_phone: '客户电话',
            notes: '预约备注',
          },
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

    const { service, error: svcError } = await getUserService(userId, service_id);
    if (svcError) {
      return NextResponse.json(
        { success: false, error: svcError, hint: '请通过 GET /api/calendars/{id}/services 获取有效的 service_id' },
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
      const statusCode = result.failReason === 'service_full' || result.failReason === 'calendar_full' || result.failReason === 'duplicate' ? 409 : 400;
      
      // Agent 友好的错误描述
      let agentHint = '';
      switch (result.failReason) {
        case 'service_full':
          agentHint = `服务「${service.name}」此时段已约满，请从 suggested_slots 中推荐其他时间给用户`;
          break;
        case 'calendar_full':
          agentHint = `此时段全店预约已满，请从 suggested_slots 中推荐其他时间给用户`;
          break;
        case 'duplicate':
          agentHint = `该客户已在此时段预约了相同服务，请不要重复预约`;
          break;
        case 'outside_business_hours':
          agentHint = `所选时间不在营业时间内（${result.error}）。请先通过 GET /api/availability 查询可预约时间，start_time 请使用返回的 available_slots 中的值，或传入带时区偏移的 ISO 格式（如 2025-01-15T10:30:00+08:00）`;
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
        calendar_id: result.booking?.calendar_id,
        service: {
          id: service.id,
          name: service.name,
          duration_minutes: service.duration_minutes,
        },
        start_time: result.booking?.start_time,
        end_time: result.booking?.end_time,
        customer_name: result.booking?.customer_name,
        customer_email: result.booking?.customer_email,
        customer_phone: result.booking?.customer_phone,
        notes: result.booking?.notes,
        status: result.booking?.status,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Create booking API error:', error);
    return NextResponse.json(
      { success: false, error: `创建预约失败: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * 查询预约列表（面向 Agent）
 * GET /api/bookings?calendar_id=xxx&customer_email=xxx
 * 
 * Agent 可通过此接口查询某客户的所有预约
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
    const customerEmail = searchParams.get('customer_email');

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
    let query = client
      .from('bookings')
      .select('id, service_id, customer_name, customer_email, customer_phone, start_time, end_time, status, notes, created_at')
      .eq('calendar_id', calendarId)
      .order('start_time', { ascending: false });

    if (customerEmail) {
      query = query.eq('customer_email', customerEmail);
    }

    const { data: bookings, error: bkError } = await query;

    if (bkError) {
      return NextResponse.json(
        { success: false, error: '获取预约列表失败' },
        { status: 500 }
      );
    }

    // 获取服务名映射
    const { data: services } = await client
      .from('services')
      .select('id, name')
      .eq('calendar_id', calendarId);
    
    const svcMap = new Map((services || []).map(s => [s.id, s.name]));

    return NextResponse.json({
      success: true,
      data: {
        calendar_id: calendarId,
        bookings: (bookings || []).map(bk => ({
          id: bk.id,
          service_name: svcMap.get(bk.service_id) || '未知服务',
          customer_name: bk.customer_name,
          customer_email: bk.customer_email,
          customer_phone: bk.customer_phone,
          start_time: bk.start_time,
          end_time: bk.end_time,
          status: bk.status,
          notes: bk.notes,
          created_at: bk.created_at,
        })),
        total: bookings?.length || 0,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('List bookings API error:', error);
    return NextResponse.json(
      { success: false, error: `获取预约列表失败: ${message}` },
      { status: 500 }
    );
  }
}
