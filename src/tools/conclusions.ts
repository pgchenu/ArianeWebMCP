import type { ArianeWebClient } from "../clients/arianeweb.js";

export async function handleGetConclusions(
  args: Record<string, unknown>,
  client: ArianeWebClient
): Promise<string> {
  const raw = args.id;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Le paramètre 'id' est requis");
  }
  const id = raw.trim();

  const conclusions = await client.getConclusions(id);

  const lines: string[] = [];
  lines.push("=== CONCLUSIONS DU RAPPORTEUR PUBLIC ===");
  lines.push(`Décision n° ${conclusions.decisionId}`);
  if (conclusions.rapporteurPublic) {
    lines.push(`Rapporteur public : ${conclusions.rapporteurPublic}`);
  }
  lines.push("");
  lines.push(conclusions.texte);

  return lines.join("\n");
}
