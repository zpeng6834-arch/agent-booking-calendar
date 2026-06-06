'use client';

import { useState, useEffect } from 'react';
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
import { Calendar, Plus, Edit, Trash2, Loader2 } from 'lucide-react';
import type { Calendar as CalendarType, BusinessHoursConfig } from '@/storage/database/shared/schema';

const TIMEZONES = [
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_LABELS: Record<string, string> = {
  monday: '周一',
  tuesday: '周二',
  wednesday: '周三',
  thursday: '周四',
  friday: '周五',
  saturday: '周六',
  sunday: '周日',
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
  const { user } = useAuth();
  const [calendars, setCalendars] = useState<CalendarType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<CalendarType | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Shanghai');
  const [defaultCapacity, setDefaultCapacity] = useState(1);
  const [businessHours, setBusinessHours] = useState<BusinessHoursConfig>(DEFAULT_BUSINESS_HOURS);

  useEffect(() => {
    loadCalendars();
  }, [user]);

  const loadCalendars = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      const { data, error } = await supabase
        .from('calendars')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setCalendars((data as CalendarType[]) || []);
    } catch (error) {
      console.error('Failed to load calendars:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingCalendar(null);
    setName('');
    setTimezone('Asia/Shanghai');
    setDefaultCapacity(1);
    setBusinessHours(DEFAULT_BUSINESS_HOURS);
    setErrorMsg('');
    setDialogOpen(true);
  };

  const openEditDialog = (calendar: CalendarType) => {
    setEditingCalendar(calendar);
    setName(calendar.name);
    setTimezone(calendar.timezone);
    setDefaultCapacity(calendar.default_capacity);
    setBusinessHours(calendar.business_hours || DEFAULT_BUSINESS_HOURS);
    setErrorMsg('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setErrorMsg('');
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      
      if (editingCalendar) {
        // Update
        const { error } = await supabase
          .from('calendars')
          .update({
            name,
            timezone,
            default_capacity: defaultCapacity,
            business_hours: businessHours,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingCalendar.id);
        
        if (error) throw error;
      } else {
        // Create
        const { error } = await supabase
          .from('calendars')
          .insert({
            name,
            timezone,
            default_capacity: defaultCapacity,
            business_hours: businessHours,
          });
        
        if (error) throw error;
      }
      
      setDialogOpen(false);
      loadCalendars();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '保存失败，请重试';
      setErrorMsg(message);
      console.error('Failed to save calendar:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个日历吗？相关的服务和预约也会被删除。')) return;
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      const { error } = await supabase.from('calendars').delete().eq('id', id);
      if (error) throw error;
      loadCalendars();
    } catch (error) {
      console.error('Failed to delete calendar:', error);
    }
  };

  const updateDaySlot = (
    day: keyof BusinessHoursConfig,
    slotIndex: number,
    field: 'start' | 'end',
    value: string
  ) => {
    setBusinessHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: prev[day].slots.map((slot, idx) =>
          idx === slotIndex ? { ...slot, [field]: value } : slot
        ),
      },
    }));
  };

  const toggleDay = (day: keyof BusinessHoursConfig, enabled: boolean) => {
    setBusinessHours((prev) => ({
      ...prev,
      [day]: {
        enabled,
        slots: enabled ? [{ start: '09:00', end: '18:00' }] : [],
      },
    }));
  };

  const addSlot = (day: keyof BusinessHoursConfig) => {
    setBusinessHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: [...prev[day].slots, { start: '09:00', end: '12:00' }],
      },
    }));
  };

  const removeSlot = (day: keyof BusinessHoursConfig, slotIndex: number) => {
    setBusinessHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: prev[day].slots.filter((_, idx) => idx !== slotIndex),
      },
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
          <h1 className="text-3xl font-bold tracking-tight">日历管理</h1>
          <p className="text-muted-foreground mt-2">
            创建和管理您的预约日历
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          新建日历
        </Button>
      </div>

      {calendars.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">还没有创建日历</p>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              创建第一个日历
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {calendars.map((calendar) => (
            <Card key={calendar.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{calendar.name}</CardTitle>
                    <CardDescription>{calendar.timezone}</CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(calendar)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(calendar.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>每时段可预约 {calendar.default_capacity} 人</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-1">
                  {DAYS.map((day) => (
                    <Badge
                      key={day}
                      variant={calendar.business_hours?.[day]?.enabled ? 'default' : 'outline'}
                      className="text-xs"
                    >
                      {DAY_LABELS[day]}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCalendar ? '编辑日历' : '新建日历'}
            </DialogTitle>
            <DialogDescription>
              配置日历的基本信息和营业时间
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">日历名称</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：主日历"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">时区</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="capacity">每时段可预约人数</Label>
                <Input
                  id="capacity"
                  type="number"
                  min={1}
                  value={defaultCapacity}
                  onChange={(e) => setDefaultCapacity(parseInt(e.target.value) || 1)}
                />
                <p className="text-xs text-muted-foreground">
                  同一时间段内最多可接受多少个预约（例如：1 = 一对一，10 = 小班课）
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <Label>营业时间</Label>
              <div className="space-y-4">
                {DAYS.map((day) => (
                  <div key={day} className="flex items-start gap-4">
                    <div className="flex items-center gap-2 w-20">
                      <Switch
                        checked={businessHours[day]?.enabled || false}
                        onCheckedChange={(checked) => toggleDay(day, checked)}
                      />
                      <span className="text-sm">{DAY_LABELS[day]}</span>
                    </div>
                    {businessHours[day]?.enabled && (
                      <div className="flex-1 space-y-2">
                        {businessHours[day].slots.map((slot, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <Input
                              type="time"
                              value={slot.start}
                              onChange={(e) =>
                                updateDaySlot(day, idx, 'start', e.target.value)
                              }
                              className="w-28"
                            />
                            <span className="text-muted-foreground">至</span>
                            <Input
                              type="time"
                              value={slot.end}
                              onChange={(e) =>
                                updateDaySlot(day, idx, 'end', e.target.value)
                              }
                              className="w-28"
                            />
                            {businessHours[day].slots.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeSlot(day, idx)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addSlot(day)}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          添加时段
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            {errorMsg && (
              <p className="text-sm text-destructive mr-auto">{errorMsg}</p>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
