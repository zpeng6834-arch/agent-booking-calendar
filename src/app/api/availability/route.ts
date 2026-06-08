import { NextRequest, NextResponse } from 'next/server';
import { authenticate, getUserCalendar } from '@/lib/api-auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getAvailableSlots } from '@/lib/booking-utils';
import type { BusinessHoursConfig } from '@/storage/database/shared/schema';

/**
 * 查询可预约时间（面向 Agent）
 * GET /api/availability?calendar_id=xxx&service_id=xxx&date=2024-01-15&days=7
 * 
 * service_id 可选：
 * - 提供 service_id → 返回该服务的可用时间（含服务级和日历级剩余容量）
 * - 不提供 service_id → 返回所有活跃服务的可用时间概览
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

    if (!calendarId) {
      return NextResponse.json(
        { success: false, error: '缺少 calendar_id 参数', hint: '请先通过 GET /api/calendars/{id} 获取日历信息，再通过 GET /api/calendars/{id}/services 获取服务列表' },
        { status: 400 }
      );
    }

    // 获取日历
    const { calendar, error: calError } = await getUserCalendar(userId, calendarId);
    if (calError) {
      return NextResponse.json(
        { success: false, error: calError },
        { status: 404 }
      );
    }

    // 计算日期范围
    const startDate = dateStr ? new Date(dateStr) : new Date();
    startDate.setHours(0, 0, 0, 0);
    const days = daysStr ? parseInt(daysStr) : 7;
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);

    // 格式化营业时间
    const businessHours = calendar.business_hours as BusinessHoursConfig;
    const formattedHours: Record<string, { is_open: boolean; time_ranges: string[] }> = {};
    for (const [day, config] of Object.entries(businessHours)) {
      formattedHours[day] = {
        is_open: config.enabled,
        time_ranges: config.slots.map(s => `${s.start}-${s.end}`),
      };
    }

    const client = getSupabaseClient();

    if (serviceId) {
      // 指定服务：返回详细可用时间
      const { data: service, error: svcError } = await client
        .from('services')
        .select('*')
        .eq('id', serviceId)
        .eq('calendar_id', calendarId)
        .maybeSingle();

      if (svcError || !service) {
        return NextResponse.json(
          { success: false, error: '服务不存在或无权访问', hint: '请通过 GET /api/calendars/{id}/services 获取有效的服务列表' },
          { status: 404 }
        );
      }

      if (!service.is_active) {
        return NextResponse.json(
          { success: false, error: '服务已停用', hint: '该服务当前不可预约，请选择其他服务' },
          { status: 400 }
        );
      }

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

      const availableSlots = slots.filter(s => s.available);

      return NextResponse.json({
        success: true,
        data: {
          calendar_id: calendarId,
          service: {
            id: service.id,
            name: service.name,
            duration_minutes: service.duration_minutes,
            capacity_per_slot: service.capacity,
          },
          calendar_capacity_per_slot: calendar.default_capacity,
          business_hours: formattedHours,
          date_range: {
            start: startDate.toISOString().split('T')[0],
            end: endDate.toISOString().split('T')[0],
          },
          available_slots: availableSlots.map(s => ({
            start_time: s.start,
            end_time: s.end,
            remaining_service_capacity: s.remainingServiceCapacity,
            remaining_calendar_capacity: s.remainingCalendarCapacity,
          })),
          total_available_slots: availableSlots.length,
        },
      });
    } else {
      // 未指定服务：返回所有活跃服务的概览
      const { data: services, error: svcListError } = await client
        .from('services')
        .select('*')
        .eq('calendar_id', calendarId)
        .eq('is_active', true);

      if (svcListError) {
        return NextResponse.json(
          { success: false, error: '获取服务列表失败' },
          { status: 500 }
        );
      }

      if (!services || services.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            calendar_id: calendarId,
            calendar_capacity_per_slot: calendar.default_capacity,
            business_hours: formattedHours,
            date_range: {
              start: startDate.toISOString().split('T')[0],
              end: endDate.toISOString().split('T')[0],
            },
            services: [],
            hint: '该日历暂无可用服务，请联系管理员添加服务后再查询',
          },
        });
      }

      // 为每个服务获取可用时间
      const servicesAvailability = await Promise.all(
        services.map(async (svc) => {
          const { slots } = await getAvailableSlots(calendar, svc, startDate, endDate);
          const availableSlots = slots.filter(s => s.available);
          return {
            service: {
              id: svc.id,
              name: svc.name,
              duration_minutes: svc.duration_minutes,
              capacity_per_slot: svc.capacity,
            },
            available_slots: availableSlots.map(s => ({
              start_time: s.start,
              end_time: s.end,
              remaining_service_capacity: s.remainingServiceCapacity,
              remaining_calendar_capacity: s.remainingCalendarCapacity,
            })),
            total_available_slots: availableSlots.length,
          };
        })
      );

      return NextResponse.json({
        success: true,
        data: {
          calendar_id: calendarId,
          calendar_capacity_per_slot: calendar.default_capacity,
          business_hours: formattedHours,
          date_range: {
            start: startDate.toISOString().split('T')[0],
            end: endDate.toISOString().split('T')[0],
          },
          services: servicesAvailability,
          hint: '返回所有活跃服务的可用时间。如只需查看某个服务，请添加 service_id 参数',
        },
      });
    }
  } catch (error) {
    console.error('Availability API error:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    );
  }
}
