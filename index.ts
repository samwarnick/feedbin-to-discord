const FEEDBIN_USERNAME = Bun.env.FEEDBIN_USERNAME || "";
const FEEDBIN_PASSWORD = Bun.env.FEEDBIN_PASSWORD || "";
const DISCORD_WEBHOOK_URL = Bun.env.DISCORD_WEBHOOK_URL || "";
const CHECK_INTERVAL = 2 * 60 * 1000; // 5 minutes

let etag: string | null = null;
let lastModified: string | null = null;

interface FeedItem {
    id: number;
    title: string;
    url: string;
    author?: string;
    summary?: string;
    published: string;
    feed_id: number;
    images?: {
        original_url?: string;
        size_1?: string;
        size_2?: string;
        size_3?: string;
    };
}

interface Feed {
    id: number;
    title: string;
    feed_url: string;
    site_url: string;
}

const feedCache = new Map<number, Feed>();

const authHeader = `Basic ${btoa(`${FEEDBIN_USERNAME}:${FEEDBIN_PASSWORD}`)}`;

async function getFeed(feedId: number): Promise<Feed | null> {
    if (feedCache.has(feedId)) {
        return feedCache.get(feedId)!;
    }

    try {
        const res = await fetch(`https://api.feedbin.com/v2/feeds/${feedId}.json`, {
            headers: { Authorization: authHeader },
        });

        if (res.ok) {
            const feed = await res.json() as Feed;
            feedCache.set(feedId, feed);
            return feed;
        }
    } catch (e) {
        console.error(`Error fetching feed ${feedId}:`, e);
    }

    return null;
}

async function checkForNewItems() {
    try {
        const headers: Record<string, string> = {
            Authorization: authHeader,
        };

        if (etag) {
            headers["If-None-Match"] = etag;
        }
        if (lastModified) {
            headers["If-Modified-Since"] = lastModified;
        }

        const res = await fetch("https://api.feedbin.com/v2/entries.json?read=false&include_original=true&mode=extended&per_page=50", {
            headers,
        });

        const newEtag = res.headers.get("ETag");
        const newLastModified = res.headers.get("Last-Modified");

        if (newEtag) etag = newEtag;
        if (newLastModified) lastModified = newLastModified;

        if (res.status === 304) {
            console.log("No new items (304 Not Modified)");
            return;
        }

        if (!res.ok) {
            console.error(`Feedbin API error: ${res.status}`);
            return;
        }

        const items = await res.json() as FeedItem[];

        if (items.length === 0) {
            console.log("No new items");
            return;
        }

        console.log(`Found ${items.length} new items`);

        for (const item of items) {
            await postToDiscord(item);
            await Bun.sleep(500); // Rate limit
        }
    } catch (e) {
        console.error("Error checking items:", e);
    }
}

async function postToDiscord(item: FeedItem) {
    try {
        const feed = await getFeed(item.feed_id);
        const feedName = feed ? feed.title : `Feed ${item.feed_id}`;

        const embed: any = {
            title: item.title.slice(0, 256),
            url: item.url,
            description: item.summary?.slice(0, 500) || "",
            author: {
                name: feedName,
            },
            timestamp: item.published,
            color: 0x5865f2,
            footer: {
                text: item.author || "",
            },
        };

        if (item.images) {
            const imageUrl = item.images.original_url || item.images.size_3 || item.images.size_2 || item.images.size_1;
            if (imageUrl) {
                embed.image = { url: imageUrl };
            }
        }

        await fetch(DISCORD_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ embeds: [embed] }),
        });

        console.log(`Posted: ${item.title}`);

        await markAsRead(item.id);
    } catch (e) {
        console.error("Error posting to Discord:", e);
    }
}

async function markAsRead(entryId: number) {
    try {
        const res = await fetch("https://api.feedbin.com/v2/unread_entries.json", {
            method: "DELETE",
            headers: {
                Authorization: authHeader,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ unread_entries: [entryId] }),
        });

        if (res.ok) {
            console.log(`Marked entry ${entryId} as read`);
        } else {
            console.error(`Failed to mark entry ${entryId} as read: ${res.status}`);
        }
    } catch (e) {
        console.error("Error marking as read:", e);
    }
}

async function main() {
    if (!FEEDBIN_USERNAME || !FEEDBIN_PASSWORD) {
        console.error("Error: FEEDBIN_USERNAME and FEEDBIN_PASSWORD must be set");
        process.exit(1);
    }

    if (!DISCORD_WEBHOOK_URL) {
        console.error("Error: DISCORD_WEBHOOK_URL must be set");
        process.exit(1);
    }

    console.log("Starting Feedbin to Discord bot...");
    console.log(`Checking every ${CHECK_INTERVAL / 1000} seconds`);

    await checkForNewItems();

    setInterval(checkForNewItems, CHECK_INTERVAL);
}

main();