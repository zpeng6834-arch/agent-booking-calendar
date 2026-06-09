# 接口优化计划 — 简化 Agent 预约流程

## 概述

将「完成一次预约需调用 3-4 个接口」简化为「1 个接口完成预约」。新增 `POST /api/quick-book` 智能预约接口，Agent 只需提供自然语言描述的意向（服务名称、期望时间、客户信息），API 自动完成服务匹配、时间查找、容量校验、创建预约全流程。

## 当前问题

| 接口 | 调用时机 | Agent 必须知道 |
|------|----------|----------------|
| GET /api/calendars/{id} | 了解日历规则 | calendar_id |
| GET /api/calendars/{id}/services | 获取服务列表 | calendar_id |
| GET /api/availability | 查询可用时间 | calendar_id, service_id, date |
| POST /api/bookings | 创建预约 | calendar_id, service_id, start_time |

**问题**：
1. Agent 必须先知道 `calendar_id` 和 `service_id`
2. 必须先调用 availability 再调用 bookings
3. 时间格式要求严格（ISO 8601 UTC），Agent 容易出错
4. 无法用自然语言表达「明天下午」「下周一上午」

## 优化方案

### 新增核心接口：`POST /api/quick-book`

**请求示例**：
```json
{
  "calendar_id": "cal_xxx",
  "service": "按摩",           // 服务名称或ID
  "time_preference": "明天下午", // 自然语言或具体时间
  "customer": {
    "name": "张三",
    "email": "zhang@example.com",
    "phone": "13800138000"
  },
  "notes": "备注信息"
}
```

**响应示例（成功）**：
```json
{
  "success": true,
  "booking": {
    "id": "book_xxx",
    "service_name": "按摩",
    "start_time": "2025-01-16T14:00:00+08:00",
    "end_time": "2025-01-16T15:00:00+08:00",
    "customer_name": "张三"
  },
  "message": "已成功预约 明天 14:00-15:00 的按摩服务"
}
```

**响应示例（无可用时间）**：
```json
{
  "success": false,
  "error": "未找到可用时间",
  "details": {
    "service_name": "按摩",
    "requested_preference": "明天下午",
    "reason": "明天下午已约满"
  },
  "alternatives": [
    { "time": "明天 10:00-11:00", "available": true },
    { "time": "后天 14:00-15:00", "available": true }
  ],
  "agent_hint": "建议向客户推荐以上替代时间"
}
```

### 接口能力

| 能力 | 说明 |
|------|------|
| 服务名匹配 | `service` 字段支持服务名称（模糊匹配）或 service_id |
| 自然语言时间 | `time_preference` 支持：今天/明天/后天、上午/下午/晚上、具体日期 |
| 自动找位 | 根据偏好自动查找最早可用时段 |
| 容量校验 | 内部完成双层容量校验 |
| 失败推荐 | 无可用时返回替代时间 |

### 保留接口（供高级场景）

| 接口 | 用途 |
|------|------|
| GET /api/calendars/{id} | Agent 需要了解营业规则时 |
| GET /api/calendars/{id}/services | Agent 需要展示服务列表供用户选择时 |
| GET /api/availability | Agent 需要展示具体时段供用户选择时 |
| POST /api/bookings | 精确控制预约时间时 |
| PATCH /api/bookings/{id} | 改期 |
| DELETE /api/bookings/{id} | 取消 |

## 技术方案

| 维度 | 选择 | 理由 |
|------|------|------|
| 时间解析 | 自研 + 规则匹配 | 无需第三方库，覆盖常见表达 |
| 服务匹配 | 名称包含匹配 | 容错性好，支持「按摩」「肩颈按摩」都能匹配 |
| 时段查找 | 偏好优先 → 最近可用 | 符合用户预期 |
| 响应格式 | 成功精简 / 失败详尽 | Agent 可直接用 message 回复用户 |

## 功能模块

### 1. 时间偏好解析器 `parseTimePreference(preference, timezone)`

**支持的格式**：
- 相对日期：今天、明天、后天、下周一、下周二...
- 时段：上午(6-12)、中午(11-14)、下午(12-18)、晚上(18-22)
- 组合：明天下午、下周一上午、后天晚上
- 具体日期：1月15日、2025-01-15、1月15号
- 具体时间：明天下午3点、1月15日下午2点

**返回**：
```typescript
{
  dateStart: Date,   // 搜索范围开始
  dateEnd: Date,     // 搜索范围结束
  hourStart: number, // 时段开始（如下午=12）
  hourEnd: number,   // 时段结束（如下午=18）
  originalText: string
}
```

### 2. 服务匹配器 `findService(calendarId, serviceQuery)`

- 精确匹配 service_id
- 名称包含匹配（忽略大小写）
- 返回候选列表或最佳匹配

### 3. 智能时段查找 `findBestSlot(calendar, service, timePref)`

- 在偏好范围内查找最早可用时段
- 偏好范围内无可用 → 扩展到当日全天
- 当日无可用 → 扩展到次日
- 最多搜索未来 7 天

## 是否有原型设计

否（纯后端 API 优化，不涉及 UI）

## 后台展示设计

### 数据结构

```
bookings 表:
- customer_name: string     // name 或 "匿名客户"
- customer_email: string?   // email
- customer_phone: string?   // phone
- notes: text?              // JSON: { name?, email?, phone?, ...自定义字段 }
```

### 日历视图展示

**当前**：`客户名 | 时间 | 备注`

**优化后**：
```
┌─────────────────────────────────────┐
│ 14:00-15:00                         │
│ 按摩（60分钟）                       │
│ 张三                                │  ← customer_name
│ 📱 138****8000  📧 zhang@...        │  ← phone + email 图标+脱敏
│ 📝 孕妇, 来源:微信                   │  ← 自定义字段（从 notes 解析）
└─────────────────────────────────────┘
```

