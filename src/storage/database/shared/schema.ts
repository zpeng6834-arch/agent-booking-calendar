import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uuid,
} from "drizzle-orm/pg-core";

// 系统表 - 必须保留
export const healthCheck = pgTable("health_check", {
  id: integer().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow(),
});

// 预约日历表
export const calendars = pgTable(
  "calendars",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull().default(sql`auth.uid()`),
    name: varchar("name", { length: 255 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Shanghai"),
    // 营业时间配置: { "monday": { "enabled": true, "slots": [{ "start": "09:00", "end": "12:00" }, { "start": "14:00", "end": "18:00" }] }, ... }
    business_hours: jsonb("business_hours").notNull().$type<BusinessHoursConfig>(),
    default_capacity: integer("default_capacity").notNull().default(1),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("calendars_user_id_idx").on(table.user_id),
    index("calendars_created_at_idx").on(table.created_at),
  ]
);

// 服务项目表
export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    calendar_id: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    duration_minutes: integer("duration_minutes").notNull().default(60),
    capacity: integer("capacity").notNull().default(1),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("services_calendar_id_idx").on(table.calendar_id),
    index("services_is_active_idx").on(table.is_active),
  ]
);

// 预约记录表
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    calendar_id: uuid("calendar_id").notNull().references(() => calendars.id, { onDelete: "cascade" }),
    service_id: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    start_time: timestamp("start_time", { withTimezone: true }).notNull(),
    end_time: timestamp("end_time", { withTimezone: true }).notNull(),
    customer_name: varchar("customer_name", { length: 255 }).notNull(),
    customer_email: varchar("customer_email", { length: 255 }).notNull(),
    customer_phone: varchar("customer_phone", { length: 32 }),
    status: varchar("status", { length: 20 }).notNull().default("confirmed"), // pending, confirmed, cancelled, completed, no_show
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("bookings_calendar_id_idx").on(table.calendar_id),
    index("bookings_service_id_idx").on(table.service_id),
    index("bookings_start_time_idx").on(table.start_time),
    index("bookings_status_idx").on(table.status),
    // 复合索引用于查询时间段内的预约
    index("bookings_calendar_time_idx").on(table.calendar_id, table.start_time, table.end_time),
  ]
);

// API 密钥表
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull().default(sql`auth.uid()`),
    key: varchar("key", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    calendar_id: uuid("calendar_id").references(() => calendars.id, { onDelete: "cascade" }),
    last_used_at: timestamp("last_used_at", { withTimezone: true }),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("api_keys_user_id_idx").on(table.user_id),
    index("api_keys_key_idx").on(table.key),
    index("api_keys_is_active_idx").on(table.is_active),
    index("api_keys_calendar_id_idx").on(table.calendar_id),
  ]
);

// 类型定义
export type BusinessHoursConfig = {
  [day in 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday']: {
    enabled: boolean;
    slots: Array<{
      start: string; // HH:mm format
      end: string;   // HH:mm format
    }>;
  };
};

export type Calendar = typeof calendars.$inferSelect;
export type InsertCalendar = typeof calendars.$inferInsert;

export type Service = typeof services.$inferSelect;
export type InsertService = typeof services.$inferInsert;

export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;
