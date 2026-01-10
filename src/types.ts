export interface FeedItem {
    id: number;
    title: string;
    url: string;
    author?: string;
    summary?: string;
    published: string;
    feed_id: number;
    images?: {
        original_url?: string;
        size_1?: {
            cdn_url?: string;
        };
    };
}

export interface Feed {
    id: number;
    title: string;
    feed_url: string;
    site_url: string;
}

export interface Icon {
    host: string;
    url: string;
}

export interface Subscription {
    id: number;
    feed_id: number;
    title: string;
    feed_url: string;
    site_url: string;
}
