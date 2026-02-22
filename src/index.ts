#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

// Capturer toutes les erreurs non gérées pour le debug dans Claude Desktop
process.on("uncaughtException", (err) => {
  process.stderr.write(`[arianeweb-mcp] uncaughtException: ${err.stack ?? err.message}\n`);
});
process.on("unhandledRejection", (reason) => {
  process.stderr.write(`[arianeweb-mcp] unhandledRejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}\n`);
});

async function main(): Promise<void> {
  process.stderr.write(`[arianeweb-mcp] Starting, Node ${process.version}\n`);
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[arianeweb-mcp] Connected, waiting for messages\n`);
}

main().catch((err) => {
  process.stderr.write(`[arianeweb-mcp] Erreur fatale : ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
