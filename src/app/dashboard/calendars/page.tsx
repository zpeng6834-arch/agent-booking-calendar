'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Calendar, Plus, Trash2, Loader2, ArrowRight, Clock, Users } from 'lucide-react';
import type { Calendar as CalendarType, BusinessHoursConfig } from '@/storage/database/shared/schema';

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

const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  monday: { enabled: true, slots: [{ start: '09:00', end: '18:00' }] },
  tuesday: { enabled: true, slots: [{ start: '09:00', end: '18:00' }] },
  wednesday: { enabled: true, slots: [{ start: '09:00', end: '18:00' }] },
  thursday: { enabled: true, slots: [{ start: '09:00', end: '18:00' }] },
  friday: { enabled: true, slots: [{ start: '09:00', end: '18:00' }] },
  saturday: { enabled: false, slots: [] },
  sunday: { enabled: false, slots: [] },
};

export default function CalendarsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [calendars, setCalendars] = useState<CalendarType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Shanghai');
  const [defaultCapacity, setDefaultCapacity] = useState(10);
  const [businessHours, setBusinessHours] = useState<BusinessHoursConfig>(DEFAULT_BUSINESS_HOURS);

  useEffect(() => { loadCalendars(); }, [user]);

  const loadCalendars = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      const { data, error } = await supabase.from('calendars').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setCalendars((data as CalendarType[]) || []);
    } catch (error) {
      console.error('Failed to load calendars:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setErrorMsg('');
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      const { error } = await supabase.from('calendars').insert({
        name, timezone, default_capacity: defaultCapacity, business_hours: businessHours,
      });
      if (error) throw error;
      setDialogOpen(false);
      await loadCalendars();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此日历？相关服务和预约也会被删除。')) return;
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      await supabase.from('calendars').delete().eq('id', id);
      await loadCalendars();
    } catch (e) {
      console.error('Delete failed:', e);
    }
  };

  const toggleDay = (day: keyof BusinessHoursConfig, enabled: boolean) => {
    setBusinessHours(prev => ({
      ...prev,
      [day]: { enabled, slots: enabled ? [{ start: '09:00', end: '18:00' }] : [] },
    }));
  };

  const updateDaySlot = (day: keyof BusinessHoursConfig, idx: number, field: 'start' | 'end', value: string) => {
    setBusinessHours(prev => ({
      ...prev,
      [day]: { ...prev[day], slots: prev[day].slots.map((s, i) => i === idx ? { ...s, [field]: value } : s) },
    }));
  };

  const addSlot = (day: keyof BusinessHoursConfig) => {
    setBusinessHours(prev => ({
      ...prev,
      [day]: { ...prev[day], slots: [...prev[day].slots, { start: '09:00', end: '12:00' }] },
    }));
  };

  const removeSlot = (day: keyof BusinessHoursConfig, idx: number) => {
    setBusinessHours(prev => ({
      ...prev,
      [day]: { ...prev[day], slots: prev[day].slots.filter((_, i) => i !== idx) },
    }));
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">我的日历</h1>
          <p className="text-muted-foreground mt-2">
            点击日历进入详情，管理服务、查看预约、配置 API 集成
          </p>
        </div>
        <Button onClick={() => {
          setName(''); setTimezone('Asia/Shanghai'); setDefaultCapacity(10);
          setBusinessHours(DEFAULT_BUSINESS_HOURS); setErrorMsg('');
          setDialogOpen(true);
        }}>
          <Plus className="mr-2 h-4 w-4" />
          新建日历
        </Button>
      </div>

      {calendars.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Calendar className="h-16 w-16 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium mb-2">还没有创建日历</h3>
            <p className="text-muted-foreground mb-6 text-center max-w-sm">
              日历是管理预约的核心。创建日历后可以添加服务、查看预约日历视图、生成 API 集成。
            </p>
            <Button onClick={() => {
              setName(''); setTimezone('Asia/Shanghai'); setDefaultCapacity(10);
              setBusinessHours(DEFAULT_BUSINESS_HOURS); setErrorMsg('');
              setDialogOpen(true);
            }}>
              <Plus className="mr-2 h-4 w-4" />
              创建第一个日历
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {calendars.map((cal) => (
            <Card
              key={cal.id}
              className="cursor-pointer hover:shadow-md transition-shadow group"
              onClick={() => router.push(`/dashboard/calendars/${cal.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="group-hover:text-primary transition-colors">{cal.name}</CardTitle>
                    <CardDescription className="mt-1">{cal.timezone}</CardDescription>
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); handleDelete(cal.id); }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                  <div className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    总容量 {cal.default_capacity}人
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {DAYS.map(day => (
                    <Badge
                      key={day}
                      variant={cal.business_hours?.[day]?.enabled ? 'default' : 'outline'}
                      className="text-xs"
                    >
                      {DAY_LABELS[day]}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center text-sm text-primary font-medium group-hover:translate-x-1 transition-transform">
                  进入日历 <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 新建日历弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新建日历</DialogTitle>
            <DialogDescription>创建日历后，可以在日历详情中添加服务、查看预约、配置 API</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">日历名称</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="例如：我的按摩店" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>时区</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>同时段总容量</Label>
                  <Input type="number" min={1} value={defaultCapacity} onChange={e => setDefaultCapacity(parseInt(e.target.value) || 1)} />
                  <p className="text-xs text-muted-foreground">
                    全店同一时段最多接待的客户总数
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Label>营业时间</Label>
              {DAYS.map(day => (
                <div key={day} className="flex items-start gap-4">
                  <div className="flex items-center gap-2 w-20">
                    <Switch checked={businessHours[day]?.enabled || false} onCheckedChange={v => toggleDay(day, v)} />
                    <span className="text-sm">{DAY_LABELS[day]}</span>
                  </div>
                  {businessHours[day]?.enabled && (
                    <div className="flex-1 space-y-2">
                      {businessHours[day].slots.map((slot, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input type="time" value={slot.start} onChange={e => updateDaySlot(day, idx, 'start', e.target.value)} className="w-28" />
                          <span className="text-muted-foreground">至</span>
                          <Input type="time" value={slot.end} onChange={e => updateDaySlot(day, idx, 'end', e.target.value)} className="w-28" />
                          {businessHours[day].slots.length > 1 && (
                            <Button variant="ghost" size="icon" onClick={() => removeSlot(day, idx)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => addSlot(day)}>
                        <Plus className="mr-1 h-3 w-3" /> 添加时段
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            {errorMsg && <p className="text-sm text-destructive mr-auto">{errorMsg}</p>}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
