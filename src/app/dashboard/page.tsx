'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
    default_capacity: number;
    business_hours: Record<string, { enabled: boolean; slots: { start: string; end: string }[] }>;
  };
  services: { name: string; description: string; duration_minutes: number; capacity: number }[];
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
      default_capacity: 1,
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
      default_capacity: 5,
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
      default_capacity: 10,
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
      default_capacity: 20,
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

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [calendarCount, setCalendarCount] = useState(0);
  const [pendingBookings, setPendingBookings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const loadStats = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      const [calRes, bookingRes] = await Promise.all([
        supabase.from('calendars').select('id', { count: 'exact' }),
        supabase.from('bookings').select('id', { count: 'exact' }).eq('status', 'pending'),
      ]);
      setCalendarCount(calRes.count ?? 0);
      setPendingBookings(bookingRes.count ?? 0);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const applyTemplate = async (template: Template) => {
    setApplyingTemplate(true);
    setErrorMsg('');
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();

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

      const serviceInserts = template.services.map(svc => ({
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

      // 自动跳转到日历详情
      router.push(`/dashboard/calendars/${calendarId}`);
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : '模板应用失败，请重试');
    } finally {
      setApplyingTemplate(false);
    }
  };

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

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => router.push('/dashboard/calendars')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">我的日历</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{calendarCount}</div>
            <p className="text-xs text-muted-foreground">点击管理日历</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => router.push('/dashboard/calendars')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">待处理预约</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingBookings}</div>
            <p className="text-xs text-muted-foreground">在日历详情中查看</p>
          </CardContent>
        </Card>
      </div>

      {/* No Calendar - Onboarding */}
      {calendarCount === 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>开始使用</CardTitle>
                <CardDescription>
                  创建你的第一个预约日历，然后在日历中添加服务、查看预约、配置 API
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Quick start steps */}
            <div className="space-y-3">
              {[
                { icon: <Calendar className="h-4 w-4" />, title: '创建日历', desc: '设置时区、营业时间、总容量' },
                { icon: <Briefcase className="h-4 w-4" />, title: '添加服务', desc: '在日历中添加服务项目（名称、时长、容量）' },
                { icon: <Key className="h-4 w-4" />, title: '集成 API', desc: '生成密钥、OpenAPI Schema、Agent Prompt' },
              ].map((step, idx) => (
                <div key={idx} className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                    {idx + 1}
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    {step.icon}
                    <div>
                      <span className="font-medium">{step.title}</span>
                      <span className="text-sm text-muted-foreground ml-2">{step.desc}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-4">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                从模板快速创建
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {TEMPLATES.map(template => (
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
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        总容量 {template.calendar.default_capacity}人
                      </span>
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        {template.services.length}项服务
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {appliedTemplate && (
              <div className="flex items-center gap-2 text-sm text-primary">
                <CheckCircle2 className="h-4 w-4" />
                模板已应用！正在跳转到日历详情...
              </div>
            )}
            {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}

            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">或者</span>
              <Button variant="outline" onClick={() => router.push('/dashboard/calendars')}>
                自定义创建日历 <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Has Calendars - Quick Actions */}
      {calendarCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>快速操作</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button onClick={() => router.push('/dashboard/calendars')}>
                <Calendar className="mr-2 h-4 w-4" />
                管理日历
              </Button>
              <Button variant="outline" onClick={() => router.push('/dashboard/calendars')}>
                <Sparkles className="mr-2 h-4 w-4" />
                从模板创建新日历
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
