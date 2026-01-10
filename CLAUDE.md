# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install          # Install dependencies
bun run src/index.ts # Run the bot
bun start            # Same as above
bunx tsc --noEmit    # Type check
```

## Required Environment Variables

- `FEEDBIN_USERNAME` - Feedbin account email
- `FEEDBIN_PASSWORD` - Feedbin account password
- `DISCORD_BOT_TOKEN` - Bot token from Discord Developer Portal
- `DISCORD_CLIENT_ID` - Application ID for slash command registration
- `DISCORD_GUILD_ID` - Server ID (bot only works in this server)

## Architecture

Discord bot that polls Feedbin for unread RSS entries and posts them to per-feed channels. No database - state is derived from Discord channels and Feedbin on startup.

**File Structure:**
- `src/index.ts` - Entry point, validates config and starts bot
- `src/config.ts` - Environment variable validation
- `src/store.ts` - In-memory feed_id ↔ channel_id mappings
- `src/feedbin.ts` - Feedbin API client (auth, polling, subscriptions)
- `src/bot.ts` - Discord.js client, event handlers, polling loop
- `src/commands/feed.ts` - `/feed add|remove|list` slash commands
- `src/embeds.ts` - Discord embed creation from feed items
- `src/types.ts` - TypeScript interfaces

**Flow:**
1. On startup: validate config, login Discord bot, register guild commands
2. Sync feed mappings by reading RSS category channels and matching topics to Feedbin subscriptions
3. Fetch feed icons from Feedbin and cache in memory
4. Poll Feedbin every 2 minutes for unread entries
5. Post entries to the corresponding channel (looked up from in-memory store)
6. Mark entries as read in Feedbin

**Slash Commands:**
- `/feed add <url>` - Subscribe to RSS feed, creates channel under "RSS" category
- `/feed remove <channel>` - Unsubscribe and delete channel
- `/feed list` - List all feeds (reads from RSS category channels)

**State Storage:**
- Feed URL stored in channel topic (format: `RSS feed: <url>`)
- On startup, channels under "RSS" category are matched to Feedbin subscriptions to rebuild feed_id → channel_id mappings