**展示规则**：
1. 姓名直接显示（或「匿名客户」）
2. 电话/邮箱用图标+脱敏显示（点图标复制完整值）
3. 自定义字段用 `🏷️` 前缀，逗号分隔显示
4. notes 原始内容较长时折叠，点击展开

### 预约列表展示

**当前表格列**：客户姓名 | 联系方式 | 服务 | 预约时间 | 状态 | 操作

**优化后**：

| 客户 | 服务 | 预约时间 | 附加信息 | 操作 |
|------|------|----------|----------|------|
| 张三<br><small class="text-muted">📱138**** 📧zhang@</small> | 按摩 | 1/15 14:00 | 孕妇, 来源:微信 | 编辑 删除 |

**或使用展开行**：
```
┌────────┬────────┬───────────┬────────────────┬────────┐
│ 客户   │ 服务   │ 预约时间  │ 操作           │        │
├────────┼────────┼───────────┼────────────────┼────────┤
│ 张三   │ 按摩   │ 1/15 14:00│ 编辑 删除 查看 ▼│        │
│ ▼ 展开详情                                   │        │
│   电话: 13800138000                         │        │
│   邮箱: zhang@example.com                   │        │
│   孕妇: 是                                  │        │
│   来源: 微信                                │        │
└────────┴────────┴───────────┴────────────────┴────────┘
```

### 数据处理逻辑

**前端解析 notes**：
```typescript
function parseCustomerInfo(booking: Booking) {
  // 核心字段优先从顶层字段取
  const core = {
    name: booking.customer_name || '匿名客户',
    email: booking.customer_email,
    phone: booking.customer_phone,
  };

  // 从 notes 解析自定义字段
  let custom: Record<string, string> = {};
  if (booking.notes) {
    try {
      const parsed = JSON.parse(booking.notes);
      // 排除核心字段，其余为自定义
      custom = Object.fromEntries(
        Object.entries(parsed).filter(
          ([k]) => !['name', 'email', 'phone'].includes(k)
        )
      );
    } catch {
      // 非 JSON，作为纯文本备注处理
      custom = { '备注': booking.notes };
    }
  }

  return { core, custom };
}
```

## 实施步骤

1. **新增 quick-book 路由**：创建 `src/app/api/quick-book/route.ts`，实现 POST handler
2. **实现时间偏好解析器**：在 `src/lib/time-preference.ts` 实现 parseTimePreference 函数
3. **实现客户信息处理**：customer_info 解析、去重逻辑、notes JSON 序列化
4. **更新后台展示**：日历视图和预约列表的客户信息展示组件
5. **更新 OpenAPI Schema**：在日历详情页的 schema 生成中加入 quick-book 接口定义
6. **更新 Agent Prompt**：在 Prompt 中强调优先使用 quick-book，说明 customer_info 灵活格式
7. **执行测试验证**：测试 quick-book 各种场景（匿名、自定义字段、去重等）

## 客户信息设计

### 问题分析

| 场景 | 当前方案 | 问题 |
|------|----------|------|
| Agent 无法获取客户姓名 | 必填，报错 | 预约失败 |
| 商家需要收集更多信息 | 固定字段 | 无法扩展 |
| 防重复预约 | 依赖 email | 无 email 时失效 |

### 解决方案：灵活的 customer_info 对象

**请求格式**：
```json
{
  "calendar_id": "cal_xxx",
  "service": "按摩",
  "time_preference": "明天下午",
  "customer_info": {
    "name": "张三",        // 可选，无则用"匿名客户"
    "phone": "138xxxx",    // 可选
    "email": "xx@xx.com",  // 可选
    "备注": "孕妇",        // 自定义字段
    "来源": "微信"         // 自定义字段
  }
}
```

**设计要点**：

1. **所有字段可选**：无 name 时使用「匿名客户」，预约不失败
2. **自定义字段支持**：`customer_info` 可包含任意键值对，存入 notes 字段（JSON 序列化）
3. **标识去重逻辑**：
   - 有 email → 用 email 防重复
   - 无 email 有 phone → 用 phone 防重复
   - 都无 → 允许同服务同时段多次预约（无法去重）

**数据库存储**：
```
bookings 表:
- customer_name: string     // name 或 "匿名客户"
- customer_email: string?   // email
- customer_phone: string?   // phone
- notes: text?              // JSON 序列化完整的 customer_info（含自定义字段）
```

**OpenAPI Schema 更新**：
```yaml
customer_info:
  type: object
  additionalProperties: true
  properties:
    name:
      type: string
      description: 客户姓名，可选，无则使用"匿名客户"
    email:
      type: string
      description: 客户邮箱，用于防重复预约
    phone:
      type: string
      description: 客户电话，用于防重复预约
  description: |
    客户信息对象，所有字段均为可选。
    支持任意自定义字段（如"年龄"、"地址"等），
    自定义字段会存入预约备注中。
```

## 接口详细设计

### POST /api/quick-book

**请求参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| calendar_id | string | 是 | 日历ID |
| service | string | 是 | 服务名称或service_id |
| time_preference | string | 是 | 时间偏好描述 |
| customer_info | object | 否 | 客户信息（所有字段可选） |
| customer_info.name | string | 否 | 客户姓名，无则用"匿名客户" |
| customer_info.email | string | 否 | 客户邮箱（用于防重复预约） |
| customer_info.phone | string | 否 | 客户电话（用于防重复预约） |
| customer_info.* | string | 否 | 任意自定义字段 |

**响应状态码**：
- 200：预约成功
- 400：参数错误（缺少 calendar_id/service/time_preference）
- 404：服务/日历不存在
- 409：无可用时间（返回替代建议）或重复预约
- 500：服务器错误
