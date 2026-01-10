declare module "bun" {
    interface Env {
        FEEDBIN_USERNAME: string;
        FEEDBIN_PASSWORD: string;
        DISCORD_BOT_TOKEN: string;
        DISCORD_CLIENT_ID: string;
        DISCORD_GUILD_ID: string;
    }
}