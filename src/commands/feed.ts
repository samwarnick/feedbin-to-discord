import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    type ChatInputCommandInteraction,
    type TextChannel,
} from "discord.js";
import {
    setFeedChannel,
    removeFeedChannel,
    getChannelForFeed,
    getFeedForChannel,
} from "../store.ts";
import { subscribeToFeed, findSubscriptionByUrl } from "../feedbin.ts";
import { getOrCreateRssCategory } from "../bot.ts";

export const feedCommand = new SlashCommandBuilder()
    .setName("feed")
    .setDescription("Manage RSS feed subscriptions")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((subcommand) =>
        subcommand
            .setName("add")
            .setDescription("Subscribe to an RSS feed")
            .addStringOption((option) =>
                option
                    .setName("url")
                    .setDescription("The RSS feed URL")
                    .setRequired(true)
            )
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("remove")
            .setDescription("Unsubscribe from an RSS feed")
            .addChannelOption((option) =>
                option
                    .setName("channel")
                    .setDescription("The feed channel to remove")
                    .setRequired(true)
            )
    )
    .addSubcommand((subcommand) =>
        subcommand
            .setName("list")
            .setDescription("List all subscribed feeds")
    );

export async function handleFeedCommand(
    interaction: ChatInputCommandInteraction
): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
        case "add":
            await handleAddFeed(interaction);
            break;
        case "remove":
            await handleRemoveFeed(interaction);
            break;
        case "list":
            await handleListFeeds(interaction);
            break;
    }
}

async function handleAddFeed(
    interaction: ChatInputCommandInteraction
): Promise<void> {
    await interaction.deferReply();

    const url = interaction.options.getString("url", true);
    const guild = interaction.guild;

    if (!guild) {
        await interaction.editReply("This command must be used in a server.");
        return;
    }

    try {
        // First check if already subscribed in Feedbin
        let subscription = await findSubscriptionByUrl(url);

        if (!subscription) {
            // Subscribe to the feed in Feedbin
            const result = await subscribeToFeed(url);
            if (!result.success || !result.subscription) {
                await interaction.editReply(
                    `Failed to subscribe to feed: ${result.error}`
                );
                return;
            }
            subscription = result.subscription;
        }

        // Check if we already have this feed mapped to a channel
        const existingChannelId = getChannelForFeed(subscription.feed_id);
        if (existingChannelId) {
            await interaction.editReply(
                `Already subscribed to this feed in <#${existingChannelId}>`
            );
            return;
        }

        // Get or create the RSS category
        const category = await getOrCreateRssCategory(guild);

        // Create a channel name from the feed title
        const channelName = sanitizeChannelName(subscription.title);

        // Create the channel under the RSS category
        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `RSS feed: ${subscription.feed_url}`,
        });

        // Store the mapping in memory
        setFeedChannel(subscription.feed_id, channel.id);

        await interaction.editReply(
            `Subscribed to **${subscription.title}**! New items will be posted in ${channel}`
        );
    } catch (error) {
        console.error("Error adding feed:", error);
        await interaction.editReply(
            "An error occurred while adding the feed. Please try again."
        );
    }
}

async function handleRemoveFeed(
    interaction: ChatInputCommandInteraction
): Promise<void> {
    await interaction.deferReply();

    const channel = interaction.options.getChannel("channel", true);
    const guild = interaction.guild;

    if (!guild) {
        await interaction.editReply("This command must be used in a server.");
        return;
    }

    try {
        const feedId = getFeedForChannel(channel.id);
        if (feedId === undefined) {
            await interaction.editReply(
                "This channel is not associated with any RSS feed."
            );
            return;
        }

        // Remove from memory
        removeFeedChannel(channel.id);

        // Get channel name before deleting
        const channelName = channel.name;

        // Delete the channel
        try {
            const channelToDelete = await guild.channels.fetch(channel.id);
            if (channelToDelete) {
                await channelToDelete.delete("RSS feed unsubscribed");
            }
        } catch (e) {
            console.error("Could not delete channel:", e);
        }

        await interaction.editReply(
            `Unsubscribed from **${channelName}** and deleted the channel.`
        );
    } catch (error) {
        console.error("Error removing feed:", error);
        await interaction.editReply(
            "An error occurred while removing the feed. Please try again."
        );
    }
}

async function handleListFeeds(
    interaction: ChatInputCommandInteraction
): Promise<void> {
    const guild = interaction.guild;

    if (!guild) {
        await interaction.reply("This command must be used in a server.");
        return;
    }

    // Find RSS category and list channels
    await guild.channels.fetch();
    const category = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory && c.name === "RSS"
    );

    if (!category) {
        await interaction.reply(
            "No feeds subscribed. Use `/feed add` to add one."
        );
        return;
    }

    const feedChannels = guild.channels.cache.filter(
        (c) => c.parentId === category.id && c.type === ChannelType.GuildText
    );

    if (feedChannels.size === 0) {
        await interaction.reply(
            "No feeds subscribed. Use `/feed add` to add one."
        );
        return;
    }

    const feedList = feedChannels
        .map((c) => {
            const topic = (c as TextChannel).topic || "";
            const url = topic.replace(/^RSS feed: /, "");
            return `- <#${c.id}>: ${url}`;
        })
        .join("\n");

    await interaction.reply(`**Subscribed Feeds:**\n${feedList}`);
}

function sanitizeChannelName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 100);
}
