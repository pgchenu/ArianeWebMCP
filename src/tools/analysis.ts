import type { ArianeWebClient } from "../clients/arianeweb.js";

export async function handleGetDecisionAnalysis(
  args: Record<string, unknown>,
  client: ArianeWebClient
): Promise<string> {
  const raw = args.id;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Le paramètre 'id' est requis");
  }
  const id = raw.trim();

  const analyse = await client.getAnalyse(id);

  const lines: string[] = [];
  lines.push("=== ANALYSE JURISPRUDENTIELLE ===");
  lines.push(`Décision n° ${analyse.decisionId}`);
  lines.push("");
  lines.push(analyse.texte);

  return lines.join("\n");
}
