/**
 * 时间偏好解析器
 * 将自然语言时间描述转换为日期范围
 */

export interface TimePreference {
  /** 搜索范围开始（UTC） */
  dateStart: Date;
  /** 搜索范围结束（UTC） */
  dateEnd: Date;
  /** 时段开始小时（如下午=12） */
  hourStart: number;
  /** 时段结束小时（如下午=18） */
  hourEnd: number;
  /** 原始文本 */
  originalText: string;
}

export interface ParseOptions {
  /** 日历时区，默认 Asia/Shanghai */
  timezone?: string;
  /** 参考时间，默认当前时间 */
  now?: Date;
}

/**
 * 解析时间偏好
 * @example
 * parseTimePreference('明天下午') // 明天 12:00-18:00
 * parseTimePreference('下周一上午') // 下周一 06:00-12:00
 * parseTimePreference('1月15日') // 2025-01-15 全天
 */
export function parseTimePreference(
  preference: string,
  options: ParseOptions = {}
): TimePreference {
  const { timezone = 'Asia/Shanghai', now = new Date() } = options;
  
  // 获取当前时间在日历时区下的本地日期
  const localNow = getDateTimeInTimezone(now, timezone);
  const today = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day));
  
  // 默认值
  let dateStart: Date = today;
  let dateEnd: Date = today;
  let hourStart = 0;
  let hourEnd = 24;
  
  const text = preference.toLowerCase().trim();
  
  // 解析日期部分
  const dateResult = parseDatePart(text, localNow, timezone);
  if (dateResult) {
    dateStart = dateResult.start;
    dateEnd = dateResult.end;
  }
  
  // 解析时段部分
  const hourResult = parseHourPart(text);
  if (hourResult) {
    hourStart = hourResult.start;
    hourEnd = hourResult.end;
  }
  
  return {
    dateStart,
    dateEnd,
    hourStart,
    hourEnd,
    originalText: preference,
  };
}

/**
 * 解析日期部分
 */
