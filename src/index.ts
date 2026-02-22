#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Le serveur tourne jusqu'à fermeture du flux stdio
}

main().catch((err) => {
  process.stderr.write(`Erreur fatale : ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
