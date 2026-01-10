export const config = {
    feedbin: {
        username: Bun.env.FEEDBIN_USERNAME || "",
        password: Bun.env.FEEDBIN_PASSWORD || "",
    },
    discord: {
        token: Bun.env.DISCORD_BOT_TOKEN || "",
        clientId: Bun.env.DISCORD_CLIENT_ID || "",
        guildId: Bun.env.DISCORD_GUILD_ID || "",
    },
    checkInterval: 2 * 60 * 1000, // 2 minutes
};

export function validateConfig(): void {
    const errors: string[] = [];

    if (!config.feedbin.username) {
        errors.push("FEEDBIN_USERNAME is required");
    }
    if (!config.feedbin.password) {
        errors.push("FEEDBIN_PASSWORD is required");
    }
    if (!config.discord.token) {
        errors.push("DISCORD_BOT_TOKEN is required");
    }
    if (!config.discord.clientId) {
        errors.push("DISCORD_CLIENT_ID is required");
    }
    if (!config.discord.guildId) {
        errors.push("DISCORD_GUILD_ID is required");
    }

    if (errors.length > 0) {
        console.error("Configuration errors:");
        errors.forEach((e) => console.error(`  - ${e}`));
        process.exit(1);
    }
}
