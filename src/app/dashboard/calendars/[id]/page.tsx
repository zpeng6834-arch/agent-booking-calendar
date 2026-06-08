'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Copy, Check,
  Calendar, Settings, Key, FileText, Users, Clock, Search, X,
  ArrowLeft,
} from 'lucide-react';

// ===================== 类型 =====================

type BusinessHoursConfig = Record<string, { enabled: boolean; slots: { start: string; end: string }[] }>;

interface CalendarType {
  id: string;
  name: string;
  timezone: string;
  default_capacity: number;
  business_hours: BusinessHoursConfig;
  created_at: string;
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  capacity: number;
  description: string;
  is_active: boolean;
  created_at: string;
}

interface Booking {
  id: string;
  service_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  created_at: string;
}

interface ApiKey {
  id: string;
  name: string;
  key: string;
  is_active: boolean;
  created_at: string;
}

// ===================== 常量 =====================

const TIMEZONES = [
  'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore',
  'America/New_York', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris',
];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_LABELS: Record<string, string> = {
  monday: '周一', tuesday: '周二', wednesday: '周三',
  thursday: '周四', friday: '周五', saturday: '周六', sunday: '周日',
};

const SERVICE_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
  'bg-violet-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
];

// ===================== 工具函数 =====================

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'sk_live_';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getMonthDays(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay();
  const offset = startDow === 0 ? 6 : startDow - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = [];
  for (let i = 0; i < offset; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

// ===================== 主页面 =====================

export default function CalendarDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const calId = id as string;

  // 数据
  const [calendar, setCalendar] = useState<CalendarType | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  // 日历视图
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // 预约筛选
  const [filterName, setFilterName] = useState('');
  const [filterContact, setFilterContact] = useState('');
  const [filterService, setFilterService] = useState('all');
  const [filterStartTime, setFilterStartTime] = useState('');
  const [filterEndTime, setFilterEndTime] = useState('');
  const [filterCreatedStart, setFilterCreatedStart] = useState('');
  const [filterCreatedEnd, setFilterCreatedEnd] = useState('');

  // 服务弹窗
  const [svcDialogOpen, setSvcDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [svcSaving, setSvcSaving] = useState(false);
  const [svcError, setSvcError] = useState('');
  const [svcName, setSvcName] = useState('');
  const [svcDesc, setSvcDesc] = useState('');
  const [svcDuration, setSvcDuration] = useState(60);
  const [svcCapacity, setSvcCapacity] = useState(1);
  const [svcActive, setSvcActive] = useState(true);

  // 日历设置弹窗
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [calName, setCalName] = useState('');
  const [calTimezone, setCalTimezone] = useState('Asia/Shanghai');
  const [calCapacity, setCalCapacity] = useState(10);
  const [calHours, setCalHours] = useState<BusinessHoursConfig>({} as BusinessHoursConfig);

  // API Key 弹窗
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [keySaving, setKeySaving] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // 预约弹窗
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [bkServiceId, setBkServiceId] = useState('');
  const [bkCustomerName, setBkCustomerName] = useState('');
  const [bkCustomerEmail, setBkCustomerEmail] = useState('');
  const [bkCustomerPhone, setBkCustomerPhone] = useState('');
  const [bkStartTime, setBkStartTime] = useState('');
  const [bkNotes, setBkNotes] = useState('');

  // 删除确认弹窗
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingBooking, setDeletingBooking] = useState<Booking | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // Schema/Prompt 复制
  const [schemaCopied, setSchemaCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  // ===================== 数据加载 =====================

  const loadData = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    setLoading(true);
    try {
      const [calRes, svcRes, bkRes, keyRes] = await Promise.all([
        supabase.from('calendars').select('*').eq('id', calId).single(),
        supabase.from('services').select('*').eq('calendar_id', calId).order('created_at'),
        supabase.from('bookings').select('*').eq('calendar_id', calId).order('start_time', { ascending: false }),
        supabase.from('api_keys').select('*').eq('calendar_id', calId).order('created_at', { ascending: false }),
      ]);
      if (calRes.data) setCalendar(calRes.data);
      if (svcRes.data) setServices(svcRes.data);
      if (bkRes.data) setBookings(bkRes.data);
      if (keyRes.data) setApiKeys(keyRes.data);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [user, calId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ===================== 预约筛选 =====================

  const filteredBookings = useMemo(() => {
    let result = [...bookings];
    if (filterName.trim()) {
      const q = filterName.trim().toLowerCase();
      result = result.filter(b => b.customer_name.toLowerCase().includes(q));
    }
    if (filterContact.trim()) {
      const q = filterContact.trim().toLowerCase();
      result = result.filter(b =>
        b.customer_email.toLowerCase().includes(q) ||
        (b.customer_phone && b.customer_phone.includes(q))
      );
    }
    if (filterService && filterService !== 'all') {
      result = result.filter(b => b.service_id === filterService);
    }
    if (filterStartTime) {
      result = result.filter(b => new Date(b.start_time) >= new Date(filterStartTime));
    }
    if (filterEndTime) {
      const end = new Date(filterEndTime);
      end.setDate(end.getDate() + 1);
      result = result.filter(b => new Date(b.start_time) < end);
    }
    if (filterCreatedStart) {
      result = result.filter(b => new Date(b.created_at) >= new Date(filterCreatedStart));
    }
    if (filterCreatedEnd) {
      const end = new Date(filterCreatedEnd);
      end.setDate(end.getDate() + 1);
      result = result.filter(b => new Date(b.created_at) < end);
    }
    return result.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  }, [bookings, filterName, filterContact, filterService, filterStartTime, filterEndTime, filterCreatedStart, filterCreatedEnd]);

  const clearFilters = () => {
    setFilterName('');
    setFilterContact('');
    setFilterService('all');
    setFilterStartTime('');
    setFilterEndTime('');
    setFilterCreatedStart('');
    setFilterCreatedEnd('');
  };

  const hasFilters = filterName || filterContact || filterService !== 'all' || filterStartTime || filterEndTime || filterCreatedStart || filterCreatedEnd;

  // ===================== 日历视图 =====================

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const weeks = getMonthDays(year, month);

  const isToday = (d: Date) => {
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };

  const isSelected = (d: Date) => {
    if (!selectedDate) return false;
    return d.getFullYear() === selectedDate.getFullYear() && d.getMonth() === selectedDate.getMonth() && d.getDate() === selectedDate.getDate();
  };

  const getBookingsForDate = (d: Date) => {
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return bookings
      .filter(b => String(b.start_time).startsWith(dateStr))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  };

  const selectedDateBookings = selectedDate ? getBookingsForDate(selectedDate) : [];

  // ===================== 预约管理 =====================

  const openCreateBooking = (defaultStartTime?: string) => {
    setEditingBooking(null);
    setBkServiceId(services.find(s => s.is_active)?.id || '');
    setBkCustomerName('');
    setBkCustomerEmail('');
    setBkCustomerPhone('');
    setBkStartTime(defaultStartTime || '');
    setBkNotes('');
    setBookingError('');
    setBookingDialogOpen(true);
  };

  const openEditBooking = (booking: Booking) => {
    setEditingBooking(booking);
    setBkServiceId(booking.service_id);
    setBkCustomerName(booking.customer_name);
    setBkCustomerEmail(booking.customer_email);
    setBkCustomerPhone(booking.customer_phone || '');
    setBkStartTime(booking.start_time.slice(0, 16));
    setBkNotes(booking.notes || '');
    setBookingError('');
    setBookingDialogOpen(true);
  };

  const saveBooking = async () => {
    if (!user || !bkServiceId || !bkCustomerName || !bkCustomerEmail || !bkStartTime) {
      setBookingError('请填写必填项');
      return;
    }
    setBookingSaving(true);
    setBookingError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const svc = services.find(s => s.id === bkServiceId);
      if (!svc) { setBookingError('服务不存在'); return; }
      const start = new Date(bkStartTime);
      const end = new Date(start.getTime() + svc.duration_minutes * 60000);

      if (editingBooking) {
        const { error } = await supabase.from('bookings').update({
          service_id: bkServiceId,
          customer_name: bkCustomerName,
          customer_email: bkCustomerEmail,
          customer_phone: bkCustomerPhone || null,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          notes: bkNotes || null,
        }).eq('id', editingBooking.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('bookings').insert({
          calendar_id: calId,
          service_id: bkServiceId,
          customer_name: bkCustomerName,
          customer_email: bkCustomerEmail,
          customer_phone: bkCustomerPhone || null,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          status: 'confirmed',
          notes: bkNotes || null,
        });
        if (error) throw error;
      }
      setBookingDialogOpen(false);
      loadData();
    } catch (err: unknown) {
      setBookingError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBookingSaving(false);
    }
  };

  const confirmDeleteBooking = async () => {
    if (!deletingBooking) return;
    setDeleteSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', deletingBooking.id);
      if (error) throw error;
      setDeleteConfirmOpen(false);
      setDeletingBooking(null);
      loadData();
    } catch (err) {
      console.error('Failed to cancel booking:', err);
    } finally {
      setDeleteSaving(false);
    }
  };

  // ===================== 服务管理 =====================

  const openCreateService = () => {
    setEditingService(null);
    setSvcName(''); setSvcDesc(''); setSvcDuration(60); setSvcCapacity(1); setSvcActive(true); setSvcError('');
    setSvcDialogOpen(true);
  };

  const openEditService = (svc: Service) => {
    setEditingService(svc);
    setSvcName(svc.name); setSvcDesc(svc.description); setSvcDuration(svc.duration_minutes);
    setSvcCapacity(svc.capacity); setSvcActive(svc.is_active); setSvcError('');
    setSvcDialogOpen(true);
  };

  const saveService = async () => {
    if (!svcName.trim()) { setSvcError('请输入服务名称'); return; }
    setSvcSaving(true); setSvcError('');
    try {
      const supabase = getSupabaseBrowserClient();
      if (editingService) {
        const { error } = await supabase.from('services').update({
          name: svcName, description: svcDesc, duration_minutes: svcDuration,
          capacity: svcCapacity, is_active: svcActive,
        }).eq('id', editingService.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('services').insert({
          calendar_id: calId, name: svcName, description: svcDesc,
          duration_minutes: svcDuration, capacity: svcCapacity, is_active: svcActive,
        });
        if (error) throw error;
      }
      setSvcDialogOpen(false);
      loadData();
    } catch (err: unknown) {
      setSvcError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSvcSaving(false);
    }
  };

  const deleteService = async (svcId: string) => {
    if (!confirm('确定删除此服务？相关预约也会被删除。')) return;
    const supabase = getSupabaseBrowserClient();
    await supabase.from('services').delete().eq('id', svcId);
    loadData();
  };

  // ===================== 日历设置 =====================

  const openSettings = () => {
    if (!calendar) return;
    setCalName(calendar.name); setCalTimezone(calendar.timezone);
    setCalCapacity(calendar.default_capacity);
    setCalHours(calendar.business_hours || {} as BusinessHoursConfig);
    setSettingsError('');
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    if (!calName.trim()) { setSettingsError('请输入日历名称'); return; }
    setSettingsSaving(true); setSettingsError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from('calendars').update({
        name: calName, timezone: calTimezone, default_capacity: calCapacity, business_hours: calHours,
      }).eq('id', calId);
      if (error) throw error;
      setSettingsOpen(false);
      loadData();
    } catch (err: unknown) {
      setSettingsError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSettingsSaving(false);
    }
  };

  // ===================== API Key =====================

  const createApiKey = async () => {
    if (!keyName.trim()) return;
    setKeySaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const key = generateApiKey();
      const { error } = await supabase.from('api_keys').insert({
        user_id: user!.id, calendar_id: calId, name: keyName, key, is_active: true,
      });
      if (error) throw error;
      setNewKey(key); setKeyName(''); setShowKey(true);
      loadData();
    } catch (err) {
      console.error('Failed to create API key:', err);
    } finally {
      setKeySaving(false);
    }
  };

  const toggleApiKey = async (keyId: string, isActive: boolean) => {
    const supabase = getSupabaseBrowserClient();
    await supabase.from('api_keys').update({ is_active: !isActive }).eq('id', keyId);
    loadData();
  };

  const deleteApiKey = async (keyId: string) => {
    const supabase = getSupabaseBrowserClient();
    await supabase.from('api_keys').delete().eq('id', keyId);
    loadData();
  };

  // ===================== Schema/Prompt =====================

  const openApiSchema = useMemo(() => {
    if (!calendar) return '{}';
    return JSON.stringify({
      openapi: '3.1.0',
      info: { title: `${calendar.name} - 预约 API`, version: '1.0.0' },
      servers: [{ url: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000' }],
      paths: {
        '/api/availability': {
          get: {
            summary: '查询可预约时间',
            parameters: [
              { name: 'calendar_id', in: 'query', required: true, schema: { type: 'string' } },
              { name: 'service_id', in: 'query', required: true, schema: { type: 'string' } },
              { name: 'date', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
              { name: 'days', in: 'query', schema: { type: 'integer', default: 7 } },
            ],
          },
        },
        '/api/bookings': {
          post: {
            summary: '创建预约',
            requestBody: {
              required: true,
              content: { 'application/json': { schema: {
                type: 'object',
                required: ['calendar_id', 'service_id', 'start_time', 'customer_name', 'customer_email'],
                properties: {
                  calendar_id: { type: 'string' },
                  service_id: { type: 'string' },
                  start_time: { type: 'string', format: 'date-time' },
                  customer_name: { type: 'string' },
                  customer_email: { type: 'string', format: 'email' },
                  customer_phone: { type: 'string' },
                  notes: { type: 'string' },
                },
              } } },
            },
          },
        },
        '/api/bookings/{id}': {
          get: { summary: '查询预约详情', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] },
          patch: { summary: '改期预约', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] },
          delete: { summary: '取消预约', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] },
        },
      },
    }, null, 2);
  }, [calendar]);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

  const agentPrompt = useMemo(() => {
    if (!calendar) return '';
    const svcList = services.filter(s => s.is_active).map(s =>
      `- ${s.name}：${s.duration_minutes}分钟，每时段可预约${s.capacity}人，${s.description}`
    ).join('\n');
    return `你是「${calendar.name}」的预约助手。

## 日历信息
- 名称：${calendar.name}
- 时区：${calendar.timezone}
- 同时段总容量：${calendar.default_capacity}人
- 营业时间：每天可能有不同，请通过 API 查询

## 可预约服务
${svcList || '暂无服务'}

## 容量模型
- 日历总容量：同一时段全店最多接待 ${calendar.default_capacity} 人
- 服务容量：每个服务有自己的每时段可预约人数上限
- 预约时两层约束同时生效，任一层满则不可预约

## 可用 API（Base URL: ${apiBaseUrl}）
1. GET ${apiBaseUrl}/api/availability?calendar_id=${calId}&service_id=xxx&date=YYYY-MM-DD&days=N
   → 返回可预约时间段及剩余容量
2. POST ${apiBaseUrl}/api/bookings
   → 创建预约，body 含 calendar_id, service_id, start_time, customer_name, customer_email, customer_phone(可选), notes(可选)
3. GET ${apiBaseUrl}/api/bookings/{id}
   → 查询预约详情
4. PATCH ${apiBaseUrl}/api/bookings/{id}
   → 改期预约，body 含 start_time
5. DELETE ${apiBaseUrl}/api/bookings/{id}
   → 取消预约

## 注意事项
- 创建预约前先查询可用时间
- 预约失败时 API 会返回推荐可选时间
- 同一客户不能在同一时段重复预约同一服务
- 使用 Authorization: Bearer <API_KEY> 认证`;
  }, [calendar, services, calId, apiBaseUrl]);

  const copyToClipboard = async (text: string, setter: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  // ===================== 渲染 =====================

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">加载中...</div>;
  }

  if (!calendar) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">日历不存在</div>;
  }

  return (
    <div className="space-y-6">
      {/* 顶部面包屑 */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/calendars')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{calendar.name}</h1>
          <p className="text-muted-foreground text-sm">
            {calendar.timezone} &middot; 总容量 {calendar.default_capacity} &middot; {services.filter(s => s.is_active).length} 个服务
          </p>
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={openSettings}>
          <Settings className="h-4 w-4 mr-1" /> 设置
        </Button>
      </div>

      {/* Tab 布局 */}
      <Tabs defaultValue="calendar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="calendar"><Calendar className="h-4 w-4 mr-1" />日历视图</TabsTrigger>
          <TabsTrigger value="services"><Users className="h-4 w-4 mr-1" />服务管理</TabsTrigger>
          <TabsTrigger value="bookings"><Clock className="h-4 w-4 mr-1" />预约管理</TabsTrigger>
          <TabsTrigger value="api"><Key className="h-4 w-4 mr-1" />API 集成</TabsTrigger>
        </TabsList>

        {/* ========== 日历视图 ========== */}
        <TabsContent value="calendar">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 月历网格 */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <Button variant="ghost" size="icon" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h3 className="font-semibold text-lg">{year} 年 {month + 1} 月</h3>
                    <Button variant="ghost" size="icon" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-7 mb-1">
                    {['一', '二', '三', '四', '五', '六', '日'].map(d => (
                      <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
                    ))}
                  </div>
                  {weeks.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7">
                      {week.map((day, di) => {
                        if (!day) return <div key={di} className="min-h-[80px] border border-border/50 p-1" />;
                        const dayBookings = getBookingsForDate(day);
                        return (
                          <button
                            key={di}
                            onClick={() => setSelectedDate(day)}
                            className={`min-h-[80px] border border-border/50 p-1 text-left transition-colors hover:bg-muted/50 ${
                              isToday(day) ? 'bg-primary/5' : ''
                            } ${isSelected(day) ? 'ring-2 ring-primary ring-inset' : ''}`}
                          >
                            <div className={`text-xs font-medium mb-1 ${isToday(day) ? 'text-primary' : 'text-foreground'}`}>
                              {day.getDate()}
                            </div>
                            <div className="space-y-0.5 overflow-hidden">
                              {dayBookings.slice(0, 3).map((b, bi) => {
                                const svc = services.find(s => s.id === b.service_id);
                                const svcIdx = services.indexOf(svc!);
                                return (
                                  <div
                                    key={bi}
                                    className={`text-[10px] px-1 py-0.5 rounded truncate text-white ${SERVICE_COLORS[svcIdx % SERVICE_COLORS.length]}`}
                                    title={`${b.customer_name} · ${svc?.name || '服务'}${b.notes ? ' | ' + b.notes : ''}`}
                                  >
                                    {b.customer_name} · {svc?.name || '服务'}
                                  </div>
                                );
                              })}
                              {dayBookings.length > 3 && (
                                <div className="text-[10px] text-muted-foreground">+{dayBookings.length - 3} 更多</div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* 右侧面板 */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{calendar.name}</CardTitle>
                  <CardDescription>时区: {calendar.timezone} | 总容量: {calendar.default_capacity}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {services.filter(s => s.is_active).map((s, i) => (
                      <div key={s.id} className="flex items-center gap-2 text-sm">
                        <div className={`w-2.5 h-2.5 rounded-sm ${SERVICE_COLORS[i % SERVICE_COLORS.length]}`} />
                        <span className="flex-1">{s.name}</span>
                        <span className="text-muted-foreground">{s.duration_minutes}分钟</span>
                        <span className="text-muted-foreground">{s.capacity}人</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {selectedDate ? `${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日 预约` : '点击日期查看预约'}
                    </CardTitle>
                    {selectedDate && (
                      <Button size="sm" variant="outline" onClick={() => {
                        const y = selectedDate.getFullYear();
                        const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
                        const d = String(selectedDate.getDate()).padStart(2, '0');
                        openCreateBooking(`${y}-${m}-${d}T09:00`);
                      }}>
                        <Plus className="h-3.5 w-3.5 mr-1" />新增
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedDate ? (
                    selectedDateBookings.length > 0 ? (
                      <div className="space-y-2">
                        {selectedDateBookings.map(b => {
                          const svc = services.find(s => s.id === b.service_id);
                          const svcIdx = services.indexOf(svc!);
                          return (
                            <div key={b.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm group">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${SERVICE_COLORS[svcIdx % SERVICE_COLORS.length]}`} />
                              <div className="flex-1 min-w-0">
                                <div className={`font-medium truncate ${b.status === 'cancelled' ? 'line-through text-muted-foreground' : ''}`}>
                                  {b.customer_name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(b.start_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                  {' - '}
                                  {svc?.name}
                                </div>
                                {b.notes && (
                                  <div className="text-xs text-muted-foreground/70 truncate mt-0.5 italic" title={b.notes}>
                                    {b.notes}
                                  </div>
                                )}
                              </div>
                              {b.status === 'cancelled' ? (
                                <Badge variant="destructive" className="text-[10px] shrink-0">已取消</Badge>
                              ) : (
                                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditBooking(b)} title="编辑">
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setDeletingBooking(b); setDeleteConfirmOpen(true); }} title="取消预约">
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">当天暂无预约</p>
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">选择左侧日期查看详情</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ========== 服务管理 ========== */}
        <TabsContent value="services">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>服务项目</CardTitle>
                  <CardDescription>管理此日历下的服务，服务容量不能超过日历总容量 ({calendar.default_capacity})</CardDescription>
                </div>
                <Button onClick={openCreateService}><Plus className="h-4 w-4 mr-1" />添加服务</Button>
              </div>
            </CardHeader>
            <CardContent>
              {services.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">暂无服务，点击上方按钮添加</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>服务名称</TableHead>
                      <TableHead>时长</TableHead>
                      <TableHead>每时段可预约人数</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services.map(svc => (
                      <TableRow key={svc.id}>
                        <TableCell>
                          <div className="font-medium">{svc.name}</div>
                          {svc.description && <div className="text-xs text-muted-foreground">{svc.description}</div>}
                        </TableCell>
                        <TableCell>{svc.duration_minutes} 分钟</TableCell>
                        <TableCell>{svc.capacity} 人</TableCell>
                        <TableCell>
                          <Badge variant={svc.is_active ? 'default' : 'secondary'}>
                            {svc.is_active ? '启用' : '停用'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditService(svc)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteService(svc.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== 预约管理 ========== */}
        <TabsContent value="bookings">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>预约记录</CardTitle>
                  <CardDescription>共 {filteredBookings.length} 条记录</CardDescription>
                </div>
                <Button onClick={() => openCreateBooking()}><Plus className="h-4 w-4 mr-1" />新增预约</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 筛选区 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Search className="h-4 w-4" /> 筛选
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">客户姓名</Label>
                    <Input placeholder="搜索姓名" value={filterName} onChange={e => setFilterName(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">联系方式</Label>
                    <Input placeholder="邮箱/电话" value={filterContact} onChange={e => setFilterContact(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">服务类型</Label>
                    <Select value={filterService} onValueChange={setFilterService}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="全部服务" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部服务</SelectItem>
                        {services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    {hasFilters && (
                      <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
                        <X className="h-3 w-3 mr-1" />清除筛选
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">预约时间 起</Label>
                    <Input type="date" value={filterStartTime} onChange={e => setFilterStartTime(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">预约时间 止</Label>
                    <Input type="date" value={filterEndTime} onChange={e => setFilterEndTime(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">创建时间 起</Label>
                    <Input type="date" value={filterCreatedStart} onChange={e => setFilterCreatedStart(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">创建时间 止</Label>
                    <Input type="date" value={filterCreatedEnd} onChange={e => setFilterCreatedEnd(e.target.value)} className="h-8 text-sm" />
                  </div>
                </div>
              </div>

              {/* 表格 */}
              {filteredBookings.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">暂无预约记录</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>客户</TableHead>
                        <TableHead>联系方式</TableHead>
                        <TableHead>服务</TableHead>
                        <TableHead>预约时间</TableHead>
                        <TableHead>备注</TableHead>
                        <TableHead>创建时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBookings.map(bk => {
                        const svc = services.find(s => s.id === bk.service_id);
                        return (
                          <TableRow key={bk.id} className={bk.status === 'cancelled' ? 'opacity-50' : ''}>
                            <TableCell>
                              <div className={`font-medium ${bk.status === 'cancelled' ? 'line-through' : ''}`}>{bk.customer_name}</div>
                              {bk.status === 'cancelled' && <Badge variant="destructive" className="text-[10px] mt-0.5">已取消</Badge>}
                            </TableCell>
                            <TableCell>
                              <div className="text-xs">{bk.customer_email}</div>
                              {bk.customer_phone && <div className="text-xs text-muted-foreground">{bk.customer_phone}</div>}
                            </TableCell>
                            <TableCell>{svc?.name || '-'}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{formatTime(bk.start_time)}</TableCell>
                            <TableCell className="max-w-[120px] truncate text-xs text-muted-foreground">{bk.notes || '-'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatTime(bk.created_at)}</TableCell>
                            <TableCell className="text-right">
                              {bk.status !== 'cancelled' && (
                                <div className="flex justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEditBooking(bk)} title="编辑">
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => { setDeletingBooking(bk); setDeleteConfirmOpen(true); }} title="取消预约">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== API 集成 ========== */}
        <TabsContent value="api">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* API Keys */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>API 密钥</CardTitle>
                    <CardDescription>用于 AI Agent 调用预约 API</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => { setKeyDialogOpen(true); setNewKey(null); setShowKey(false); }}>
                    <Plus className="h-3.5 w-3.5 mr-1" />创建
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {newKey && (
                  <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
                    <p className="text-sm font-medium text-emerald-700">新密钥已创建</p>
                    <p className="text-xs text-muted-foreground mt-1">请立即复制，关闭后无法再次查看</p>
                    <div className="flex items-center gap-2 mt-2">
                      <code className="text-xs bg-background px-2 py-1 rounded flex-1 break-all">{newKey}</code>
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(newKey, setKeyCopied)}>
                        {keyCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                )}
                {apiKeys.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4 text-sm">暂无密钥</p>
                ) : (
                  <div className="space-y-2">
                    {apiKeys.map(k => (
                      <div key={k.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm">
                        <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{k.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {showKey ? k.key : k.key.slice(0, 12) + '...' + k.key.slice(-4)}
                            {' '}&middot; {formatTime(k.created_at)}
                          </div>
                        </div>
                        <Badge variant={k.is_active ? 'default' : 'secondary'}>{k.is_active ? '启用' : '禁用'}</Badge>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleApiKey(k.id, k.is_active)}>
                          {k.is_active ? <X className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteApiKey(k.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Schema & Prompt */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">OpenAPI Schema</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(openApiSchema, setSchemaCopied)}>
                      {schemaCopied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                      复制
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted/50 p-3 rounded-md overflow-auto max-h-[250px] whitespace-pre-wrap">{openApiSchema}</pre>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Agent Prompt</CardTitle>
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(agentPrompt, setPromptCopied)}>
                      {promptCopied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                      复制
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted/50 p-3 rounded-md overflow-auto max-h-[250px] whitespace-pre-wrap">{agentPrompt}</pre>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ========== 预约弹窗 ========== */}
      <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBooking ? '编辑预约' : '新增预约'}</DialogTitle>
            <DialogDescription>
              {editingBooking ? '修改预约信息' : '为客户创建新的预约'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>服务 *</Label>
              <Select value={bkServiceId} onValueChange={setBkServiceId}>
                <SelectTrigger><SelectValue placeholder="选择服务" /></SelectTrigger>
                <SelectContent>
                  {services.filter(s => s.is_active).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.duration_minutes}分钟)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>客户姓名 *</Label>
              <Input value={bkCustomerName} onChange={e => setBkCustomerName(e.target.value)} placeholder="客户姓名" />
            </div>
            <div>
              <Label>客户邮箱 *</Label>
              <Input type="email" value={bkCustomerEmail} onChange={e => setBkCustomerEmail(e.target.value)} placeholder="email@example.com" />
            </div>
            <div>
              <Label>客户电话</Label>
              <Input value={bkCustomerPhone} onChange={e => setBkCustomerPhone(e.target.value)} placeholder="选填" />
            </div>
            <div>
              <Label>预约开始时间 *</Label>
              <Input type="datetime-local" value={bkStartTime} onChange={e => setBkStartTime(e.target.value)} />
            </div>
            <div>
              <Label>备注</Label>
              <Textarea value={bkNotes} onChange={e => setBkNotes(e.target.value)} placeholder="选填" rows={2} />
            </div>
            {bookingError && <p className="text-sm text-destructive">{bookingError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingDialogOpen(false)}>取消</Button>
            <Button onClick={saveBooking} disabled={bookingSaving}>
              {bookingSaving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== 删除确认弹窗 ========== */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>取消预约</DialogTitle>
            <DialogDescription>
              确定要取消 {deletingBooking?.customer_name} 的预约吗？此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>返回</Button>
            <Button variant="destructive" onClick={confirmDeleteBooking} disabled={deleteSaving}>
              {deleteSaving ? '取消中...' : '确认取消'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== 服务弹窗 ========== */}
      <Dialog open={svcDialogOpen} onOpenChange={setSvcDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingService ? '编辑服务' : '添加服务'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>服务名称 *</Label>
              <Input value={svcName} onChange={e => setSvcName(e.target.value)} placeholder="如：中医推拿" />
            </div>
            <div>
              <Label>描述</Label>
              <Input value={svcDesc} onChange={e => setSvcDesc(e.target.value)} placeholder="服务说明" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>时长（分钟）</Label>
                <Input type="number" value={svcDuration} onChange={e => setSvcDuration(Number(e.target.value))} min={5} />
              </div>
              <div>
                <Label>每时段可预约人数</Label>
                <Input type="number" value={svcCapacity} onChange={e => setSvcCapacity(Number(e.target.value))} min={1} max={calendar.default_capacity} />
                <p className="text-xs text-muted-foreground mt-1">1 = 一对一，不能超过日历总容量 ({calendar.default_capacity})</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={svcActive} onCheckedChange={setSvcActive} />
              <Label>启用服务</Label>
            </div>
            {svcError && <p className="text-sm text-destructive">{svcError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSvcDialogOpen(false)}>取消</Button>
            <Button onClick={saveService} disabled={svcSaving}>{svcSaving ? '保存中...' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== 日历设置弹窗 ========== */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>日历设置</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <Label>日历名称 *</Label>
              <Input value={calName} onChange={e => setCalName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>时区</Label>
                <Select value={calTimezone} onValueChange={setCalTimezone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>同时段总容量</Label>
                <Input type="number" value={calCapacity} onChange={e => setCalCapacity(Number(e.target.value))} min={1} />
                <p className="text-xs text-muted-foreground mt-1">同一时段全店最多接待客户数</p>
              </div>
            </div>
            <div>
              <Label>营业时间</Label>
              <div className="space-y-2 mt-2">
                {DAYS.map(day => {
                  const dayConfig = calHours[day] || { enabled: true, slots: [{ start: '09:00', end: '18:00' }] };
                  return (
                    <div key={day} className="flex items-center gap-3">
                      <span className="w-8 text-sm font-medium">{DAY_LABELS[day]}</span>
                      <Switch
                        checked={dayConfig.enabled}
                        onCheckedChange={v => setCalHours({ ...calHours, [day]: { ...dayConfig, enabled: v } })}
                      />
                      {dayConfig.enabled && dayConfig.slots[0] && (
                        <div className="flex items-center gap-1">
                          <Input
                            type="time" value={dayConfig.slots[0].start} className="h-8 w-28 text-sm"
                            onChange={e => setCalHours({
                              ...calHours,
                              [day]: { ...dayConfig, slots: [{ ...dayConfig.slots[0], start: e.target.value }] },
                            })}
                          />
                          <span className="text-xs text-muted-foreground">至</span>
                          <Input
                            type="time" value={dayConfig.slots[0].end} className="h-8 w-28 text-sm"
                            onChange={e => setCalHours({
                              ...calHours,
                              [day]: { ...dayConfig, slots: [{ ...dayConfig.slots[0], end: e.target.value }] },
                            })}
                          />
                        </div>
                      )}
                      {dayConfig.enabled && !dayConfig.slots?.[0] && (
                        <span className="text-xs text-muted-foreground">未设置时间</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {settingsError && <p className="text-sm text-destructive">{settingsError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>取消</Button>
            <Button onClick={saveSettings} disabled={settingsSaving}>{settingsSaving ? '保存中...' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== API Key 弹窗 ========== */}
      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>创建 API 密钥</DialogTitle>
            <DialogDescription>为 AI Agent 创建一个用于调用预约 API 的密钥</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>密钥名称</Label>
              <Input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="如：生产环境" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKeyDialogOpen(false)}>取消</Button>
            <Button onClick={createApiKey} disabled={keySaving || !keyName.trim()}>
              {keySaving ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
