import { NextRequest, NextResponse } from 'next/server';
import { authenticate, getUserCalendar } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getAvailableSlots, createBooking } from '@/lib/booking-utils';
import { parseTimePreference, getDateTimeInTimezone } from '@/lib/time-preference';
import type { Calendar, Service } from '@/storage/database/shared/schema';

/**
 * POST /api/quick-book
 * 智能预约接口 - 一句话完成预约
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { calendar_id, service, time_preference, customer_info } = body;

    // 参数校验
    if (!calendar_id) {
      return NextResponse.json(
        { success: false, error: '缺少 calendar_id', hint: '请提供日历ID' },
        { status: 400 }
      );
    }
    if (!service) {
      return NextResponse.json(
        { success: false, error: '缺少 service', hint: '请提供服务名称或ID' },
        { status: 400 }
      );
    }
    if (!time_preference) {
      return NextResponse.json(
        { success: false, error: '缺少 time_preference', hint: '请提供时间偏好，如"明天下午"、"下周一上午"' },
        { status: 400 }
      );
    }

    // 验证 API Key / Session
    const { userId, error: authError } = await authenticate();
    if (authError || !userId) {
      return NextResponse.json(
        { success: false, error: authError || '未认证' },
        { status: 401 }
      );
    }

    // 验证日历访问权限
    const { calendar: calendarRecord, error: calendarError } = await getUserCalendar(userId, calendar_id);
    if (calendarError || !calendarRecord) {
      return NextResponse.json(
        { success: false, error: calendarError || '日历不存在' },
        { status: 404 }
      );
    }

    const supabase = getSupabaseClient();

    // 查找服务（支持名称匹配或ID精确匹配）
    const { data: services, error: serviceError } = await supabase
      .from('services')
      .select('*')
      .eq('calendar_id', calendar_id)
      .eq('is_active', true);

    if (serviceError) {
      return NextResponse.json(
        { success: false, error: `查询服务失败: ${serviceError.message}` },
        { status: 500 }
      );
    }

    if (!services || services.length === 0) {
      return NextResponse.json(
        { success: false, error: '该日历下没有可用服务', hint: '请先在日历中创建服务' },
        { status: 404 }
      );
    }

    // 匹配服务
    let matchedService: Service | null = services.find((s: Service) => s.id === service) || null; // 精确ID匹配
    if (!matchedService) {
      // 名称包含匹配（忽略大小写）
      matchedService = services.find(
        (s: Service) => s.name.toLowerCase().includes(service.toLowerCase()) ||
               service.toLowerCase().includes(s.name.toLowerCase())
      ) || null;
    }

    if (!matchedService) {
      return NextResponse.json(
        {
          success: false,
          error: `未找到匹配的服务: ${service}`,
          available_services: services.map((s: Service) => ({ id: s.id, name: s.name })),
          hint: `请使用正确的服务名称，可选服务: ${services.map((s: Service) => s.name).join(', ')}`,
        },
        { status: 404 }
      );
    }

    // 解析时间偏好
    const timePref = parseTimePreference(time_preference, {
      timezone: calendarRecord.timezone || 'Asia/Shanghai',
    });

    // 获取可用时段
    const availabilityResult = await getAvailableSlots(
      calendarRecord,
      matchedService,
      timePref.dateStart,
      addDays(timePref.dateEnd, 1) // 包含当天
    );

    if (availabilityResult.error || !availabilityResult.slots?.length) {
      // 尝试扩展搜索范围（未来7天）
      const extendedStart = timePref.dateStart;
      const extendedEnd = addDays(timePref.dateStart, 7);
      const extendedResult = await getAvailableSlots(
        calendarRecord,
        matchedService,
        extendedStart,
        extendedEnd
      );

      if (extendedResult.error || !extendedResult.slots?.length) {
        return NextResponse.json(
          {
            success: false,
            error: '未找到可用时间',
            details: {
              service_name: matchedService.name,
              requested_preference: time_preference,
              reason: '未来7天内无可用时段',
            },
            hint: '建议告知客户当前无可用时段，或稍后重试',
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: '指定偏好时间内无可用时段',
          details: {
            service_name: matchedService.name,
            requested_preference: time_preference,
            reason: '该时段已约满或不在营业时间内',
          },
          hint: '请告知客户该时段不可用，询问是否需要查看其他可预约时间',
        },
        { status: 409 }
      );
    }

    // 筛选符合时段偏好的 slots
    let filteredSlots = availabilityResult.slots.filter((slot) => {
      const slotLocal = getDateTimeInTimezone(new Date(slot.start), calendarRecord.timezone || 'Asia/Shanghai');
      return slotLocal.hour >= timePref.hourStart && slotLocal.hour < timePref.hourEnd;
    });

    // 如果筛选后无结果，使用原始 slots
    if (filteredSlots.length === 0) {
      filteredSlots = availabilityResult.slots;
    }

    // 选择第一个可用时段（最早）
    const selectedSlot = filteredSlots[0];

    // 处理客户信息
    const cInfo = customer_info || {};
    const customerName = cInfo.name || '匿名客户';
    const customerEmail = cInfo.email || undefined;
    const customerPhone = cInfo.phone || undefined;

    // 将完整 customer_info 序列化存入 notes（排除核心字段）
    const customFields: Record<string, string> = {};
    for (const [key, value] of Object.entries(cInfo)) {
      if (!['name', 'email', 'phone'].includes(key) && value) {
        customFields[key] = String(value);
      }
    }
    const notes = Object.keys(customFields).length > 0 ? JSON.stringify(customFields) : undefined;

    // 创建预约
    const bookingResult = await createBooking(
      calendar_id,
      matchedService.id,
      selectedSlot.start,
      customerName,
      customerEmail,
      customerPhone,
      notes
    );

    if (!bookingResult.success) {
      if (bookingResult.failReason === 'duplicate') {
        return NextResponse.json(
          {
            success: false,
            error: '重复预约',
            details: {
              customer: customerEmail || customerPhone || customerName,
              time: selectedSlot.start,
              service: matchedService.name,
            },
            hint: '该客户在此时段已有预约，请询问客户是否需要查看其他可预约时间',
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: `创建预约失败: ${bookingResult.error}`,
          details: bookingResult,
          hint: '请稍后重试，或询问客户是否需要查看其他可预约时间',
        },
        { status: 500 }
      );
    }

    // 成功响应
    const bookingLocal = getDateTimeInTimezone(
      new Date(bookingResult.booking!.start_time),
      calendarRecord.timezone || 'Asia/Shanghai'
    );
    const timeDisplay = `${bookingLocal.month}月${bookingLocal.day}日 ${String(bookingLocal.hour).padStart(2, '0')}:${String(bookingLocal.minute).padStart(2, '0')}`;

    return NextResponse.json({
      success: true,
      booking: {
        id: bookingResult.booking!.id,
        service_name: matchedService.name,
        start_time: bookingResult.booking!.start_time,
        end_time: bookingResult.booking!.end_time,
        customer_name: customerName,
      },
      message: `已成功预约 ${timeDisplay} 的${matchedService.name}服务`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[quick-book] Error:', error);
    return NextResponse.json(
      { success: false, error: `智能预约失败: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * 加天数
 */
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
