'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Calendar as CalendarIcon,
  Plus,
  Edit,
  Trash2,
  Loader2,
  Clock,
  Users,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  ArrowLeft,
  CalendarDays,
  Briefcase,
  FileCode,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { Calendar as CalendarType, Service, Booking, ApiKey, BusinessHoursConfig } from '@/storage/database/shared/schema';

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

function getServiceSlotsForDate(services: Service[], date: Date): { service: Service; color: string }[] {
  const dow = DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1];
  return services
    .filter(s => s.is_active)
    .map((s, i) => ({ service: s, color: SERVICE_COLORS[i % SERVICE_COLORS.length] }));
}

// ===================== 日历视图组件 =====================

function CalendarView({ calendar, services, bookings }: {
  calendar: CalendarType;
  services: Service[];
  bookings: Booking[];
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const weeks = getMonthDays(year, month);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 月历网格 */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="font-semibold text-lg">
                {year} 年 {month + 1} 月
              </h3>
              <Button variant="ghost" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* 星期头 */}
            <div className="grid grid-cols-7 mb-1">
              {['一', '二', '三', '四', '五', '六', '日'].map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
                  {d}
                </div>
              ))}
            </div>
            {/* 日期格子 */}
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7">
                {week.map((day, di) => {
                  if (!day) return <div key={di} className="min-h-[80px] border border-border/50 p-1" />;
                  const dayBookings = getBookingsForDate(day);
                  const dayServices = getServiceSlotsForDate(services, day);
                  return (
                    <button
                      key={di}
                      onClick={() => setSelectedDate(day)}
                      className={`min-h-[80px] border border-border/50 p-1 text-left transition-colors hover:bg-muted/50 ${
                        isToday(day) ? 'bg-primary/5' : ''
                      } ${isSelected(day) ? 'ring-2 ring-primary ring-inset' : ''}`}
                    >
                      <div className={`text-xs font-medium mb-1 ${
                        isToday(day) ? 'text-primary' : 'text-foreground'
                      }`}>
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
                            >
                              {b.customer_name} · {svc?.name || '服务'}
                            </div>
                          );
                        })}
                        {dayBookings.length > 3 && (
                          <div className="text-[10px] text-muted-foreground">
                            +{dayBookings.length - 3} 更多
                          </div>
                        )}
                        {dayBookings.length === 0 && dayServices.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-0.5">
                            {dayServices.slice(0, 4).map((s, si) => (
                              <div key={si} className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                            ))}
                          </div>
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
        {/* 日历信息 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{calendar.name}</CardTitle>
            <CardDescription>
              时区: {calendar.timezone} | 总容量: {calendar.default_capacity}
            </CardDescription>
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

        {/* 选中日期的预约 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {selectedDate
                ? `${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日 预约`
                : '点击日期查看预约'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDate ? (
              selectedDateBookings.length > 0 ? (
                <div className="space-y-2">
                  {selectedDateBookings.map(b => {
                    const svc = services.find(s => s.id === b.service_id);
                    const svcIdx = services.indexOf(svc!);
                    return (
                      <div key={b.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm">
                        <div className={`w-2 h-2 rounded-full ${SERVICE_COLORS[svcIdx % SERVICE_COLORS.length]}`} />
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium truncate ${b.status === 'cancelled' ? 'line-through text-muted-foreground' : ''}`}>{b.customer_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(b.start_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                            {' - '}
                            {svc?.name}
                          </div>
                        </div>
                        {b.status === 'cancelled' && (
                          <Badge variant="destructive" className="text-[10px]">已取消</Badge>
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
  );
}

// ===================== 主页面 =====================

export default function CalendarDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();

  // 数据
  const [calendar, setCalendar] = useState<CalendarType | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  // 预约筛选
  const [filterName, setFilterName] = useState('');
  const [filterContact, setFilterContact] = useState('');
  const [filterService, setFilterService] = useState('all');
  const [filterStartTime, setFilterStartTime] = useState('');
  const [filterEndTime, setFilterEndTime] = useState('');
  const [filterCreatedStart, setFilterCreatedStart] = useState('');
  const [filterCreatedEnd, setFilterCreatedEnd] = useState('');

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

  // Schema/Prompt 复制
  const [schemaCopied, setSchemaCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  // 加载数据
  const loadData = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      const { data: cal } = await supabase.from('calendars').select('*').eq('id', id).single();
      if (cal) {
        setCalendar(cal as CalendarType);
        setCalName(cal.name);
        setCalTimezone(cal.timezone);
        setCalCapacity(cal.default_capacity);
        setCalHours((cal as CalendarType).business_hours as BusinessHoursConfig);
      }
      const { data: svc } = await supabase.from('services').select('*').eq('calendar_id', id).order('created_at', { ascending: true });
      setServices((svc as Service[]) || []);
      const { data: bk } = await supabase.from('bookings').select('*').eq('calendar_id', id).order('start_time', { ascending: false });
      setBookings((bk as Booking[]) || []);
      const { data: keys } = await supabase.from('api_keys').select('*').eq('calendar_id', id).order('created_at', { ascending: false });
      setApiKeys((keys as ApiKey[]) || []);
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  useEffect(() => { loadData(); }, [loadData]);

  // ---- 日历设置 ----
  const saveSettings = async () => {
    if (!calendar) return;
    setSettingsSaving(true);
    setSettingsError('');
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      const { error } = await supabase.from('calendars').update({
        name: calName,
        timezone: calTimezone,
        default_capacity: calCapacity,
        business_hours: calHours,
      }).eq('id', calendar.id);
      if (error) throw error;
      setSettingsOpen(false);
      await loadData();
    } catch (e: unknown) {
      setSettingsError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSettingsSaving(false);
    }
  };

  // ---- 服务 CRUD ----
  const resetSvcForm = () => {
    setSvcName(''); setSvcDesc(''); setSvcDuration(60); setSvcCapacity(1); setSvcActive(true);
    setEditingService(null); setSvcError('');
  };

  const openEditService = (s: Service) => {
    setEditingService(s);
    setSvcName(s.name); setSvcDesc(s.description || ''); setSvcDuration(s.duration_minutes);
    setSvcCapacity(s.capacity); setSvcActive(s.is_active);
    setSvcError('');
    setSvcDialogOpen(true);
  };

  const saveService = async () => {
    if (!id) return;
    setSvcSaving(true); setSvcError('');
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      const payload = {
        name: svcName,
        description: svcDesc,
        calendar_id: id as string,
        duration_minutes: svcDuration,
        capacity: svcCapacity,
        is_active: svcActive,
      };
      if (editingService) {
        const { error } = await supabase.from('services').update(payload).eq('id', editingService.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('services').insert(payload);
        if (error) throw error;
      }
      setSvcDialogOpen(false);
      resetSvcForm();
      await loadData();
    } catch (e: unknown) {
      setSvcError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSvcSaving(false);
    }
  };

  const deleteService = async (sId: string) => {
    if (!confirm('确认删除此服务？相关预约不受影响。')) return;
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      await supabase.from('services').delete().eq('id', sId);
      await loadData();
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  // ---- API Key ----
  const createApiKey = async () => {
    if (!user || !id) return;
    setKeySaving(true);
    try {
      const key = generateApiKey();
      const supabase = await getSupabaseBrowserClientWithRetry();
      const { error } = await supabase.from('api_keys').insert({
        name: keyName || '默认密钥',
        key,
        user_id: user.id,
        calendar_id: id as string,
        is_active: true,
      });
      if (error) throw error;
      setNewKey(key);
      setKeyName('');
      await loadData();
    } catch (e) {
      console.error('Create key failed:', e);
    } finally {
      setKeySaving(false);
    }
  };

  const toggleKey = async (k: ApiKey) => {
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      await supabase.from('api_keys').update({ is_active: !k.is_active }).eq('id', k.id);
      await loadData();
    } catch (e) {
      console.error('Toggle key failed:', e);
    }
  };

  const deleteKey = async (kId: string) => {
    if (!confirm('确认删除此密钥？')) return;
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      await supabase.from('api_keys').delete().eq('id', kId);
      await loadData();
    } catch (e) {
      console.error('Delete key failed:', e);
    }
  };

  // ---- 生成 OpenAPI Schema ----
  const generateOpenApiSchema = (): string => {
    const domain = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';
    const servicesDesc = services.filter(s => s.is_active).map(s =>
      `    - ${s.name}: 时长${s.duration_minutes}分钟, 每时段${s.capacity}人`
    ).join('\n');
    return JSON.stringify({
      openapi: '3.1.0',
      info: {
        title: `${calendar?.name || '预约日历'} API`,
        version: '1.0.0',
        description: `为 AI Agent 提供的预约 API。日历总容量: ${calendar?.default_capacity}人/时段。\n可用服务:\n${servicesDesc}`,
      },
      servers: [{ url: domain }],
      paths: {
        '/api/availability': {
          get: {
            summary: '查询可预约时间',
            description: '查询指定日历和服务的可用时段，返回每日剩余容量（服务级和日历级）',
            parameters: [
              { name: 'calendar_id', in: 'query', required: true, schema: { type: 'string' }, description: '日历ID' },
              { name: 'service_id', in: 'query', required: true, schema: { type: 'string' }, description: '服务ID' },
              { name: 'date', in: 'query', required: true, schema: { type: 'string', format: 'date' }, description: '查询日期 YYYY-MM-DD' },
            ],
            responses: {
              '200': {
                description: '可预约时段列表',
                content: { 'application/json': { schema: { type: 'object', properties: {
                  slots: { type: 'array', items: { type: 'object', properties: {
                    start_time: { type: 'string' },
                    end_time: { type: 'string' },
                    available: { type: 'boolean' },
                    remaining_service_capacity: { type: 'number' },
                    remaining_calendar_capacity: { type: 'number' },
                  }}},
                }}},
              },
            },
          },
        },
        '/api/bookings': {
          post: {
            summary: '创建预约',
            description: '创建预约时系统会校验服务容量和日历总容量，防止超卖。预约失败时返回推荐可选时间。',
            requestBody: {
              required: true,
              content: { 'application/json': { schema: { type: 'object', required: ['calendar_id', 'service_id', 'start_time', 'customer_name', 'customer_email'], properties: {
                calendar_id: { type: 'string' },
                service_id: { type: 'string' },
                start_time: { type: 'string', format: 'date-time', description: '预约开始时间 (ISO 8601)' },
                customer_name: { type: 'string' },
                customer_email: { type: 'string', format: 'email' },
                customer_phone: { type: 'string' },
                notes: { type: 'string' },
              }}}}},
            },
            responses: {
              '200': { description: '预约结果', content: { 'application/json': { schema: { type: 'object', properties: {
                success: { type: 'boolean' },
                booking: { type: 'object' },
                error: { type: 'string' },
                fail_reason: { type: 'string', enum: ['service_full', 'calendar_full'] },
                suggested_slots: { type: 'array', items: { type: 'object' } },
              }}}}},
            },
          },
        },
        '/api/bookings/{id}': {
          get: { summary: '查询预约详情', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] },
          patch: {
            summary: '改期预约',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            requestBody: { content: { 'application/json': { schema: { type: 'object', properties: {
              start_time: { type: 'string', format: 'date-time' },
            }}}}},
          },
          delete: { summary: '取消预约', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }] },
        },
      },
    }, null, 2);
  };

  // ---- 生成 Agent Prompt ----
  const generateAgentPrompt = (): string => {
    const svcList = services.filter(s => s.is_active).map(s =>
      `  - ID: ${s.id} | ${s.name} | 时长${s.duration_minutes}分钟 | 每时段${s.capacity}人`
    ).join('\n');
    const hours = calendar?.business_hours as BusinessHoursConfig | undefined;
    const hoursDesc = hours
      ? DAYS.filter(d => hours[d]?.enabled).map(d => {
          const slots = hours[d].slots;
          const slotStr = slots.length > 0 ? slots.map(s => `${s.start}-${s.end}`).join(', ') : '未设置';
          return `${DAY_LABELS[d]} ${slotStr}`;
        }).join('、')
      : '请查看日历设置';

    return `# 预约助手 Agent Prompt

你是一个预约助手，帮助客户完成预约。请严格按照以下规则操作。

## 日历信息
- 日历名称: ${calendar?.name}
- 日历ID: ${calendar?.id}
- 时区: ${calendar?.timezone}
- 营业时间: ${hoursDesc}
- 同时段总容量: ${calendar?.default_capacity}人（全店同一时段最多接待的客户总数）

## 可用服务
${svcList}

## 容量规则（双层校验）
1. **服务容量**: 每个服务有独立的每时段可预约人数上限（如按摩5人）
2. **日历总容量**: 全店同时段总接待人数上限（如总共10个技师=10人）
3. **两层同时生效**: 即使服务还有余量，如果日历总容量已满，也不能预约

## 操作流程
1. 先询问客户需要什么服务
2. 调用 GET /api/availability 查询可预约时间，参数: calendar_id, service_id, date
3. 向客户展示可选时段
4. 客户选择后，调用 POST /api/bookings 创建预约
5. 如果创建失败（容量已满），系统会返回 fail_reason 和推荐时间 suggested_slots

## 创建预约参数
- calendar_id: "${calendar?.id}"
- service_id: 从可用服务中选择
- start_time: ISO 8601 格式，如 "2024-01-15T10:00:00+08:00"
- customer_name: 客户姓名
- customer_email: 客户邮箱
- customer_phone: 客户电话（可选）
- notes: 备注（可选）

## 改期和取消
- 改期: PATCH /api/bookings/{id}，body: { "start_time": "新时间" }
- 取消: DELETE /api/bookings/{id}

## 注意事项
- 始终先查 availability 再创建预约，不要盲目创建
- 如果客户想要的时间不可用，主动推荐 suggested_slots 中的时间
- 预约时间必须在营业时间内`;
  };

  // ---- 复制功能 ----
  const copyText = async (text: string, setter: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  // ---- 加载中 ----
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!calendar) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">日历不存在或已被删除</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/dashboard/calendars')}>
          返回日历列表
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/calendars')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{calendar.name}</h1>
            <p className="text-sm text-muted-foreground">
              {calendar.timezone} · 总容量 {calendar.default_capacity}人/时段 · {services.filter(s => s.is_active).length} 项服务
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setSettingsOpen(true)}>
          <Settings className="h-4 w-4 mr-2" />
          日历设置
        </Button>
      </div>

      {/* Tab 主体 */}
      <Tabs defaultValue="calendar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="calendar" className="gap-2">
            <CalendarDays className="h-4 w-4" />
            日历视图
          </TabsTrigger>
          <TabsTrigger value="services" className="gap-2">
            <Briefcase className="h-4 w-4" />
            服务管理
          </TabsTrigger>
          <TabsTrigger value="bookings" className="gap-2">
            <CalendarIcon className="h-4 w-4" />
            预约列表
          </TabsTrigger>
          <TabsTrigger value="integration" className="gap-2">
            <Key className="h-4 w-4" />
            API 集成
          </TabsTrigger>
        </TabsList>

        {/* ========== 日历视图 ========== */}
        <TabsContent value="calendar">
          <CalendarView calendar={calendar} services={services} bookings={bookings} />
        </TabsContent>

        {/* ========== 服务管理 ========== */}
        <TabsContent value="services">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">服务项目</h2>
                <p className="text-sm text-muted-foreground">
                  管理此日历下的服务。每项服务的容量不能超过日历总容量（{calendar.default_capacity}人）。
                </p>
              </div>
              <Button onClick={() => { resetSvcForm(); setSvcDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                添加服务
              </Button>
            </div>

            {services.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <h3 className="mt-4 font-medium">还没有服务项目</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    添加服务后，日历视图和 API 才能正常使用
                  </p>
                  <Button className="mt-4" onClick={() => { resetSvcForm(); setSvcDialogOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    添加第一个服务
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {services.map((s, i) => (
                  <Card key={s.id} className={!s.is_active ? 'opacity-60' : ''}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-sm ${SERVICE_COLORS[i % SERVICE_COLORS.length]}`} />
                          <CardTitle className="text-base">{s.name}</CardTitle>
                        </div>
                        <Badge variant={s.is_active ? 'default' : 'secondary'}>
                          {s.is_active ? '启用' : '停用'}
                        </Badge>
                      </div>
                      {s.description && <CardDescription className="mt-1">{s.description}</CardDescription>}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {s.duration_minutes}分钟
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {s.capacity}人/时段
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button variant="outline" size="sm" onClick={() => openEditService(s)}>
                          <Edit className="h-3.5 w-3.5 mr-1" />
                          编辑
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => deleteService(s.id)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          删除
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ========== 预约列表 ========== */}
        <TabsContent value="bookings">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">预约记录</h2>
              <Badge variant="outline">{filteredBookings.length} 条记录</Badge>
            </div>

            {/* 筛选区 */}
            <Card>
              <CardContent className="py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">客户姓名</Label>
                    <Input
                      placeholder="搜索姓名"
                      value={filterName}
                      onChange={e => setFilterName(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">联系方式</Label>
                    <Input
                      placeholder="邮箱或电话"
                      value={filterContact}
                      onChange={e => setFilterContact(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">服务类型</Label>
                    <Select value={filterService} onValueChange={setFilterService}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="全部服务" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部服务</SelectItem>
                        {services.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">预约时间（起）</Label>
                    <Input
                      type="date"
                      value={filterStartTime}
                      onChange={e => setFilterStartTime(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">预约时间（止）</Label>
                    <Input
                      type="date"
                      value={filterEndTime}
                      onChange={e => setFilterEndTime(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mt-3">
                  <div className="space-y-1">
                    <Label className="text-xs">记录创建时间（起）</Label>
                    <Input
                      type="date"
                      value={filterCreatedStart}
                      onChange={e => setFilterCreatedStart(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">记录创建时间（止）</Label>
                    <Input
                      type="date"
                      value={filterCreatedEnd}
                      onChange={e => setFilterCreatedEnd(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button variant="outline" size="sm" onClick={clearFilters} className="h-8">
                      清除筛选
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {filteredBookings.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CalendarIcon className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <h3 className="mt-4 font-medium">暂无预约记录</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {bookings.length === 0 ? '通过 API 创建的预约会显示在这里' : '没有匹配筛选条件的记录'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>客户</TableHead>
                        <TableHead>联系方式</TableHead>
                        <TableHead>服务</TableHead>
                        <TableHead>预约时间</TableHead>
                        <TableHead>记录创建时间</TableHead>
                        <TableHead>备注</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBookings.map(b => {
                        const svc = services.find(s => s.id === b.service_id);
                        const isCancelled = b.status === 'cancelled';
                        return (
                          <TableRow key={b.id} className={isCancelled ? 'opacity-50' : ''}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="font-medium">{b.customer_name}</div>
                                {isCancelled && (
                                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">已取消</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{b.customer_email}</div>
                              {b.customer_phone && <div className="text-xs text-muted-foreground">{b.customer_phone}</div>}
                            </TableCell>
                            <TableCell>{svc?.name || '-'}</TableCell>
                            <TableCell className="text-sm">
                              <div>{formatTime(String(b.start_time))}</div>
                              <div className="text-xs text-muted-foreground">
                                至 {formatTime(String(b.end_time))}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatTime(String(b.created_at))}</TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">{b.notes || '-'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ========== API 集成 ========== */}
        <TabsContent value="integration">
          <div className="space-y-6">
            {/* API Key 管理 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Key className="h-5 w-5" />
                      API 密钥
                    </CardTitle>
                    <CardDescription className="mt-1">
                      此日历的 API 密钥。Agent 使用密钥调用预约 API。
                    </CardDescription>
                  </div>
                  <Button onClick={() => { setKeyName(''); setNewKey(null); setShowKey(false); setKeyDialogOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    创建密钥
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {apiKeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    还没有 API 密钥，创建一个供 Agent 使用
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>密钥</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>创建时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {apiKeys.map(k => (
                        <TableRow key={k.id}>
                          <TableCell className="font-medium">{k.name}</TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                              sk_live_{'*'.repeat(16)}{(k.key as string).slice(-8)}
                            </code>
                          </TableCell>
                          <TableCell>
                            <Badge variant={k.is_active ? 'default' : 'secondary'}>
                              {k.is_active ? '启用' : '已禁用'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{formatTime(String(k.created_at))}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => toggleKey(k)}>
                                {k.is_active ? '禁用' : '启用'}
                              </Button>
                              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteKey(k.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* OpenAPI Schema */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileCode className="h-5 w-5" />
                      OpenAPI Schema
                    </CardTitle>
                    <CardDescription className="mt-1">
                      基于此日历和服务的 OpenAPI 3.1 规范，Agent 可直接导入使用
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => copyText(generateOpenApiSchema(), setSchemaCopied)}>
                    {schemaCopied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                    {schemaCopied ? '已复制' : '复制'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-96">
                  {generateOpenApiSchema()}
                </pre>
              </CardContent>
            </Card>

            {/* Agent Prompt */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Agent Prompt
                    </CardTitle>
                    <CardDescription className="mt-1">
                      基于此日历生成的 AI Agent 系统提示词，包含所有服务和容量规则
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => copyText(generateAgentPrompt(), setPromptCopied)}>
                    {promptCopied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                    {promptCopied ? '已复制' : '复制'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-96 whitespace-pre-wrap">
                  {generateAgentPrompt()}
                </pre>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ===== 服务弹窗 ===== */}
      <Dialog open={svcDialogOpen} onOpenChange={(open) => { if (!open) resetSvcForm(); setSvcDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingService ? '编辑服务' : '添加服务'}</DialogTitle>
            <DialogDescription>
              服务的每时段可预约人数不能超过日历总容量（{calendar?.default_capacity}人）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>服务名称</Label>
              <Input value={svcName} onChange={e => setSvcName(e.target.value)} placeholder="如：全身按摩" />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea value={svcDesc} onChange={e => setSvcDesc(e.target.value)} placeholder="服务描述（可选）" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>时长（分钟）</Label>
                <Input type="number" value={svcDuration} onChange={e => setSvcDuration(Number(e.target.value))} min={5} step={5} />
              </div>
              <div className="space-y-2">
                <Label>每时段可预约人数</Label>
                <Input type="number" value={svcCapacity} onChange={e => setSvcCapacity(Number(e.target.value))} min={1} max={calendar?.default_capacity || 100} />
                <p className="text-xs text-muted-foreground">同一时段此服务最多接待的客户数</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={svcActive} onCheckedChange={setSvcActive} />
              <Label>启用此服务</Label>
            </div>
            {svcError && <p className="text-sm text-destructive">{svcError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSvcDialogOpen(false); resetSvcForm(); }}>取消</Button>
            <Button onClick={saveService} disabled={!svcName || svcSaving}>
              {svcSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingService ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 日历设置弹窗 ===== */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>日历设置</DialogTitle>
            <DialogDescription>修改日历的基本信息和营业时间</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>日历名称</Label>
              <Input value={calName} onChange={e => setCalName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>时区</Label>
                <Select value={calTimezone} onValueChange={setCalTimezone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>同时段总容量</Label>
                <Input type="number" value={calCapacity} onChange={e => setCalCapacity(Number(e.target.value))} min={1} />
                <p className="text-xs text-muted-foreground">全店同一时段最多接待的客户总数</p>
              </div>
            </div>
            <div className="space-y-3">
              <Label>营业时间</Label>
              {DAYS.map(day => {
                const h = calHours[day] || { enabled: false, slots: [{ start: '09:00', end: '18:00' }] };
                return (
                  <div key={day} className="flex items-center gap-3">
                    <div className="w-10 text-sm font-medium">{DAY_LABELS[day]}</div>
                    <Switch
                      checked={h.enabled}
                      onCheckedChange={v => setCalHours(prev => ({ ...prev, [day]: { ...prev[day], enabled: v, slots: prev[day]?.slots || [{ start: '09:00', end: '18:00' }] } }))}
                    />
                    {h.enabled ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="time" value={h.slots?.[0]?.start || '09:00'} className="w-28"
                          onChange={e => setCalHours(prev => ({ ...prev, [day]: { ...prev[day], slots: [{ start: e.target.value, end: h.slots?.[0]?.end || '18:00' }] } }))}
                        />
                        <span className="text-muted-foreground">-</span>
                        <Input
                          type="time" value={h.slots?.[0]?.end || '18:00'} className="w-28"
                          onChange={e => setCalHours(prev => ({ ...prev, [day]: { ...prev[day], slots: [{ start: h.slots?.[0]?.start || '09:00', end: e.target.value }] } }))}
                        />
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">休息</span>
                    )}
                  </div>
                );
              })}
            </div>
            {settingsError && <p className="text-sm text-destructive">{settingsError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>取消</Button>
            <Button onClick={saveSettings} disabled={settingsSaving}>
              {settingsSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              保存设置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== API Key 创建弹窗 ===== */}
      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{newKey ? '密钥已创建' : '创建 API 密钥'}</DialogTitle>
            <DialogDescription>
              {newKey ? '请立即复制密钥，关闭后无法再次查看' : '为此日历创建一个新的 API 密钥'}
            </DialogDescription>
          </DialogHeader>
          {newKey ? (
            <div className="space-y-4 py-4">
              <div className="bg-muted p-3 rounded-md">
                <div className="flex items-center gap-2">
                  <code className="text-xs flex-1 break-all font-mono">
                    {showKey ? newKey : 'sk_live_' + '*'.repeat(16) + newKey.slice(-8)}
                  </code>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowKey(!showKey)}>
                    {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              <Button className="w-full" onClick={() => copyText(newKey, setKeyCopied)}>
                {keyCopied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {keyCopied ? '已复制' : '复制密钥'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>密钥名称</Label>
                <Input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="如：生产环境" />
              </div>
            </div>
          )}
          <DialogFooter>
            {newKey ? (
              <Button onClick={() => { setKeyDialogOpen(false); setNewKey(null); }}>完成</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setKeyDialogOpen(false)}>取消</Button>
                <Button onClick={createApiKey} disabled={keySaving}>
                  {keySaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  创建
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
