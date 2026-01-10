import { config } from "./config.ts";
import type { Feed, FeedItem, Icon, Subscription } from "./types.ts";

const authHeader = `Basic ${btoa(`${config.feedbin.username}:${config.feedbin.password}`)}`;

const feedCache = new Map<number, Feed>();
const iconCache = new Map<string, Icon>();

let etag: string | null = null;
let lastModified: string | null = null;

export async function getFeed(feedId: number): Promise<Feed | null> {
    if (feedCache.has(feedId)) {
        return feedCache.get(feedId)!;
    }

    try {
        const res = await fetch(
            `https://api.feedbin.com/v2/feeds/${feedId}.json`,
            {
                headers: { Authorization: authHeader },
            }
        );

        if (res.ok) {
            const feed = (await res.json()) as Feed;
            feedCache.set(feedId, feed);
            return feed;
        }
    } catch (e) {
        console.error(`Error fetching feed ${feedId}:`, e);
    }

    return null;
}

export async function getIcons(): Promise<void> {
    try {
        const res = await fetch(`https://api.feedbin.com/v2/icons.json`, {
            headers: { Authorization: authHeader },
        });

        if (res.ok) {
            const icons = (await res.json()) as Icon[];
            for (const icon of icons) {
                iconCache.set(icon.host, icon);
            }
            console.log(`Loaded ${icons.length} feed icons`);
        }
    } catch (e) {
        console.error("Error fetching icons:", e);
    }
}

export function getIconForHost(host: string): Icon | undefined {
    return iconCache.get(host);
}

export async function fetchUnreadEntries(): Promise<FeedItem[]> {
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

        const res = await fetch(
            "https://api.feedbin.com/v2/entries.json?read=false&include_original=true&mode=extended&per_page=50",
            { headers }
        );

        const newEtag = res.headers.get("ETag");
        const newLastModified = res.headers.get("Last-Modified");

        if (newEtag) etag = newEtag;
        if (newLastModified) lastModified = newLastModified;

        if (res.status === 304) {
            return [];
        }

        if (!res.ok) {
            console.error(`Feedbin API error: ${res.status}`);
            return [];
        }

        return (await res.json()) as FeedItem[];
    } catch (e) {
        console.error("Error fetching entries:", e);
        return [];
    }
}

export async function markAsRead(entryIds: number[]): Promise<void> {
    if (entryIds.length === 0) return;

    try {
        const res = await fetch(
            "https://api.feedbin.com/v2/unread_entries.json",
            {
                method: "DELETE",
                headers: {
                    Authorization: authHeader,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ unread_entries: entryIds }),
            }
        );

        if (res.ok) {
            console.log(`Marked entries ${entryIds.join(", ")} as read`);
        } else {
            console.error(
                `Failed to mark entries as read: ${res.status}`
            );
        }
    } catch (e) {
        console.error("Error marking as read:", e);
    }
}

export interface SubscribeResult {
    success: boolean;
    subscription?: Subscription;
    error?: string;
}

export async function subscribeToFeed(url: string): Promise<SubscribeResult> {
    try {
        const res = await fetch(
            "https://api.feedbin.com/v2/subscriptions.json",
            {
                method: "POST",
                headers: {
                    Authorization: authHeader,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ feed_url: url }),
            }
        );

        if (res.status === 201) {
            const subscription = (await res.json()) as Subscription;
            return { success: true, subscription };
        }

        if (res.status === 302) {
            // Feed already exists, fetch from Location header
            const location = res.headers.get("Location");
            if (location) {
                const existingRes = await fetch(location, {
                    headers: { Authorization: authHeader },
                });
                if (existingRes.ok) {
                    const subscription = (await existingRes.json()) as Subscription;
                    return { success: true, subscription };
                }
            }
            return { success: false, error: "Feed exists but could not fetch details" };
        }

        if (res.status === 404) {
            return { success: false, error: "Feed URL not found or not a valid RSS feed" };
        }

        if (res.status === 422) {
            return { success: false, error: "Invalid feed URL format" };
        }

        return { success: false, error: `Feedbin API error: ${res.status}` };
    } catch (e) {
        console.error("Error subscribing to feed:", e);
        return { success: false, error: "Network error subscribing to feed" };
    }
}

export async function getSubscriptions(): Promise<Subscription[]> {
    try {
        const res = await fetch(
            "https://api.feedbin.com/v2/subscriptions.json",
            {
                headers: { Authorization: authHeader },
            }
        );

        if (res.ok) {
            return (await res.json()) as Subscription[];
        }
    } catch (e) {
        console.error("Error fetching subscriptions:", e);
    }
    return [];
}

export async function findSubscriptionByUrl(
    url: string
): Promise<Subscription | null> {
    const subscriptions = await getSubscriptions();
    return subscriptions.find((s) => s.feed_url === url) ?? null;
}
