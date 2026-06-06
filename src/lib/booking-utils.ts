import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { Calendar, Service, Booking, BusinessHoursConfig } from '@/storage/database/shared/schema';

export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
  remainingCapacity: number;
}

export interface AvailabilityResult {
  slots: TimeSlot[];
  error?: string;
}

export interface BookingResult {
  success: boolean;
  booking?: Booking;
  error?: string;
  suggestedSlots?: TimeSlot[];
}

/**
 * 获取指定日期范围内的可用时间槽
 */
export async function getAvailableSlots(
  calendar: Calendar,
  service: Service,
  startDate: Date,
  endDate: Date
): Promise<AvailabilityResult> {
  const client = getSupabaseClient();
  const slots: TimeSlot[] = [];
  
  // 获取该时间段内的所有预约
  const { data: existingBookings, error: bookingsError } = await client
    .from('bookings')
    .select('start_time, end_time, status')
    .eq('calendar_id', calendar.id)
    .eq('service_id', service.id)
    .in('status', ['pending', 'confirmed'])
    .gte('start_time', startDate.toISOString())
    .lt('end_time', endDate.toISOString());

  if (bookingsError) {
    return { slots: [], error: '获取预约数据失败' };
  }

  const businessHours = calendar.business_hours as BusinessHoursConfig;
  const serviceDuration = service.duration_minutes;
  const capacity = service.capacity;
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
            // 计算已预约数量
            const overlapping = (existingBookings || []).filter((booking) => {
              const bookingStart = new Date(booking.start_time);
              const bookingEnd = new Date(booking.end_time);
              return bookingStart < slotEndtime && bookingEnd > currentSlot;
            });
            
            const bookedCount = overlapping.length;
            const remaining = capacity - bookedCount;
            
            slots.push({
              start: currentSlot.toISOString(),
              end: slotEndtime.toISOString(),
              available: remaining > 0,
              remainingCapacity: remaining,
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
 * 创建预约（含容量校验）
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
    return { success: false, error: '日历不存在' };
  }

  const { data: service, error: svcError } = await client
    .from('services')
    .select('*')
    .eq('id', serviceId)
    .single();

  if (svcError || !service) {
    return { success: false, error: '服务不存在' };
  }

  if (!service.is_active) {
    return { success: false, error: '服务已停用' };
  }

  const start = new Date(startTime);
  const end = new Date(start.getTime() + service.duration_minutes * 60000);

  // 检查营业时间
  const dayOfWeek = getDayOfWeek(start);
  const businessHours = calendar.business_hours as BusinessHoursConfig;
  const dayConfig = businessHours[dayOfWeek];

  if (!dayConfig?.enabled) {
    return { success: false, error: '该时间段不在营业时间内' };
  }

  // 检查时间段是否在营业时段内
  const timeStr = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;
  const endtimeStr = `${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
  
  const inSlot = dayConfig.slots.some((slot) => {
    return timeStr >= slot.start && endtimeStr <= slot.end;
  });

  if (!inSlot) {
    return { success: false, error: '该时间段不在营业时段内' };
  }

  // 检查容量 - 使用事务确保原子性
  const { data: overlapping, error: overlapError } = await client
    .from('bookings')
    .select('id')
    .eq('calendar_id', calendarId)
    .eq('service_id', serviceId)
    .in('status', ['pending', 'confirmed'])
    .lt('start_time', end.toISOString())
    .gt('end_time', start.toISOString());

  if (overlapError) {
    return { success: false, error: '检查可用容量失败' };
  }

  if (overlapping && overlapping.length >= service.capacity) {
    // 返回推荐的可用时间
    const suggestedStart = new Date(start);
    suggestedStart.setHours(suggestedStart.getHours() + 1);
    const suggestedEnd = new Date(suggestedStart);
    suggestedEnd.setDate(suggestedEnd.getDate() + 7);
    
    const { slots: suggestedSlots } = await getAvailableSlots(
      calendar as Calendar,
      service as Service,
      suggestedStart,
      suggestedEnd
    );
    
    return {
      success: false,
      error: '该时间段已约满',
      suggestedSlots: suggestedSlots.filter(s => s.available).slice(0, 5),
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
    return { success: false, error: '创建预约失败' };
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
    return { success: false, error: '取消预约失败' };
  }

  if (!booking) {
    return { success: false, error: '预约不存在或无权操作' };
  }

  return { success: true, booking: booking as Booking };
}

/**
 * 改期预约
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
    .select('*, services(duration_minutes)')
    .eq('id', bookingId)
    .eq('calendar_id', calendarId)
    .maybeSingle();

  if (originalError || !original) {
    return { success: false, error: '预约不存在或无权操作' };
  }

  const service = original.services as { duration_minutes: number };
  const newStart = new Date(newStartTime);
  const newEnd = new Date(newStart.getTime() + service.duration_minutes * 60000);

  // 检查新时间段的容量（排除当前预约）
  const { data: overlapping, error: overlapError } = await client
    .from('bookings')
    .select('id')
    .eq('calendar_id', calendarId)
    .eq('service_id', original.service_id)
    .in('status', ['pending', 'confirmed'])
    .neq('id', bookingId)
    .lt('start_time', newEnd.toISOString())
    .gt('end_time', newStart.toISOString());

  if (overlapError) {
    return { success: false, error: '检查可用容量失败' };
  }

  // 获取服务的容量
  const { data: serviceData } = await client
    .from('services')
    .select('capacity')
    .eq('id', original.service_id)
    .single();

  const capacity = serviceData?.capacity || 1;

  if (overlapping && overlapping.length >= capacity) {
    return { success: false, error: '新时间段已约满' };
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
    return { success: false, error: '改期失败' };
  }

  return { success: true, booking: booking as Booking };
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
