// In-memory store for feed -> channel mappings
// Reconstructed from Discord channels on startup

const feedToChannel = new Map<number, string>(); // feed_id -> channel_id
const channelToFeed = new Map<string, number>(); // channel_id -> feed_id

export function setFeedChannel(feedId: number, channelId: string): void {
    feedToChannel.set(feedId, channelId);
    channelToFeed.set(channelId, feedId);
}

export function removeFeedChannel(channelId: string): void {
    const feedId = channelToFeed.get(channelId);
    if (feedId !== undefined) {
        feedToChannel.delete(feedId);
    }
    channelToFeed.delete(channelId);
}

export function getChannelForFeed(feedId: number): string | undefined {
    return feedToChannel.get(feedId);
}

export function getFeedForChannel(channelId: string): number | undefined {
    return channelToFeed.get(channelId);
}

export function getAllFeedChannels(): Map<number, string> {
    return new Map(feedToChannel);
}

export function clearStore(): void {
    feedToChannel.clear();
    channelToFeed.clear();
}
