'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Calendar,
  Briefcase,
  Key,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Sparkles,
  Clock,
  Users,
  Stethoscope,
  GraduationCap,
  MessageSquare,
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  calendar: {
    name: string;
    timezone: string;
    /** 同时段总容量：全店同一时间段最多接待的客户总数 */
    default_capacity: number;
    business_hours: Record<string, { enabled: boolean; slots: { start: string; end: string }[] }>;
  };
  services: { name: string; description: string; duration_minutes: number; /** 该服务同时段可接待人数 */ capacity: number }[];
}

const TEMPLATES: Template[] = [
  {
    id: 'consultation',
    name: '一对一咨询',
    description: '律师、顾问、教练等个人咨询服务',
    icon: <MessageSquare className="h-5 w-5" />,
    calendar: {
      name: '咨询日历',
      timezone: 'Asia/Shanghai',
      default_capacity: 1, // 只有1个顾问，同时只能接待1人
      business_hours: {
        monday: { enabled: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
        tuesday: { enabled: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
        wednesday: { enabled: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
        thursday: { enabled: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
        friday: { enabled: true, slots: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
        saturday: { enabled: false, slots: [] },
        sunday: { enabled: false, slots: [] },
      },
    },
    services: [
      { name: '初次咨询', description: '首次咨询，了解需求', duration_minutes: 30, capacity: 1 },
      { name: '深度咨询', description: '深入探讨具体问题', duration_minutes: 60, capacity: 1 },
      { name: '跟进咨询', description: '后续跟进与方案调整', duration_minutes: 30, capacity: 1 },
    ],
  },
  {
    id: 'medical',
    name: '医疗门诊',
    description: '诊所、中医馆等医疗服务场景',
    icon: <Stethoscope className="h-5 w-5" />,
    calendar: {
      name: '门诊日历',
      timezone: 'Asia/Shanghai',
      default_capacity: 5, // 诊所同时段总容量5人（如5位医生）
      business_hours: {
        monday: { enabled: true, slots: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '17:30' }] },
        tuesday: { enabled: true, slots: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '17:30' }] },
        wednesday: { enabled: true, slots: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '17:30' }] },
        thursday: { enabled: true, slots: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '17:30' }] },
        friday: { enabled: true, slots: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '17:30' }] },
        saturday: { enabled: true, slots: [{ start: '08:00', end: '12:00' }] },
        sunday: { enabled: false, slots: [] },
      },
    },
    services: [
      { name: '普通门诊', description: '常规诊疗（3位医生坐诊）', duration_minutes: 15, capacity: 3 },
      { name: '专家门诊', description: '专家诊疗（1位专家坐诊）', duration_minutes: 20, capacity: 1 },
      { name: '体检预约', description: '健康体检（可同时3人）', duration_minutes: 60, capacity: 3 },
    ],
  },
  {
    id: 'massage',
    name: '按摩推拿',
    description: '按摩店、推拿馆等多技师多项目场景',
    icon: <Users className="h-5 w-5" />,
    calendar: {
      name: '门店日历',
      timezone: 'Asia/Shanghai',
      default_capacity: 10, // 10个技师同时段总容量
      business_hours: {
        monday: { enabled: true, slots: [{ start: '10:00', end: '22:00' }] },
        tuesday: { enabled: true, slots: [{ start: '10:00', end: '22:00' }] },
        wednesday: { enabled: true, slots: [{ start: '10:00', end: '22:00' }] },
        thursday: { enabled: true, slots: [{ start: '10:00', end: '22:00' }] },
        friday: { enabled: true, slots: [{ start: '10:00', end: '22:00' }] },
        saturday: { enabled: true, slots: [{ start: '10:00', end: '23:00' }] },
        sunday: { enabled: true, slots: [{ start: '10:00', end: '21:00' }] },
      },
    },
    services: [
      { name: '全身按摩', description: '5位按摩技师', duration_minutes: 60, capacity: 5 },
      { name: '针灸理疗', description: '3位针灸师', duration_minutes: 45, capacity: 3 },
      { name: '足部护理', description: '2位足疗师', duration_minutes: 60, capacity: 2 },
    ],
  },
  {
    id: 'education',
    name: '培训课程',
    description: '培训机构、私教等多人课程场景',
    icon: <GraduationCap className="h-5 w-5" />,
    calendar: {
      name: '课程日历',
      timezone: 'Asia/Shanghai',
      default_capacity: 20, // 机构同时段最多20人
      business_hours: {
        monday: { enabled: true, slots: [{ start: '09:00', end: '21:00' }] },
        tuesday: { enabled: true, slots: [{ start: '09:00', end: '21:00' }] },
        wednesday: { enabled: true, slots: [{ start: '09:00', end: '21:00' }] },
        thursday: { enabled: true, slots: [{ start: '09:00', end: '21:00' }] },
        friday: { enabled: true, slots: [{ start: '09:00', end: '21:00' }] },
        saturday: { enabled: true, slots: [{ start: '09:00', end: '18:00' }] },
        sunday: { enabled: false, slots: [] },
      },
    },
    services: [
      { name: '一对一私教', description: '个性化教学', duration_minutes: 60, capacity: 1 },
      { name: '小班课', description: '3-6人小班', duration_minutes: 90, capacity: 6 },
      { name: '大班课', description: '10-20人团体课', duration_minutes: 120, capacity: 20 },
    ],
  },
];

