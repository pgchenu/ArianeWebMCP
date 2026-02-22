import { ArianeWebClient } from "../clients/arianeweb.js";
import { OpenDataClient } from "../clients/opendata.js";
import type { DecisionMetadata } from "../types/decision.js";
import type { SearchParams } from "../types/search.js";

// ---------------------------------------------------------------------------
// Tri par classification : A > B > C > non classifié
// ---------------------------------------------------------------------------

const CLASSIF_ORDER = { A: 0, B: 1, C: 2 } as const;

function sortByClassification(decisions: DecisionMetadata[]): DecisionMetadata[] {
  return [...decisions].sort((a, b) => {
    const oa = a.classification !== undefined ? CLASSIF_ORDER[a.classification] : 3;
    const ob = b.classification !== undefined ? CLASSIF_ORDER[b.classification] : 3;
    return oa - ob;
  });
}

// ---------------------------------------------------------------------------
// Formatage
// ---------------------------------------------------------------------------

function formatDecision(d: DecisionMetadata, idx: number): string {
  const classifTag = d.classification ? `[${d.classification}] ` : "";
  const lines: string[] = [
    `${idx}. ${classifTag}**${d.numero || d.id}** — ${d.date}`,
    `   ${d.juridiction}${d.formation ? ` | ${d.formation}` : ""}`,
  ];
  if (d.parties) lines.push(`   Parties : ${d.parties}`);
  if (d.extrait) lines.push(`   ${d.extrait}`);
  lines.push(`   Conclusions : ${d.conclusionsDisponibles ? "disponibles" : "non disponibles"}`);
  if (d.lien) lines.push(`   ${d.lien}`);
  return lines.join("\n");
}

function formatResult(
  decisions: DecisionMetadata[],
  total: number,
  page: number,
  opts: { fallback: boolean; noAbFound: boolean }
): string {
  const header: string[] = [];

  if (opts.fallback) {
    header.push(
      "ℹ️ Aucun résultat A/B au Conseil d'État et Tribunal des conflits — recherche élargie aux Cours administratives d'appel."
    );
  }

  if (decisions.length === 0) {
    return [...header, "Aucune décision trouvée pour ces critères."].join("\n");
  }

  header.push(`${decisions.length} décision(s) affichée(s) (${total} au total) — page ${page}`);

  if (opts.noAbFound) {
    header.push("Remarque : aucun résultat A ou B — seules des décisions C sont affichées.");
  }

  const items = decisions.map((d, i) => formatDecision(d, i + 1));
  return [...header, "", ...items].join("\n");
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

export async function handleSearchDecisions(
  args: Record<string, unknown>,
  client: ArianeWebClient,
  openDataClient: OpenDataClient
): Promise<string> {
  const pageSize = typeof args.page_size === "number" ? Math.min(args.page_size, 20) : 10;

  const params: SearchParams = {
    query: String(args.query ?? ""),
    jurisdiction: (args.jurisdiction as SearchParams["jurisdiction"]) ?? "CE+TC",
    classification: (args.classification as SearchParams["classification"]) ?? "AB",
    date_start: args.date_start !== undefined ? String(args.date_start) : undefined,
    date_end: args.date_end !== undefined ? String(args.date_end) : undefined,
    page: typeof args.page === "number" ? args.page : 1,
    page_size: pageSize,
  };

  // Les TA sont accessibles uniquement via OpenData (opt-in explicite)
  if (params.jurisdiction === "TA") {
    const result = await openDataClient.search(params);
    const decisions = sortByClassification(result.decisions).slice(0, pageSize);
    const noAbFound = params.classification !== "C" && decisions.every(
      (d) => d.classification !== "A" && d.classification !== "B"
    );
    return formatResult(decisions, result.total, result.page, { fallback: false, noAbFound });
  }

  const result = await client.search(params);
  let decisions = sortByClassification(result.decisions);

  const isDefaultJurisdiction = !args.jurisdiction || args.jurisdiction === "CE+TC";
  const wantOnlyC = params.classification === "C";
  let fallback = false;
  let noAbFound = false;

  if (!wantOnlyC) {
    const abDecisions = decisions.filter(
      (d) => d.classification === "A" || d.classification === "B"
    );

    if (abDecisions.length === 0 && isDefaultJurisdiction) {
      // Fallback : élargir aux CAA
      const caaResult = await client.search({ ...params, jurisdiction: "CAA" });
      decisions = sortByClassification([...decisions, ...caaResult.decisions]).slice(0, pageSize);
      fallback = true;
    } else if (abDecisions.length > 0) {
      decisions = abDecisions;
    } else {
      // Juridiction spécifique, pas d'A/B → afficher C en signalant
      noAbFound = true;
    }
  }

  return formatResult(decisions, result.total, result.page, { fallback, noAbFound });
}
