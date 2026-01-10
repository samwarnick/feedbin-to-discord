import { validateConfig } from "./config.ts";
import { startBot, stopBot } from "./bot.ts";

async function main(): Promise<void> {
    console.log("Starting Feedbin to Discord bot...");

    // Validate configuration
    validateConfig();

    // Start the Discord bot
    await startBot();
}

// Graceful shutdown
process.on("SIGTERM", () => {
    console.log("Received SIGTERM, shutting down...");
    stopBot();
    process.exit(0);
});

process.on("SIGINT", () => {
    console.log("Received SIGINT, shutting down...");
    stopBot();
    process.exit(0);
});

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