interface DashboardStats {
  calendarCount: number;
  serviceCount: number;
  pendingBookings: number;
  apiKeyCount: number;
  hasCalendar: boolean;
  hasService: boolean;
  hasApiKey: boolean;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    calendarCount: 0,
    serviceCount: 0,
    pendingBookings: 0,
    apiKeyCount: 0,
    hasCalendar: false,
    hasService: false,
    hasApiKey: false,
  });
  const [loading, setLoading] = useState(true);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const loadStats = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();

      const [calRes, svcRes, bookingRes, keyRes] = await Promise.all([
        supabase.from('calendars').select('id', { count: 'exact' }),
        supabase.from('services').select('id', { count: 'exact' }),
        supabase.from('bookings').select('id', { count: 'exact' }).eq('status', 'pending'),
        supabase.from('api_keys').select('id', { count: 'exact' }).eq('is_active', true),
      ]);

      const calendarCount = calRes.count ?? 0;
      const serviceCount = svcRes.count ?? 0;
      const pendingBookings = bookingRes.count ?? 0;
      const apiKeyCount = keyRes.count ?? 0;

      setStats({
        calendarCount,
        serviceCount,
        pendingBookings,
        apiKeyCount,
        hasCalendar: calendarCount > 0,
        hasService: serviceCount > 0,
        hasApiKey: apiKeyCount > 0,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const applyTemplate = async (template: Template) => {
    setApplyingTemplate(true);
    setErrorMsg('');
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();

      // 1. Create calendar
      const { data: calendarData, error: calError } = await supabase
        .from('calendars')
        .insert({
          name: template.calendar.name,
          timezone: template.calendar.timezone,
          default_capacity: template.calendar.default_capacity,
          business_hours: template.calendar.business_hours,
        })
        .select('id')
        .single();

      if (calError) throw calError;
      const calendarId = calendarData.id;

      // 2. Create services
      const serviceInserts = template.services.map((svc) => ({
        calendar_id: calendarId,
        name: svc.name,
        description: svc.description,
        duration_minutes: svc.duration_minutes,
        capacity: svc.capacity,
        is_active: true,
      }));

      const { error: svcError } = await supabase.from('services').insert(serviceInserts);
      if (svcError) throw svcError;

      setAppliedTemplate(template.id);
      loadStats();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '模板应用失败，请重试';
      setErrorMsg(message);
      console.error('Failed to apply template:', error);
    } finally {
      setApplyingTemplate(false);
    }
  };

  const setupSteps = [
    {
      title: '创建日历',
      description: '配置时区、营业时间和同时段总容量（全店最多同时接待多少人）',
      href: '/dashboard/calendars',
      done: stats.hasCalendar,
      icon: <Calendar className="h-4 w-4" />,
    },
    {
      title: '添加服务项目',
      description: '定义服务名称、时长和每时段可预约人数（如5位按摩师填5）',
      href: '/dashboard/services',
      done: stats.hasService,
      icon: <Briefcase className="h-4 w-4" />,
    },
    {
      title: '生成 API Key',
      description: '获取密钥并集成到您的 AI Agent',
      href: '/dashboard/api-keys',
      done: stats.hasApiKey,
      icon: <Key className="h-4 w-4" />,
    },
  ];

  const allDone = setupSteps.every((s) => s.done);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">概览</h1>
        <p className="text-muted-foreground mt-2">
          欢迎回来，{user?.email?.split('@')[0] || '用户'}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => router.push('/dashboard/calendars')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">日历数量</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.calendarCount}</div>
            <p className="text-xs text-muted-foreground">点击管理日历</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => router.push('/dashboard/services')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">服务项目</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.serviceCount}</div>
            <p className="text-xs text-muted-foreground">点击管理服务</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => router.push('/dashboard/bookings')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">待处理预约</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingBookings}</div>
            <p className="text-xs text-muted-foreground">点击查看预约</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => router.push('/dashboard/api-keys')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API 密钥</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.apiKeyCount}</div>
            <p className="text-xs text-muted-foreground">点击管理密钥</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Start Steps */}
      {!allDone && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>快速开始</CardTitle>
                <CardDescription>
                  按步骤完成初始化，让 AI Agent 开始处理预约
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => setTemplateDialogOpen(true)}>
                <Sparkles className="mr-2 h-4 w-4" />
                从模板创建
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {setupSteps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    {step.done ? (
                      <CheckCircle2 className="h-8 w-8 text-primary" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                        {idx + 1}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {step.icon}
                      <h3 className="font-medium">{step.title}</h3>
                      {step.done && (
                        <Badge variant="secondary" className="text-xs">已完成</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                  {!step.done && (
                    <Button size="sm" onClick={() => router.push(step.href)}>
                      前往设置
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Done */}
      {allDone && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              初始化完成
            </CardTitle>
            <CardDescription>
              所有设置已就绪，您的 AI Agent 可以开始处理预约了
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button onClick={() => router.push('/dashboard/api-docs')}>
                查看 API 文档
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => router.push('/dashboard/bookings')}>
                查看预约列表
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template Quick Start (shown when no calendar) */}
      {!stats.hasCalendar && (
        <Card>
          <CardHeader>
            <CardTitle>推荐模板</CardTitle>
            <CardDescription>
              选择一个模板快速创建日历和服务，也可以自定义
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  disabled={applyingTemplate}
                  className="flex flex-col items-start gap-2 rounded-lg border border-border p-4 text-left hover:border-primary/50 hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                      {template.icon}
                    </div>
                    <span className="font-medium text-sm">{template.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{template.description}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    总容量 {template.calendar.default_capacity} 人/时段
                  </div>
                </button>
              ))}
            </div>
            {appliedTemplate && (
              <div className="mt-4 flex items-center gap-2 text-sm text-primary">
                <CheckCircle2 className="h-4 w-4" />
                模板已应用！
                <Button variant="link" size="sm" className="px-1" onClick={() => router.push('/dashboard/services')}>
                  查看服务
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            )}
            {errorMsg && (
              <p className="mt-4 text-sm text-destructive">{errorMsg}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
