import { ArianeWebClient } from "../clients/arianeweb.js";
import { OpenDataClient } from "../clients/opendata.js";
import type { DecisionComplete } from "../types/decision.js";

// ---------------------------------------------------------------------------
// Formatage
// ---------------------------------------------------------------------------

function formatDecision(d: DecisionComplete): string {
  const lines: string[] = [
    `# Décision N° ${d.numero || d.id} — ${d.date}`,
    "",
    `**Juridiction** : ${d.juridiction}${d.formation ? ` | ${d.formation}` : ""}`,
  ];

  if (d.parties) lines.push(`**Parties** : ${d.parties}`);
  if (d.classification) lines.push(`**Classification** : ${d.classification}`);
  if (d.rapporteur) lines.push(`**Rapporteur** : ${d.rapporteur}`);
  if (d.rapporteurPublic) lines.push(`**Rapporteur public** : ${d.rapporteurPublic}`);

  const conclusionsInfo = d.conclusionsDisponibles
    ? `disponibles${d.lienConclusions ? ` — ${d.lienConclusions}` : ""}`
    : "non disponibles";
  lines.push(`**Conclusions** : ${conclusionsInfo}`);

  if (d.lien) lines.push(`**Lien** : ${d.lien}`);
  if (d.motsCles?.length) lines.push(`**Mots-clés** : ${d.motsCles.join(", ")}`);

  lines.push("", "---", "", d.texteIntegral);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

export async function handleGetDecision(
  args: Record<string, unknown>,
  client: ArianeWebClient,
  openDataClient: OpenDataClient
): Promise<string> {
  const id = String(args.id ?? "").trim();
  if (!id) {
    throw new Error("Le paramètre 'id' est requis (numéro d'affaire ou URL ArianeWeb).");
  }

  const decision = OpenDataClient.isOpenDataId(id)
    ? await openDataClient.getDecision(id)
    : await client.getDecision(id);

  return formatDecision(decision);
}
