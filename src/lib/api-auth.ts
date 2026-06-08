import { getSupabaseClient } from '@/storage/database/supabase-client';
import { headers } from 'next/headers';
import type { User } from '@supabase/supabase-js';

export interface AuthResult {
  userId: string;
  error?: string;
}

/**
 * 验证 API Key 或 Session Token
 * 优先检查 Authorization header 中的 API Key
 * 其次检查 x-session header 中的 session token
 */
export async function authenticate(): Promise<AuthResult> {
  const headersList = await headers();
  const authHeader = headersList.get('authorization') || headersList.get('Authorization');
  const sessionToken = headersList.get('x-session');

  const client = getSupabaseClient();

  // 1. 检查 API Key
  if (authHeader?.startsWith('Bearer ')) {
    const apiKey = authHeader.substring(7);
    
    const { data: keyData, error: keyError } = await client
      .from('api_keys')
      .select('user_id, is_active')
      .eq('key', apiKey)
      .maybeSingle();

    if (keyError) {
      return { userId: '', error: `认证服务错误: ${keyError.message}` };
    }

    if (!keyData) {
      return { userId: '', error: '无效的 API Key' };
    }

    if (!keyData.is_active) {
      return { userId: '', error: 'API Key 已被禁用' };
    }

    // 更新最后使用时间
    await client
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('key', apiKey);

    return { userId: keyData.user_id };
  }

  // 2. 检查 Session Token
  if (sessionToken) {
    const { data: { user }, error } = await client.auth.getUser(sessionToken);
    
    if (error || !user) {
      return { userId: '', error: '无效的会话' };
    }

    return { userId: user.id };
  }

  return { userId: '', error: '缺少认证信息' };
}

/**
 * 获取用户的日历（验证访问权限）
 */
export async function getUserCalendar(userId: string, calendarId: string) {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('calendars')
    .select('*')
    .eq('id', calendarId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return { calendar: null, error: `获取日历失败: ${error.message}` };
  }

  if (!data) {
    return { calendar: null, error: '日历不存在或无权访问' };
  }

  return { calendar: data, error: null };
}

/**
 * 获取用户的服务（验证访问权限）
 */
export async function getUserService(userId: string, serviceId: string) {
  const client = getSupabaseClient();
  
  const { data, error } = await client
    .from('services')
    .select('*, calendars!inner(user_id)')
    .eq('id', serviceId)
    .eq('calendars.user_id', userId)
    .maybeSingle();

  if (error) {
    return { service: null, error: `获取服务失败: ${error.message}` };
  }

  if (!data) {
    return { service: null, error: '服务不存在或无权访问' };
  }

  return { service: data, error: null };
}
