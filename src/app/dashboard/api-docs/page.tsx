'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, FileCode, MessageSquare, Loader2 } from 'lucide-react';
import type { Calendar, Service } from '@/storage/database/shared/schema';

export default function ApiDocsPage() {
  const { user } = useAuth();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const domain = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      
      const { data: calData } = await supabase
        .from('calendars')
        .select('*')
        .order('created_at', { ascending: false });
      
      const { data: svcData } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      setCalendars((calData as Calendar[]) || []);
      setServices((svcData as Service[]) || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openApiSchema = {
    openapi: '3.0.0',
    info: {
      title: 'AI Agent 预约日历 API',
      version: '1.0.0',
      description: '为 AI Agent 设计的预约日历 API，支持查询可用时间、创建预约、取消和改期。',
    },
    servers: [
      { url: domain, description: 'API Server' },
    ],
    paths: {
      '/api/availability': {
        get: {
          summary: '查询可预约时间',
          description: '查询指定日期范围内的可用预约时间槽',
          parameters: [
            { name: 'calendar_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'service_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'date', in: 'query', required: false, schema: { type: 'string', format: 'date' }, description: '查询起始日期，默认今天' },
            { name: 'days', in: 'query', required: false, schema: { type: 'integer' }, description: '查询天数，默认7天' },
          ],
          responses: {
            '200': {
              description: '成功返回可用时间',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          slots: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                start: { type: 'string', format: 'date-time' },
                                end: { type: 'string', format: 'date-time' },
                                available: { type: 'boolean' },
                                remaining_capacity: { type: 'integer' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/bookings': {
        post: {
          summary: '创建预约',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['calendar_id', 'service_id', 'start_time', 'customer_name', 'customer_email'],
                  properties: {
                    calendar_id: { type: 'string', format: 'uuid' },
                    service_id: { type: 'string', format: 'uuid' },
                    start_time: { type: 'string', format: 'date-time' },
                    customer_name: { type: 'string' },
                    customer_email: { type: 'string', format: 'email' },
                    customer_phone: { type: 'string' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: '预约创建成功' },
            '409': { description: '时间段已约满，返回建议时间' },
          },
        },
      },
      '/api/bookings/{id}': {
        delete: {
          summary: '取消预约',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'calendar_id', in: 'query', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
        },
        patch: {
          summary: '改期预约',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['calendar_id', 'new_start_time'],
                  properties: {
                    calendar_id: { type: 'string', format: 'uuid' },
                    new_start_time: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const agentPrompt = `# AI Agent 预约系统提示

你是一个预约助手，帮助用户完成预约相关操作。

## 可用 API

### 1. 查询可预约时间
- 端点: GET /api/availability
- 参数:
  - calendar_id: 日历 ID（必需）
  - service_id: 服务 ID（必需）
  - date: 起始日期（可选，默认今天）
  - days: 查询天数（可选，默认7天）
- 用途: 查询可预约的时间槽

### 2. 创建预约
- 端点: POST /api/bookings
- 参数:
  - calendar_id: 日历 ID
  - service_id: 服务 ID
  - start_time: 预约开始时间（ISO 8601 格式）
  - customer_name: 客户姓名
  - customer_email: 客户邮箱
  - customer_phone: 客户电话（可选）
  - notes: 备注（可选）
- 响应: 成功返回预约详情，失败返回建议时间

### 3. 取消预约
- 端点: DELETE /api/bookings/{id}
- 参数:
  - id: 预约 ID
  - calendar_id: 日历 ID（query 参数）

### 4. 改期预约
- 端点: PATCH /api/bookings/{id}
- 参数:
  - id: 预约 ID（path）
  - calendar_id: 日历 ID
  - new_start_time: 新的开始时间

## 使用流程

1. 用户请求预约 → 调用查询可预约时间 API
2. 选择时间 → 调用创建预约 API
3. 若创建失败（已约满）→ 向用户展示返回的建议时间
4. 用户需要取消/改期 → 调用对应 API

## 认证

在请求头添加: Authorization: Bearer YOUR_API_KEY

## 可用日历和服务

${calendars.length > 0 ? calendars.map(cal => 
  `### 日历: ${cal.name}
- ID: ${cal.id}
- 时区: ${cal.timezone}
- 默认容量: ${cal.default_capacity}
${services.filter(s => s.calendar_id === cal.id).map(s => 
  `  - 服务: ${s.name} (ID: ${s.id}, 时长: ${s.duration_minutes}分钟, 容量: ${s.capacity})`
).join('\n')}`
).join('\n\n') : '请先创建日历和服务'}
`;

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
        <h1 className="text-3xl font-bold tracking-tight">API 文档</h1>
        <p className="text-muted-foreground mt-2">
          OpenAPI Schema 和 AI Agent 集成指南
        </p>
      </div>

      <Tabs defaultValue="prompt">
        <TabsList>
          <TabsTrigger value="prompt">
            <MessageSquare className="mr-2 h-4 w-4" />
            Agent Prompt
          </TabsTrigger>
          <TabsTrigger value="openapi">
            <FileCode className="mr-2 h-4 w-4" />
            OpenAPI Schema
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prompt">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>AI Agent Prompt</CardTitle>
                  <CardDescription>
                    复制此提示词到您的 AI Agent 系统提示中
                  </CardDescription>
                </div>
                <Button onClick={() => copyToClipboard(agentPrompt)}>
                  {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? '已复制' : '复制'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="p-4 bg-muted rounded-lg text-sm overflow-x-auto whitespace-pre-wrap">
                {agentPrompt}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="openapi">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>OpenAPI 3.0 Schema</CardTitle>
                  <CardDescription>
                    标准 OpenAPI 规范，可导入到 Postman、Swagger 等工具
                  </CardDescription>
                </div>
                <Button onClick={() => copyToClipboard(JSON.stringify(openApiSchema, null, 2))}>
                  {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? '已复制' : '复制'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="p-4 bg-muted rounded-lg text-sm overflow-x-auto">
                {JSON.stringify(openApiSchema, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
