import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  games: defineTable({
    name: v.string(),
    maxPlayers: v.number(),
    currentPlayers: v.number(),
    status: v.union(v.literal("waiting"), v.literal("playing"), v.literal("finished")),
    mapName: v.string(),
  }),
  
  players: defineTable({
    gameId: v.id("games"),
    userId: v.optional(v.id("users")),
    username: v.string(),
    position: v.object({
      x: v.number(),
      y: v.number(),
      z: v.number(),
    }),
    rotation: v.object({
      x: v.number(),
      y: v.number(),
    }),
    health: v.number(),
    maxHealth: v.number(),
    kills: v.number(),
    deaths: v.number(),
    isAlive: v.boolean(),
    lastUpdate: v.number(),
  }).index("by_game", ["gameId"])
    .index("by_user", ["userId"]),
    
  bullets: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    startPosition: v.object({
      x: v.number(),
      y: v.number(),
      z: v.number(),
    }),
    direction: v.object({
      x: v.number(),
      y: v.number(),
      z: v.number(),
    }),
    speed: v.number(),
    damage: v.number(),
    timestamp: v.number(),
  }).index("by_game", ["gameId"]),
  
  kills: defineTable({
    gameId: v.id("games"),
    killerId: v.id("players"),
    victimId: v.id("players"),
    killerName: v.string(),
    victimName: v.string(),
    weapon: v.string(),
    timestamp: v.number(),
  }).index("by_game", ["gameId"])
    .index("by_timestamp", ["timestamp"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
