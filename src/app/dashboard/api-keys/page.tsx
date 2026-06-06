'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Key, Plus, Trash2, Loader2, Copy, Check, Eye, EyeOff } from 'lucide-react';
import type { ApiKey } from '@/storage/database/shared/schema';

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'sk_live_';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function ApiKeysPage() {
  const { user } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [name, setName] = useState('');

  useEffect(() => {
    loadApiKeys();
  }, [user]);

  const loadApiKeys = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setApiKeys((data as ApiKey[]) || []);
    } catch (error) {
      console.error('Failed to load API keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setName('');
    setNewKey(null);
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const key = generateApiKey();
      const supabase = await getSupabaseBrowserClientWithRetry();
      
      const { error } = await supabase
        .from('api_keys')
        .insert({
          name,
          key,
        });
      
      if (error) throw error;
      
      setNewKey(key);
      loadApiKeys();
    } catch (error) {
      console.error('Failed to create API key:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个 API Key 吗？删除后无法恢复。')) return;
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      const { error } = await supabase.from('api_keys').delete().eq('id', id);
      if (error) throw error;
      loadApiKeys();
    } catch (error) {
      console.error('Failed to delete API key:', error);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: !isActive })
        .eq('id', id);
      if (error) throw error;
      loadApiKeys();
    } catch (error) {
      console.error('Failed to toggle API key:', error);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const maskKey = (key: string) => {
    return key.substring(0, 12) + '...' + key.substring(key.length - 4);
  };

  const formatDate = (dateStr: Date | string) => {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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
          <h1 className="text-3xl font-bold tracking-tight">API 密钥</h1>
          <p className="text-muted-foreground mt-2">
            管理用于 AI Agent 集成的 API 密钥
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          新建密钥
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>使用说明</CardTitle>
          <CardDescription>
            将 API Key 用于调用预约 API
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p>1. 创建 API Key 并复制</p>
            <p>2. 在 API 请求头中添加: <code className="bg-muted px-2 py-1 rounded">Authorization: Bearer YOUR_API_KEY</code></p>
            <p>3. 调用预约相关 API 进行集成</p>
          </div>
        </CardContent>
      </Card>

      {apiKeys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Key className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">还没有创建 API Key</p>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              创建第一个密钥
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
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
              {apiKeys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell className="font-medium">{apiKey.name}</TableCell>
                  <TableCell>
                    <code className="text-sm text-muted-foreground">
                      {maskKey(apiKey.key)}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={apiKey.is_active ? 'default' : 'secondary'}>
                      {apiKey.is_active ? '启用' : '禁用'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(apiKey.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleActive(apiKey.id, apiKey.is_active)}
                      >
                        {apiKey.is_active ? '禁用' : '启用'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(apiKey.id)}
                      >
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {newKey ? 'API Key 已创建' : '创建 API Key'}
            </DialogTitle>
            <DialogDescription>
              {newKey
                ? '请立即复制并妥善保管，此密钥不会再次显示'
                : '为您的 AI Agent 创建一个 API 密钥'}
            </DialogDescription>
          </DialogHeader>

          {newKey ? (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 bg-muted rounded-lg text-sm break-all">
                  {showKey ? newKey : maskKey(newKey)}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Button
                className="w-full"
                onClick={() => copyToClipboard(newKey)}
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    复制密钥
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">密钥名称</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：生产环境"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {newKey ? (
              <Button onClick={() => setDialogOpen(false)}>完成</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleCreate} disabled={saving || !name.trim()}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
