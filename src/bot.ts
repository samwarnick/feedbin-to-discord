import {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    ChannelType,
    type TextChannel,
    type Guild,
    type CategoryChannel,
} from "discord.js";
import { config } from "./config.ts";
import { feedCommand, handleFeedCommand } from "./commands/feed.ts";
import { getChannelForFeed, setFeedChannel } from "./store.ts";
import {
    fetchUnreadEntries,
    getIcons,
    markAsRead,
    getSubscriptions,
    getFeed,
} from "./feedbin.ts";
import { createEmbed } from "./embeds.ts";
import type { FeedItem } from "./types.ts";

export const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

let pollingInterval: ReturnType<typeof setInterval> | null = null;

export async function startBot(): Promise<void> {
    client.once("clientReady", async () => {
        console.log(`Logged in as ${client.user?.tag}`);
        await registerCommands();
        await getIcons();
        await syncFeedMappings();
        startPolling();
    });

    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isChatInputCommand()) return;

        // Only respond to commands from the configured guild
        if (interaction.guildId !== config.discord.guildId) {
            await interaction.reply({
                content: "This bot is not configured for this server.",
                ephemeral: true,
            });
            return;
        }

        if (interaction.commandName === "feed") {
            await handleFeedCommand(interaction);
        }
    });

    await client.login(config.discord.token);
}

async function registerCommands(): Promise<void> {
    const rest = new REST().setToken(config.discord.token);

    try {
        console.log("Registering slash commands...");
        await rest.put(
            Routes.applicationGuildCommands(
                config.discord.clientId,
                config.discord.guildId
            ),
            { body: [feedCommand.toJSON()] }
        );
        console.log("Slash commands registered");
    } catch (error) {
        console.error("Error registering commands:", error);
    }
}

async function syncFeedMappings(): Promise<void> {
    console.log("Syncing feed mappings from Discord...");

    const guild = await client.guilds.fetch(config.discord.guildId);
    const category = await getRssCategory(guild);

    if (!category) {
        console.log("No RSS category found, starting fresh");
        return;
    }

    // Get all Feedbin subscriptions to match feed URLs to feed IDs
    const subscriptions = await getSubscriptions();
    const urlToFeedId = new Map<string, number>();
    for (const sub of subscriptions) {
        urlToFeedId.set(sub.feed_url, sub.feed_id);
    }

    // Get all channels in the RSS category
    const channels = guild.channels.cache.filter(
        (c) => c.parentId === category.id && c.type === ChannelType.GuildText
    );

    let mappedCount = 0;
    for (const [channelId, channel] of channels) {
        if (channel.type !== ChannelType.GuildText) continue;

        const topic = (channel as TextChannel).topic;
        if (!topic) continue;

        // Extract feed URL from topic (format: "RSS feed: <url>")
        const match = topic.match(/^RSS feed: (.+)$/);
        if (!match?.[1]) continue;

        const feedUrl = match[1];
        const feedId = urlToFeedId.get(feedUrl);

        if (feedId) {
            setFeedChannel(feedId, channelId);
            mappedCount++;
        }
    }

    console.log(`Synced ${mappedCount} feed mappings`);
}

function startPolling(): void {
    console.log(
        `Starting polling every ${config.checkInterval / 1000} seconds`
    );

    // Initial check
    checkForNewItems();

    pollingInterval = setInterval(checkForNewItems, config.checkInterval);
}

async function checkForNewItems(): Promise<void> {
    try {
        const entries = await fetchUnreadEntries();

        if (entries.length === 0) {
            return;
        }

        console.log(`Found ${entries.length} unread entries`);

        // Group entries by feed_id
        const entriesByFeed = new Map<number, FeedItem[]>();
        for (const entry of entries) {
            const feedEntries = entriesByFeed.get(entry.feed_id) || [];
            feedEntries.push(entry);
            entriesByFeed.set(entry.feed_id, feedEntries);
        }

        const postedEntryIds: number[] = [];

        // Get guild for channel creation
        const guild = await client.guilds.fetch(config.discord.guildId);

        // Process each feed's entries
        for (const [feedId, feedEntries] of entriesByFeed) {
            let channelId = getChannelForFeed(feedId);

            // Auto-create channel if it doesn't exist
            if (!channelId) {
                try {
                    const feed = await getFeed(feedId);
                    if (!feed) {
                        console.error(`Could not get feed info for ${feedId}`);
                        continue;
                    }

                    const category = await getOrCreateRssCategory(guild);
                    const channelName = sanitizeChannelName(feed.title);

                    const newChannel = await guild.channels.create({
                        name: channelName,
                        type: ChannelType.GuildText,
                        parent: category.id,
                        topic: `RSS feed: ${feed.feed_url}`,
                    });

                    setFeedChannel(feedId, newChannel.id);
                    channelId = newChannel.id;
                    console.log(`Created channel ${channelName} for feed ${feedId}`);
                } catch (error) {
                    console.error(`Error creating channel for feed ${feedId}:`, error);
                    continue;
                }
            }

            try {
                const channel = await client.channels.fetch(channelId);
                if (!channel || !channel.isTextBased()) {
                    console.error(
                        `Channel ${channelId} not found or not text-based`
                    );
                    continue;
                }

                for (const entry of feedEntries) {
                    const embed = await createEmbed(entry);
                    await (channel as TextChannel).send({ embeds: [embed] });
                    postedEntryIds.push(entry.id);
                    console.log(
                        `Posted "${entry.title}" to channel ${channelId}`
                    );
                }
            } catch (error) {
                console.error(`Error posting to channel ${channelId}:`, error);
            }
        }

        // Mark all posted entries as read in Feedbin
        if (postedEntryIds.length > 0) {
            await markAsRead(postedEntryIds);
        }
    } catch (error) {
        console.error("Error checking for new items:", error);
    }
}

async function getRssCategory(guild: Guild): Promise<CategoryChannel | null> {
    await guild.channels.fetch();
    const category = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name === "RSS"
    );
    return (category as CategoryChannel) ?? null;
}

export async function getOrCreateRssCategory(
    guild: Guild
): Promise<CategoryChannel> {
    const existing = await getRssCategory(guild);
    if (existing) {
        return existing;
    }

    const newCategory = await guild.channels.create({
        name: "RSS",
        type: ChannelType.GuildCategory,
    });

    console.log(`Created RSS category: ${newCategory.id}`);
    return newCategory;
}

export function stopBot(): void {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    client.destroy();
}

function sanitizeChannelName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 100);
}
