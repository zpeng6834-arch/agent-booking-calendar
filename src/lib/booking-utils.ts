import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { Calendar, Service, Booking, BusinessHoursConfig } from '@/storage/database/shared/schema';

export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
  /** 该服务的剩余可预约人数 */
  remainingServiceCapacity: number;
  /** 日历总剩余可预约人数 */
  remainingCalendarCapacity: number;
}

export interface AvailabilityResult {
  slots: TimeSlot[];
  error?: string;
}

export interface BookingResult {
  success: boolean;
  booking?: Booking;
  error?: string;
  /** 预约失败原因类型 */
  failReason?: 'service_full' | 'calendar_full' | 'duplicate' | 'outside_business_hours' | 'other';
}

// ===================== 时区工具函数 =====================

/**
 * 获取指定时区下的日期时间组件
 * 使用 Intl API 进行时区转换，不依赖任何第三方库
 */
function getDateTimeInTimezone(date: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: string;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'long',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find(p => p.type === type)?.value || '';

  return {
    year: parseInt(get('year')),
    month: parseInt(get('month')),
    day: parseInt(get('day')),
    hour: get('hour') === '24' ? 0 : parseInt(get('hour')),
    minute: parseInt(get('minute')),
    dayOfWeek: get('weekday').toLowerCase(),
  };
}

/**
 * 计算某时区在特定 UTC 时间点的偏移量（毫秒）
 * 正值表示东区（如 +08:00 = 28800000ms）
 */
function getTimezoneOffsetMs(utcDate: Date, timezone: string): number {
  const utcStr = utcDate.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = utcDate.toLocaleString('en-US', { timeZone: timezone });
  return new Date(tzStr).getTime() - new Date(utcStr).getTime();
}

/**
 * 将日历时区下的本地时间转换为 UTC Date
 * 例如：Asia/Shanghai 下的 "09:00" → UTC "01:00:00.000Z"（+08:00）
 */
function parseTimeInTimezone(date: Date, timeStr: string, timezone: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);

  // 获取 date 在目标时区下的日期（年月日）
  const localDate = getDateTimeInTimezone(date, timezone);

  // 创建一个 "参考 UTC 时间"：用本地时间的年月日+时分秒构造 UTC
  const refUTC = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day, hours, minutes, 0));

  // 计算时区偏移
  const offset = getTimezoneOffsetMs(refUTC, timezone);

  // 实际 UTC = 参考 UTC - 偏移
  return new Date(refUTC.getTime() - offset);
}

/**
 * 获取指定日期在日历时区下的星期几
 */
function getDayOfWeekInTimezone(date: Date, timezone: string): keyof BusinessHoursConfig {
  const localDate = getDateTimeInTimezone(date, timezone);
  const dayMap: Record<string, keyof BusinessHoursConfig> = {
    'monday': 'monday', 'tuesday': 'tuesday', 'wednesday': 'wednesday',
    'thursday': 'thursday', 'friday': 'friday', 'saturday': 'saturday', 'sunday': 'sunday',
  };
  return dayMap[localDate.dayOfWeek] || 'monday';
}

// ===================== 核心逻辑 =====================

/**
 * 获取指定日期范围内的可用时间槽
 *
 * 时区处理：
 * - business_hours 是日历时区下的本地时间（如 "09:00" = 上海时间 9 点）
 * - 所有数据库存储和 API 传输均使用 UTC ISO 格式
 * - 内部自动进行时区转换
 *
 * 双层容量校验：
 * - 服务容量：同一时间段内，该服务的预约数不能超过 service.capacity
 * - 日历容量：同一时间段内，该日历下所有服务的预约总数不能超过 calendar.default_capacity
 */
