import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const createGame = mutation({
  args: {
    name: v.string(),
    maxPlayers: v.number(),
    mapName: v.string(),
  },
  handler: async (ctx, args) => {
    const gameId = await ctx.db.insert("games", {
      name: args.name,
      maxPlayers: args.maxPlayers,
      currentPlayers: 0,
      status: "waiting",
      mapName: args.mapName,
    });
    return gameId;
  },
});

export const joinGame = mutation({
  args: {
    gameId: v.id("games"),
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const game = await ctx.db.get(args.gameId);
    
    if (!game) {
      throw new Error("Game not found");
    }
    
    if (game.currentPlayers >= game.maxPlayers) {
      throw new Error("Game is full");
    }
    
    // Check if player already in game
    const existingPlayer = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();
      
    if (existingPlayer) {
      return existingPlayer._id;
    }
    
    const playerId = await ctx.db.insert("players", {
      gameId: args.gameId,
      userId: userId || undefined,
      username: args.username,
      position: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0 },
      health: 100,
      maxHealth: 100,
      kills: 0,
      deaths: 0,
      isAlive: true,
      lastUpdate: Date.now(),
    });
    
    await ctx.db.patch(args.gameId, {
      currentPlayers: game.currentPlayers + 1,
    });
    
    return playerId;
  },
});

export const updatePlayerPosition = mutation({
  args: {
    playerId: v.id("players"),
    position: v.object({
      x: v.number(),
      y: v.number(),
      z: v.number(),
    }),
    rotation: v.object({
      x: v.number(),
      y: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.playerId, {
      position: args.position,
      rotation: args.rotation,
      lastUpdate: Date.now(),
    });
  },
});

export const shootBullet = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player || !player.isAlive) {
      return null;
    }
    
    const bulletId = await ctx.db.insert("bullets", {
      gameId: player.gameId,
      playerId: args.playerId,
      startPosition: args.startPosition,
      direction: args.direction,
      speed: 100,
      damage: 25,
      timestamp: Date.now(),
    });
    
    return bulletId;
  },
});

export const hitPlayer = mutation({
  args: {
    bulletId: v.id("bullets"),
    victimId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const bullet = await ctx.db.get(args.bulletId);
    const victim = await ctx.db.get(args.victimId);
    const shooter = bullet ? await ctx.db.get(bullet.playerId) : null;
    
    if (!bullet || !victim || !shooter || !victim.isAlive) {
      return null;
    }
    
    const newHealth = Math.max(0, victim.health - bullet.damage);
    const isDead = newHealth <= 0;
    
    await ctx.db.patch(args.victimId, {
      health: newHealth,
      isAlive: !isDead,
      deaths: isDead ? victim.deaths + 1 : victim.deaths,
    });
    
    if (isDead) {
      await ctx.db.patch(bullet.playerId, {
        kills: shooter.kills + 1,
      });
      
      await ctx.db.insert("kills", {
        gameId: victim.gameId,
        killerId: bullet.playerId,
        victimId: args.victimId,
        killerName: shooter.username,
        victimName: victim.username,
        weapon: "rifle",
        timestamp: Date.now(),
      });
    }
    
    // Remove bullet
    await ctx.db.delete(args.bulletId);
    
    return { hit: true, damage: bullet.damage, killed: isDead };
  },
});

export const respawnPlayer = mutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const spawnPositions = [
      { x: 10, y: 1, z: 10 },
      { x: -10, y: 1, z: 10 },
      { x: 10, y: 1, z: -10 },
      { x: -10, y: 1, z: -10 },
    ];
    
    const randomSpawn = spawnPositions[Math.floor(Math.random() * spawnPositions.length)];
    
    await ctx.db.patch(args.playerId, {
      position: randomSpawn,
      health: 100,
      isAlive: true,
      lastUpdate: Date.now(),
    });
  },
});

export const getGameState = query({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return null;
    
    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
      
    const bullets = await ctx.db
      .query("bullets")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
      
    const recentKills = await ctx.db
      .query("kills")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .order("desc")
      .take(10);
    
    return {
      game,
      players,
      bullets,
      recentKills,
    };
  },
});

export const listGames = query({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db
      .query("games")
      .filter((q) => q.neq(q.field("status"), "finished"))
      .collect();
    return games;
  },
});

export const cleanupOldBullets = mutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 5000; // 5 seconds
    const oldBullets = await ctx.db
      .query("bullets")
      .filter((q) => q.lt(q.field("timestamp"), cutoff))
      .collect();
      
    for (const bullet of oldBullets) {
      await ctx.db.delete(bullet._id);
    }
  },
});
