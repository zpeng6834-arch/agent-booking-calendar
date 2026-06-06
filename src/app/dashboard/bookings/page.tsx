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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarDays, Calendar, Loader2, Search, Filter } from 'lucide-react';
import type { Booking as BookingType, Service as ServiceType, Calendar as CalendarType } from '@/storage/database/shared/schema';

const STATUS_LABELS: Record<string, string> = {
  pending: '待确认',
  confirmed: '已确认',
  cancelled: '已取消',
  completed: '已完成',
  no_show: '未到场',
};

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  confirmed: 'default',
  cancelled: 'destructive',
  completed: 'default',
  no_show: 'outline',
};

interface BookingWithRelations extends BookingType {
  calendars?: CalendarType;
  services?: ServiceType;
}

export default function BookingsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<BookingWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadBookings();
  }, [user, statusFilter]);

  const loadBookings = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      
      // Load reference data first
      const [calRes, svcRes] = await Promise.all([
        supabase.from('calendars').select('*'),
        supabase.from('services').select('*'),
      ]);
      const calMap = new Map(((calRes.data as CalendarType[]) || []).map(c => [c.id, c]));
      const svcMap = new Map(((svcRes.data as ServiceType[]) || []).map(s => [s.id, s]));

      let query = supabase
        .from('bookings')
        .select('*')
        .order('start_time', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query.limit(100);
      
      if (error) throw error;
      const enriched = ((data as BookingType[]) || []).map(b => ({
        ...b,
        calendars: calMap.get(b.calendar_id),
        services: svcMap.get(b.service_id),
      }));
      setBookings(enriched);
    } catch (error) {
      console.error('Failed to load bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      const { error } = await supabase
        .from('bookings')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
      loadBookings();
    } catch (error) {
      console.error('Failed to update booking:', error);
    }
  };

  const formatDateTime = (dateStr: Date | string) => {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    return date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredBookings = bookings.filter((booking) =>
    searchQuery
      ? booking.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        booking.customer_email.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

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
        <h1 className="text-3xl font-bold tracking-tight">预约管理</h1>
        <p className="text-muted-foreground mt-2">
          查看和管理所有预约
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索客户姓名或邮箱..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="状态筛选" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="pending">待确认</SelectItem>
            <SelectItem value="confirmed">已确认</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
            <SelectItem value="cancelled">已取消</SelectItem>
            <SelectItem value="no_show">未到场</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredBookings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CalendarDays className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchQuery || statusFilter !== 'all' 
                ? '没有找到匹配的预约' 
                : '还没有预约记录'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客户</TableHead>
                <TableHead>服务</TableHead>
                <TableHead>时间</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBookings.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{booking.customer_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {booking.customer_email}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p>{booking.services?.name || '-'}</p>
                      <p className="text-sm text-muted-foreground">
                        {booking.calendars?.name || '-'}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p>{formatDateTime(booking.start_time)}</p>
                      <p className="text-sm text-muted-foreground">
                        至 {formatDateTime(booking.end_time)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[booking.status]}>
                      {STATUS_LABELS[booking.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {booking.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus(booking.id, 'confirmed')}
                        >
                          确认
                        </Button>
                      )}
                      {booking.status === 'confirmed' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatus(booking.id, 'completed')}
                          >
                            完成
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => updateStatus(booking.id, 'cancelled')}
                          >
                            取消
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
