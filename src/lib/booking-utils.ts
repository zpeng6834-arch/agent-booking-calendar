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
  suggestedSlots?: TimeSlot[];
}

/**
 * 获取指定日期范围内的可用时间槽
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
  
  // 获取该时间段内该日历的所有预约（不仅限于当前服务，用于日历级别容量计算）
  const { data: allCalendarBookings, error: bookingsError } = await client
    .from('bookings')
    .select('start_time, end_time, status, service_id')
    .eq('calendar_id', calendar.id)
    .in('status', ['pending', 'confirmed'])
    .gte('start_time', startDate.toISOString())
    .lt('end_time', endDate.toISOString());

  if (bookingsError) {
    return { slots: [], error: '获取预约数据失败' };
  }

  const businessHours = calendar.business_hours as BusinessHoursConfig;
  const serviceDuration = service.duration_minutes;
  const serviceCapacity = service.capacity;
  const calendarCapacity = calendar.default_capacity;
  const timezone = calendar.timezone;

  // 遍历每一天
  const currentDay = new Date(startDate);
  currentDay.setHours(0, 0, 0, 0);
  
  while (currentDay <= endDate) {
    const dayOfWeek = getDayOfWeek(currentDay);
    const dayConfig = businessHours[dayOfWeek];
    
    if (dayConfig?.enabled && dayConfig.slots.length > 0) {
      // 遍历每个营业时段
      for (const slot of dayConfig.slots) {
        const slotStart = parseTime(currentDay, slot.start, timezone);
        const slotEnd = parseTime(currentDay, slot.end, timezone);
        
        // 生成时间段
        let currentSlot = new Date(slotStart);
        while (currentSlot.getTime() + serviceDuration * 60000 <= slotEnd.getTime()) {
          const slotEndtime = new Date(currentSlot.getTime() + serviceDuration * 60000);
          
          // 检查是否在查询范围内
          if (currentSlot >= startDate && currentSlot < endDate) {
            // 计算与此时段重叠的所有预约
            const overlapping = (allCalendarBookings || []).filter((booking) => {
              const bookingStart = new Date(booking.start_time);
              const bookingEnd = new Date(booking.end_time);
              return bookingStart < slotEndtime && bookingEnd > currentSlot;
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
              end: slotEndtime.toISOString(),
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
    
    // 移动到下一天
    currentDay.setDate(currentDay.getDate() + 1);
  }

  return { slots };
}

/**
 * 创建预约（含双层容量校验防超卖）
 * 
 * 校验逻辑：
 * 1. 检查营业时间
 * 2. 检查服务级别容量（该服务同时段预约数 < service.capacity）
 * 3. 检查日历级别容量（该日历同时段所有预约总数 < calendar.default_capacity）
 * 4. 任一不满足则返回失败 + 推荐可选时间
 */
export async function createBooking(
  calendarId: string,
  serviceId: string,
  startTime: string,
  customerName: string,
  customerEmail: string,
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
    return { success: false, error: '日历不存在', failReason: 'other' };
  }

  const { data: service, error: svcError } = await client
    .from('services')
    .select('*')
    .eq('id', serviceId)
    .single();

  if (svcError || !service) {
    return { success: false, error: '服务不存在', failReason: 'other' };
  }

  if (!service.is_active) {
    return { success: false, error: '服务已停用', failReason: 'other' };
  }

  const start = new Date(startTime);
  const end = new Date(start.getTime() + service.duration_minutes * 60000);

  // 检查营业时间
  const dayOfWeek = getDayOfWeek(start);
  const businessHours = calendar.business_hours as BusinessHoursConfig;
  const dayConfig = businessHours[dayOfWeek];

  if (!dayConfig?.enabled) {
    return { success: false, error: '该时间段不在营业时间内', failReason: 'outside_business_hours' };
  }

  // 检查时间段是否在营业时段内
  const timeStr = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;
  const endtimeStr = `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
  
  const inSlot = dayConfig.slots.some((slot) => {
    return timeStr >= slot.start && endtimeStr <= slot.end;
  });

  if (!inSlot) {
    return { success: false, error: '该时间段不在营业时段内', failReason: 'outside_business_hours' };
  }

  // ===== 重复预约校验 =====
  // 同一客户（邮箱）不能在同一时间段预约同一服务
  const { data: duplicateBooking } = await client
    .from('bookings')
    .select('id')
    .eq('calendar_id', calendarId)
    .eq('service_id', serviceId)
    .eq('customer_email', customerEmail)
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
    return { success: false, error: '检查可用容量失败', failReason: 'other' };
  }

  // 2. 服务级别容量校验
  const serviceBookedCount = (allOverlapping || []).filter(
    (b) => b.service_id === serviceId
  ).length;

  if (serviceBookedCount >= service.capacity) {
    // 服务已满，返回推荐时间
    const suggested = await getSuggestedSlots(calendar, service, start);
    return {
      success: false,
      error: `该服务此时段已约满（${serviceBookedCount}/${service.capacity}），请选择其他时间`,
      failReason: 'service_full',
      suggestedSlots: suggested,
    };
  }

  // 3. 日历级别容量校验
  const calendarBookedCount = (allOverlapping || []).length;

  if (calendarBookedCount >= calendar.default_capacity) {
    // 日历总容量已满，返回推荐时间
    const suggested = await getSuggestedSlots(calendar, service, start);
    return {
      success: false,
      error: `该时段全店预约已满（${calendarBookedCount}/${calendar.default_capacity}），请选择其他时间`,
      failReason: 'calendar_full',
      suggestedSlots: suggested,
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
      customer_email: customerEmail,
      customer_phone: customerPhone || null,
      notes: notes || null,
      status: 'confirmed',
    })
    .select()
    .single();

  if (insertError) {
    return { success: false, error: '创建预约失败', failReason: 'other' };
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
    return { success: false, error: '取消预约失败', failReason: 'other' };
  }

  if (!booking) {
    return { success: false, error: '预约不存在或无权操作', failReason: 'other' };
  }

  return { success: true, booking: booking as Booking };
}

/**
 * 改期预约（含双层容量校验）
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
    return { success: false, error: '预约不存在或无权操作', failReason: 'other' };
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

  // 获取日历容量
  const { data: calendarData } = await client
    .from('calendars')
    .select('default_capacity')
    .eq('id', calendarId)
    .single();
  const calendarCapacity = calendarData?.default_capacity || 1;

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
    return { success: false, error: '检查可用容量失败', failReason: 'other' };
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
    return { success: false, error: '改期失败', failReason: 'other' };
  }

  return { success: true, booking: booking as Booking };
}

/**
 * 获取推荐可选时间槽
 */
async function getSuggestedSlots(
  calendar: Calendar,
  service: Service,
  afterTime: Date
): Promise<TimeSlot[]> {
  const suggestedStart = new Date(afterTime);
  suggestedStart.setHours(suggestedStart.getHours() + 1);
  const suggestedEnd = new Date(suggestedStart);
  suggestedEnd.setDate(suggestedEnd.getDate() + 7);
  
  const { slots } = await getAvailableSlots(
    calendar,
    service,
    suggestedStart,
    suggestedEnd
  );
  
  return slots.filter(s => s.available).slice(0, 5);
}

// 辅助函数
function getDayOfWeek(date: Date): keyof BusinessHoursConfig {
  const days: (keyof BusinessHoursConfig)[] = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
  ];
  return days[date.getDay()];
}

function parseTime(date: Date, timeStr: string, _timezone: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}