export async function getAvailableSlots(
  calendar: Calendar,
  service: Service,
  startDate: Date,
  endDate: Date
): Promise<AvailabilityResult> {
  const client = getSupabaseClient();
  const slots: TimeSlot[] = [];
  const timezone = calendar.timezone;

  // 获取该时间段内该日历的所有预约（不仅限于当前服务，用于日历级别容量计算）
  const { data: allCalendarBookings, error: bookingsError } = await client
    .from('bookings')
    .select('start_time, end_time, status, service_id')
    .eq('calendar_id', calendar.id)
    .in('status', ['pending', 'confirmed'])
    .gte('start_time', startDate.toISOString())
    .lt('end_time', endDate.toISOString());

  if (bookingsError) {
    return { slots: [], error: `获取预约数据失败: ${bookingsError.message}` };
  }

  const businessHours = calendar.business_hours as BusinessHoursConfig;
  const serviceDuration = service.duration_minutes;
  const serviceCapacity = service.capacity;
  const calendarCapacity = calendar.default_capacity;

  // 遍历每一天（在日历时区下）
  // 使用日历时区来确定"一天"的范围
  const currentDayUTC = new Date(startDate);

  while (currentDayUTC < endDate) {
    // 获取当前 UTC 时间在日历时区下对应的日期信息
    const localDate = getDateTimeInTimezone(currentDayUTC, timezone);
    const dayOfWeek = getDayOfWeekInTimezone(currentDayUTC, timezone);
    const dayConfig = businessHours[dayOfWeek];

    if (dayConfig?.enabled && dayConfig.slots.length > 0) {
      // 遍历每个营业时段
      for (const slot of dayConfig.slots) {
        // 使用日历时区解析营业时间 → 得到正确的 UTC 时间
        const slotStart = parseTimeInTimezone(currentDayUTC, slot.start, timezone);
        const slotEnd = parseTimeInTimezone(currentDayUTC, slot.end, timezone);

        // 生成时间段
        let currentSlot = new Date(slotStart);
        while (currentSlot.getTime() + serviceDuration * 60000 <= slotEnd.getTime()) {
          const slotEndTime = new Date(currentSlot.getTime() + serviceDuration * 60000);

          // 检查是否在查询范围内
          if (currentSlot >= startDate && currentSlot < endDate) {
            // 计算与此时段重叠的所有预约
            const overlapping = (allCalendarBookings || []).filter((booking) => {
              const bookingStart = new Date(booking.start_time);
              const bookingEnd = new Date(booking.end_time);
              return bookingStart < slotEndTime && bookingEnd > currentSlot;
            });

            // 服务级别：只统计同一服务的预约数
            const serviceBookedCount = overlapping.filter(
              (b) => b.service_id === service.id
            ).length;

            // 日历级别：统计该日历下所有服务的预约总数
            const calendarBookedCount = overlapping.length;

            const remainingService = serviceCapacity - serviceBookedCount;
            const remainingCalendar = calendarCapacity - calendarBookedCount;

            // 取两者中的较小值作为实际可用容量
            const actualRemaining = Math.min(
              Math.max(remainingService, 0),
              Math.max(remainingCalendar, 0)
            );

            slots.push({
              start: currentSlot.toISOString(),
              end: slotEndTime.toISOString(),
              available: actualRemaining > 0,
              remainingServiceCapacity: Math.max(remainingService, 0),
              remainingCalendarCapacity: Math.max(remainingCalendar, 0),
            });
          }

          // 移动到下一个时间段
          currentSlot = new Date(currentSlot.getTime() + serviceDuration * 60000);
        }
      }
    }

    // 移动到下一天（在日历时区下）
    // 简单地加 24 小时，可能会重复遍历同一天（DST 边界），
    // 但 getAvailableSlots 会自动去重（同一时间点只会生成一个 slot）
    currentDayUTC.setDate(currentDayUTC.getDate() + 1);
    // 重置到当天的 00:00 UTC，避免时间累积
    currentDayUTC.setUTCHours(0, 0, 0, 0);
  }

  // 去重：同一 start 时间只保留一个
  const uniqueSlots = slots.filter((slot, index, self) =>
    index === self.findIndex(s => s.start === slot.start)
  );

  return { slots: uniqueSlots };
}

/**
 * 创建预约（含双层容量校验防超卖）
 *
 * 时区处理：
 * - start_time 可以是任何 ISO 8601 格式（含时区后缀或 UTC）
 * - 营业时间校验基于日历时区：将 start_time 转换到日历时区后判断
 *
 * 校验逻辑：
 * 1. 检查营业时间（基于日历时区）
 * 2. 检查服务级别容量
 * 3. 检查日历级别容量
 * 4. 任一不满足则返回失败 + 推荐可选时间
 */
