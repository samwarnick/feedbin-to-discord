import { EmbedBuilder } from "discord.js";
import type { FeedItem } from "./types.ts";
import { getFeed, getIconForHost } from "./feedbin.ts";

export async function createEmbed(item: FeedItem): Promise<EmbedBuilder> {
    const feed = await getFeed(item.feed_id);
    const feedName = feed ? feed.title : `Feed ${item.feed_id}`;
    const feedUrl = feed?.site_url || "";
    const iconCacheKey = feedUrl.replace(/^https?:\/\//, "");
    const icon = getIconForHost(iconCacheKey);

    const embed = new EmbedBuilder()
        .setURL(item.url)
        .setAuthor({
            name: feedName,
            url: feedUrl || undefined,
            iconURL: icon?.url,
        })
        .setTimestamp(new Date(item.published))
        .setColor(0x5865f2);

    if (item.title) {
        embed.setTitle(item.title.slice(0, 256));
    }

    if (item.summary) {
        embed.setDescription(item.summary.slice(0, 500));
    }

    if (item.author) {
        embed.setFooter({ text: item.author });
    }

    if (item.images) {
        const imageUrl = item.images.size_1?.cdn_url || item.images.original_url;
        if (imageUrl) {
            embed.setImage(imageUrl);
        }
    }

    return embed;
}