function parseDatePart(
  text: string,
  localNow: { year: number; month: number; day: number; dayOfWeek: string },
  timezone: string
): { start: Date; end: Date } | null {
  const dayOfWeekMap: Record<string, number> = {
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
    'thursday': 4, 'friday': 5, 'saturday': 6,
    '日': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6,
    '周日': 0, '周一': 1, '周二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6,
    '星期日': 0, '星期一': 1, '星期二': 2, '星期三': 3, '星期四': 4, '星期五': 5, '星期六': 6,
  };
  
  // 获取当前星期几（0-6）
  const currentDayOfWeek = dayOfWeekMap[localNow.dayOfWeek.toLowerCase()] ?? 0;
  
  // 今天
  if (text.includes('今天') || text.includes('今日')) {
    const start = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day));
    return { start, end: start };
  }
  
  // 明天
  if (text.includes('明天') || text.includes('明日')) {
    const start = addDays(Date.UTC(localNow.year, localNow.month - 1, localNow.day), 1);
    return { start, end: start };
  }
  
  // 后天
  if (text.includes('后天') || text.includes('后日')) {
    const start = addDays(Date.UTC(localNow.year, localNow.month - 1, localNow.day), 2);
    return { start, end: start };
  }
  
  // 下周X
  const nextWeekMatch = text.match(/下周([一二三四五六日天])/);
  if (nextWeekMatch) {
    const targetDay = dayOfWeekMap[nextWeekMatch[1]] ?? 1;
    // 下周X = 当前日期 + (7 - 当前星期 + 目标星期)
    let daysToAdd = 7 - currentDayOfWeek + targetDay;
    if (daysToAdd <= 0) daysToAdd += 7;
    const start = addDays(Date.UTC(localNow.year, localNow.month - 1, localNow.day), daysToAdd);
    return { start, end: start };
  }
  
  // 这周X / 本周X
  const thisWeekMatch = text.match(/这?本?周([一二三四五六日天])/);
  if (thisWeekMatch) {
    const targetDay = dayOfWeekMap[thisWeekMatch[1]] ?? 1;
    let daysToAdd = targetDay - currentDayOfWeek;
    if (daysToAdd < 0) daysToAdd += 7; // 如果已过，则为下周
    const start = addDays(Date.UTC(localNow.year, localNow.month - 1, localNow.day), daysToAdd);
    return { start, end: start };
  }
  
  // 具体日期：1月15日 / 1月15号 / 1-15
  const dateMatch = text.match(/(\d{1,2})[月\-\/](\d{1,2})[日号]?/);
  if (dateMatch) {
    const month = parseInt(dateMatch[1]);
    const day = parseInt(dateMatch[2]);
    // 假设当年（如果月份小于当前月，可能是明年）
    let year = localNow.year;
    if (month < localNow.month) {
      year += 1;
    }
    const start = new Date(Date.UTC(year, month - 1, day));
    return { start, end: start };
  }
  
  // YYYY-MM-DD
  const fullDateMatch = text.match(/(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
  if (fullDateMatch) {
    const year = parseInt(fullDateMatch[1]);
    const month = parseInt(fullDateMatch[2]);
    const day = parseInt(fullDateMatch[3]);
    const start = new Date(Date.UTC(year, month - 1, day));
    return { start, end: start };
  }
  
  // X天后
  const daysLaterMatch = text.match(/(\d+)\s*天[以]?后/);
  if (daysLaterMatch) {
    const days = parseInt(daysLaterMatch[1]);
    const start = addDays(Date.UTC(localNow.year, localNow.month - 1, localNow.day), days);
    return { start, end: start };
  }
  
  // 默认：今天
  return null;
}

/**
 * 解析时段部分
 */
function parseHourPart(text: string): { start: number; end: number } | null {
  // 具体时间：3点 / 下午3点 / 15点 / 3:30
  const hourMatch = text.match(/(\d{1,2})[:点时]/);
  const pmMatch = text.includes('下午') || text.includes('pm') || text.includes('晚上') || text.includes('傍晚');
  const amMatch = text.includes('上午') || text.includes('am') || text.includes('早上') || text.includes('早晨');
  
  if (hourMatch) {
    let hour = parseInt(hourMatch[1]);
    // 下午/晚上 + 小时数 < 12 → 加12
    if (pmMatch && hour < 12) {
      hour += 12;
    }
    // 上午 + 小时数 = 12 → 减12（凌晨12点 = 0点）
    if (amMatch && hour === 12) {
      hour = 0;
    }
    return { start: hour, end: hour + 1 };
  }
  
  // 时段关键词
  if (text.includes('凌晨') || text.includes('深夜')) {
    return { start: 0, end: 6 };
  }
  if (text.includes('早晨') || text.includes('早上')) {
    return { start: 6, end: 9 };
  }
  if (text.includes('上午') || text.includes('早上')) {
    return { start: 6, end: 12 };
  }
  if (text.includes('中午')) {
    return { start: 11, end: 14 };
  }
  if (text.includes('下午')) {
    return { start: 12, end: 18 };
  }
  if (text.includes('傍晚') || text.includes('黄昏')) {
    return { start: 17, end: 19 };
  }
  if (text.includes('晚上') || text.includes('晚间') || text.includes('夜晚')) {
    return { start: 18, end: 22 };
  }
  if (text.includes('夜间') || text.includes('夜里')) {
    return { start: 20, end: 24 };
  }
  
  return null;
}

/**
 * 获取指定时区下的本地时间组件
 */
export function getDateTimeInTimezone(date: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: string;
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'long',
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  
  return {
    year: parseInt(get('year')),
    month: parseInt(get('month')),
    day: parseInt(get('day')),
    hour: parseInt(get('hour')),
    minute: parseInt(get('minute')),
    dayOfWeek: get('weekday'),
  };
}

/**
 * 加天数
 */
function addDays(dateMs: number, days: number): Date {
  return new Date(dateMs + days * 24 * 60 * 60 * 1000);
}

/**
 * 将时区本地时间转换为 UTC Date
 */
export function createUTCFromLocalTime(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timezone: string
): Date {
  // 创建一个参考 UTC 时间
  const refUTC = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  
  // 计算时区偏移
  const offset = getTimezoneOffsetMs(refUTC, timezone);
  
  // 实际 UTC = 参考 UTC - 偏移
  return new Date(refUTC.getTime() - offset);
}

/**
 * 获取时区偏移（毫秒）
 */
function getTimezoneOffsetMs(utcDate: Date, timezone: string): number {
  const utcStr = utcDate.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = utcDate.toLocaleString('en-US', { timeZone: timezone });
  return new Date(tzStr).getTime() - new Date(utcStr).getTime();
}