export async function createBooking(
  calendarId: string,
  serviceId: string,
  startTime: string,
  customerName: string,
  customerEmail?: string,
  customerPhone?: string,
  notes?: string
): Promise<BookingResult> {
  const client = getSupabaseClient();

  // 获取日历和服务信息
  const { data: calendar, error: calError } = await client
    .from('calendars')
    .select('*')
    .eq('id', calendarId)
    .single();

  if (calError || !calendar) {
    return { success: false, error: calError ? `日历查询失败: ${calError.message}` : '日历不存在', failReason: 'other' };
  }

  const { data: service, error: svcError } = await client
    .from('services')
    .select('*')
    .eq('id', serviceId)
    .single();

  if (svcError || !service) {
    return { success: false, error: svcError ? `服务查询失败: ${svcError.message}` : '服务不存在', failReason: 'other' };
  }

  if (!service.is_active) {
    return { success: false, error: '服务已停用', failReason: 'other' };
  }

  const timezone = calendar.timezone;
  const start = new Date(startTime);
  const end = new Date(start.getTime() + service.duration_minutes * 60000);

  // ===== 营业时间校验（基于日历时区） =====
  const localStart = getDateTimeInTimezone(start, timezone);
  const localEnd = getDateTimeInTimezone(end, timezone);
  const dayOfWeek = getDayOfWeekInTimezone(start, timezone);
  const businessHours = calendar.business_hours as BusinessHoursConfig;
  const dayConfig = businessHours[dayOfWeek];

  if (!dayConfig?.enabled) {
    return {
      success: false,
      error: `该时间段不在营业时间内（日历时区 ${timezone}：${dayOfWeek} 不营业）`,
      failReason: 'outside_business_hours',
    };
  }

  // 使用日历时区下的本地时间判断是否在营业时段内
  const timeStr = `${String(localStart.hour).padStart(2, '0')}:${String(localStart.minute).padStart(2, '0')}`;
  const endTimeStr = `${String(localEnd.hour).padStart(2, '0')}:${String(localEnd.minute).padStart(2, '0')}`;

  const inSlot = dayConfig.slots.some((slot) => {
    return timeStr >= slot.start && endTimeStr <= slot.end;
  });

  if (!inSlot) {
    return {
      success: false,
      error: `该时间段不在营业时段内（日历时区 ${timezone}：${timeStr}-${endTimeStr} 不在 ${dayConfig.slots.map(s => s.start + '-' + s.end).join(', ')} 内）`,
      failReason: 'outside_business_hours',
    };
  }

  // ===== 重复预约校验 =====
  // 优先用 email 去重，无 email 用 phone，都无则跳过去重
  const dedupField = customerEmail ? 'customer_email' : (customerPhone ? 'customer_phone' : null);
  const dedupValue = customerEmail || customerPhone;

  if (dedupField && dedupValue) {
    const { data: duplicateBooking } = await client
      .from('bookings')
      .select('id')
      .eq('calendar_id', calendarId)
      .eq('service_id', serviceId)
      .eq(dedupField, dedupValue)
      .in('status', ['pending', 'confirmed'])
      .lt('start_time', end.toISOString())
      .gt('end_time', start.toISOString())
      .maybeSingle();

    if (duplicateBooking) {
      return {
        success: false,
        error: `${customerName} 已在该时段预约了 ${service.name}，请勿重复预约`,
        failReason: 'duplicate',
      };
    }
  }

  // ===== 双层容量校验 =====

  // 1. 获取该日历同时段的所有预约（所有服务）
  const { data: allOverlapping, error: overlapError } = await client
    .from('bookings')
    .select('id, service_id')
    .eq('calendar_id', calendarId)
    .in('status', ['pending', 'confirmed'])
    .lt('start_time', end.toISOString())
    .gt('end_time', start.toISOString());

  if (overlapError) {
    return { success: false, error: `检查可用容量失败: ${overlapError.message}`, failReason: 'other' };
  }

  // 2. 服务级别容量校验
  const serviceBookedCount = (allOverlapping || []).filter(
    (b) => b.service_id === serviceId
  ).length;

  if (serviceBookedCount >= service.capacity) {
    return {
      success: false,
      error: `该服务此时段已约满（${serviceBookedCount}/${service.capacity}），请选择其他时间`,
      failReason: 'service_full',
    };
  }

  // 3. 日历级别容量校验
  const calendarBookedCount = (allOverlapping || []).length;

  if (calendarBookedCount >= calendar.default_capacity) {
    return {
      success: false,
      error: `该时段全店预约已满（${calendarBookedCount}/${calendar.default_capacity}），请选择其他时间`,
      failReason: 'calendar_full',
    };
  }

  // 创建预约
  const { data: booking, error: insertError } = await client
    .from('bookings')
    .insert({
      calendar_id: calendarId,
      service_id: serviceId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      customer_name: customerName,
      customer_email: customerEmail || null,
      customer_phone: customerPhone || null,
      notes: notes || null,
      status: 'confirmed',
    })
    .select()
    .single();

  if (insertError) {
    return { success: false, error: `创建预约失败: ${insertError.message}`, failReason: 'other' };
  }

  return { success: true, booking: booking as Booking };
}

/**
 * 取消预约
 */
