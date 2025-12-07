declare module "bun" {
    interface Env {
        FEEDBIN_USERNAME: string;
        FEEDBIN_PASSWORD: string;
        DISCORD_WEBHOOK_URL: string;
    }
}