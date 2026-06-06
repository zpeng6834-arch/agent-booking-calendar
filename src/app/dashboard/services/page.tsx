'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Briefcase, Plus, Edit, Trash2, Loader2, Clock, Users } from 'lucide-react';
import type { Service as ServiceType, Calendar } from '@/storage/database/shared/schema';

export default function ServicesPage() {
  const { user } = useAuth();
  const [services, setServices] = useState<(ServiceType & { calendars?: Calendar })[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceType | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [calendarId, setCalendarId] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [capacity, setCapacity] = useState(1);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      
      // Load calendars first
      const { data: calendarData, error: calendarError } = await supabase
        .from('calendars')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (calendarError) throw calendarError;
      setCalendars((calendarData as Calendar[]) || []);

      // Load services with calendar info
      const { data: serviceData, error: serviceError } = await supabase
        .from('services')
        .select('*, calendars(*)')
        .order('created_at', { ascending: false });
      
      if (serviceError) throw serviceError;
      setServices((serviceData as (ServiceType & { calendars?: Calendar })[]) || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingService(null);
    setName('');
    setDescription('');
    setCalendarId(calendars[0]?.id || '');
    setDurationMinutes(60);
    setCapacity(1);
    setIsActive(true);
    setErrorMsg('');
    setDialogOpen(true);
  };

  const openEditDialog = (service: ServiceType) => {
    setEditingService(service);
    setName(service.name);
    setDescription(service.description || '');
    setCalendarId(service.calendar_id);
    setDurationMinutes(service.duration_minutes);
    setCapacity(service.capacity);
    setIsActive(service.is_active);
    setErrorMsg('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !calendarId) return;
    setSaving(true);
    setErrorMsg('');
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      
      if (editingService) {
        const { error } = await supabase
          .from('services')
          .update({
            name,
            description: description || null,
            calendar_id: calendarId,
            duration_minutes: durationMinutes,
            capacity,
            is_active: isActive,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingService.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('services')
          .insert({
            name,
            description: description || null,
            calendar_id: calendarId,
            duration_minutes: durationMinutes,
            capacity,
            is_active: isActive,
          });
        
        if (error) throw error;
      }
      
      setDialogOpen(false);
      loadData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '保存失败，请重试';
      setErrorMsg(message);
      console.error('Failed to save service:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个服务吗？相关的预约也会被删除。')) return;
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      const { error } = await supabase.from('services').delete().eq('id', id);
      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Failed to delete service:', error);
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours} 小时`;
    return `${hours} 小时 ${mins} 分钟`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (calendars.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">服务管理</h1>
          <p className="text-muted-foreground mt-2">
            创建和管理可预约的服务项目
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">请先创建日历</p>
            <Button onClick={() => window.location.href = '/dashboard/calendars'}>
              前往创建日历
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">服务管理</h1>
          <p className="text-muted-foreground mt-2">
            创建和管理可预约的服务项目
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          新建服务
        </Button>
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">还没有创建服务</p>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              创建第一个服务
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <Card key={service.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle>{service.name}</CardTitle>
                      <Badge variant={service.is_active ? 'default' : 'secondary'}>
                        {service.is_active ? '启用' : '停用'}
                      </Badge>
                    </div>
                    <CardDescription>
                      {service.calendars?.name || '未知日历'}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(service)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(service.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {service.description && (
                  <p className="text-sm text-muted-foreground mb-4">
                    {service.description}
                  </p>
                )}
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {formatDuration(service.duration_minutes)}
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    每时段 {service.capacity} 人
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingService ? '编辑服务' : '新建服务'}
            </DialogTitle>
            <DialogDescription>
              配置服务的基本信息
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="calendar">所属日历</Label>
              <Select value={calendarId} onValueChange={setCalendarId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择日历" />
                </SelectTrigger>
                <SelectContent>
                  {calendars.map((cal) => (
                    <SelectItem key={cal.id} value={cal.id}>
                      {cal.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">服务名称</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：咨询预约"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">描述</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="服务描述（可选）"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration">时长（分钟）</Label>
                <Input
                  id="duration"
                  type="number"
                  min={5}
                  step={5}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 60)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="capacity">每时段可预约人数</Label>
                <Input
                  id="capacity"
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(parseInt(e.target.value) || 1)}
                />
                <p className="text-xs text-muted-foreground">
                  同一时间段最多接受多少预约（1 = 一对一，5 = 可同时5人）
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="active">启用服务</Label>
            </div>
          </div>

          <DialogFooter>
            {errorMsg && (
              <p className="text-sm text-destructive mr-auto">{errorMsg}</p>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim() || !calendarId}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