export async function cancelBooking(bookingId: string, calendarId: string): Promise<BookingResult> {
  const client = getSupabaseClient();

  const { data: booking, error: updateError } = await client
    .from('bookings')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .eq('calendar_id', calendarId)
    .select()
    .maybeSingle();

  if (updateError) {
    return { success: false, error: `取消预约失败: ${updateError.message}`, failReason: 'other' };
  }

  if (!booking) {
    return { success: false, error: '预约不存在或无权操作', failReason: 'other' };
  }

  return { success: true, booking: booking as Booking };
}

/**
 * 改期预约（含双层容量校验，基于日历时区）
 */
export async function rescheduleBooking(
  bookingId: string,
  calendarId: string,
  newStartTime: string
): Promise<BookingResult> {
  const client = getSupabaseClient();

  // 获取原预约
  const { data: original, error: originalError } = await client
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .eq('calendar_id', calendarId)
    .maybeSingle();

  if (originalError || !original) {
    return { success: false, error: originalError ? `查询预约失败: ${originalError.message}` : '预约不存在或无权操作', failReason: 'other' };
  }

  // 获取服务信息以计算新结束时间
  const { data: serviceData } = await client
    .from('services')
    .select('duration_minutes, capacity')
    .eq('id', original.service_id)
    .single();

  const durationMinutes = serviceData?.duration_minutes || 60;
  const serviceCapacity = serviceData?.capacity || 1;
  const newStart = new Date(newStartTime);
  const newEnd = new Date(newStart.getTime() + durationMinutes * 60000);

  // ===== 营业时间校验（基于日历时区）=====
  const { data: calendarData } = await client
    .from('calendars')
    .select('default_capacity, timezone, business_hours')
    .eq('id', calendarId)
    .single();

  const calendarCapacity = calendarData?.default_capacity || 1;
  const timezone = calendarData?.timezone || 'UTC';
  const businessHours = calendarData?.business_hours as BusinessHoursConfig | null;

  if (businessHours) {
    const localStart = getDateTimeInTimezone(newStart, timezone);
    const localEnd = getDateTimeInTimezone(newEnd, timezone);
    const dayOfWeek = getDayOfWeekInTimezone(newStart, timezone);
    const dayConfig = businessHours[dayOfWeek];

    if (!dayConfig?.enabled) {
      return {
        success: false,
        error: `新时间段不在营业时间内（日历时区 ${timezone}）`,
        failReason: 'outside_business_hours',
      };
    }

    const timeStr = `${String(localStart.hour).padStart(2, '0')}:${String(localStart.minute).padStart(2, '0')}`;
    const endTimeStr = `${String(localEnd.hour).padStart(2, '0')}:${String(localEnd.minute).padStart(2, '0')}`;

    const inSlot = dayConfig.slots.some((slot) => {
      return timeStr >= slot.start && endTimeStr <= slot.end;
    });

    if (!inSlot) {
      return {
        success: false,
        error: `新时间段不在营业时段内（日历时区 ${timezone}）`,
        failReason: 'outside_business_hours',
      };
    }
  }

  // 获取新时间段的所有重叠预约（排除当前预约）
  const { data: allOverlapping, error: overlapError } = await client
    .from('bookings')
    .select('id, service_id')
    .eq('calendar_id', calendarId)
    .in('status', ['pending', 'confirmed'])
    .neq('id', bookingId)
    .lt('start_time', newEnd.toISOString())
    .gt('end_time', newStart.toISOString());

  if (overlapError) {
    return { success: false, error: `检查可用容量失败: ${overlapError.message}`, failReason: 'other' };
  }

  // 服务级别容量校验
  const serviceBookedCount = (allOverlapping || []).filter(
    (b) => b.service_id === original.service_id
  ).length;

  if (serviceBookedCount >= serviceCapacity) {
    return {
      success: false,
      error: `新时段该服务已约满（${serviceBookedCount}/${serviceCapacity}）`,
      failReason: 'service_full'
    };
  }

  // 日历级别容量校验
  const calendarBookedCount = (allOverlapping || []).length;

  if (calendarBookedCount >= calendarCapacity) {
    return {
      success: false,
      error: `新时段全店预约已满（${calendarBookedCount}/${calendarCapacity}）`,
      failReason: 'calendar_full'
    };
  }

  // 更新预约时间
  const { data: booking, error: updateError } = await client
    .from('bookings')
    .update({
      start_time: newStart.toISOString(),
      end_time: newEnd.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .select()
    .single();

  if (updateError) {
    return { success: false, error: `改期失败: ${updateError.message}`, failReason: 'other' };
  }

  return { success: true, booking: booking as Booking };
}

/**
 * 获取推荐可选时间槽
 */

