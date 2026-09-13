import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const floorSignals = sqliteTable("floor_signals", {
  room: text("room").notNull(),
  floor: integer("floor").notNull(),
  count: integer("count").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.room, table.floor] })]);
