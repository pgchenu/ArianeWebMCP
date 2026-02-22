import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ArianeWebClient } from "./clients/arianeweb.js";
import { OpenDataClient } from "./clients/opendata.js";
import { handleSearchDecisions } from "./tools/search.js";
import { handleGetDecision } from "./tools/decision.js";
import { handleGetConclusions } from "./tools/conclusions.js";
import { handleGetDecisionAnalysis } from "./tools/analysis.js";

// ---------------------------------------------------------------------------
// Définitions des outils
// ---------------------------------------------------------------------------

const SEARCH_DECISIONS_TOOL = {
  name: "search_decisions",
  description:
    "Recherche des décisions de juridictions administratives françaises par mots-clés juridiques, " +
    "dates ou numéro d'affaire. Par défaut, interroge uniquement le Conseil d'État et le Tribunal " +
    "des conflits (sources de droit de principe). Si aucun résultat A/B n'est trouvé, élargit " +
    "automatiquement la recherche aux Cours administratives d'appel. " +
    "Important : les décisions publiées depuis 2022 sont pseudonymisées — la recherche par nom " +
    "de partie est inefficace ; utiliser des mots-clés juridiques, des références législatives " +
    "ou des numéros d'affaire. Les résultats ne contiennent que les métadonnées — utiliser " +
    "get_decision pour obtenir le texte intégral.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Mots-clés juridiques, références de textes (ex: 'L761-1 CJA'), numéro d'affaire " +
          "(ex: '488011'). Éviter les noms de parties (pseudonymisation depuis 2022).",
      },
      jurisdiction: {
        type: "string",
        enum: ["CE+TC", "CE", "TC", "CAA", "TA"],
        description:
          "Juridiction cible. Défaut : 'CE+TC' (Conseil d'État + Tribunal des conflits). " +
          "'CAA' produit un volume élevé de résultats de portée limitée — utiliser avec parcimonie. " +
          "'TA' recherche dans tous les Tribunaux administratifs via OpenData (opt-in explicite).",
      },
      classification: {
        type: "string",
        enum: ["AB", "A", "B", "C"],
        description:
          "Classification des décisions : A (grande importance), B (signalées), C (autres). " +
          "Défaut : 'AB' — seuls A et B sont retournés, C uniquement si aucun A/B n'est trouvé.",
      },
      date_start: {
        type: "string",
        description: "Date de début (format YYYY-MM-DD). Filtre par année uniquement.",
      },
      date_end: {
        type: "string",
        description: "Date de fin (format YYYY-MM-DD). Non supporté précisément — utiliser date_start.",
      },
      page: {
        type: "number",
        description: "Numéro de page (défaut : 1).",
      },
      page_size: {
        type: "number",
        description: "Nombre de résultats par page (défaut : 10, max : 20).",
      },
    },
    required: ["query"],
  },
} as const;

const GET_DECISION_TOOL = {
  name: "get_decision",
  description:
    "Récupère le texte intégral d'une décision du Conseil d'État, d'une Cour administrative " +
    "d'appel ou du Tribunal des conflits, par son numéro d'affaire ou son identifiant ArianeWeb. " +
    "Les noms des parties peuvent être pseudonymisés si la décision est postérieure à 2022. " +
    "Les métadonnées incluent la disponibilité des conclusions du rapporteur public.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description:
          "Numéro d'affaire (ex: '488011') ou identifiant Sinequa interne. " +
          "Utiliser le numéro retourné par search_decisions.",
      },
    },
    required: ["id"],
  },
} as const;

const GET_CONCLUSIONS_TOOL = {
  name: "get_conclusions",
  description:
    "Récupère le texte intégral des conclusions du rapporteur public pour une décision du " +
    "Conseil d'État ou du Tribunal des conflits. Les conclusions sont disponibles uniquement " +
    "si 'conclusionsDisponibles' est true dans search_decisions ou get_decision. " +
    "Elles fournissent l'analyse juridique du rapporteur public, distincte de la décision elle-même. " +
    "Utiliser le numéro retourné par search_decisions.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description:
          "Numéro d'affaire (ex: '488011') ou identifiant Sinequa. " +
          "Utiliser le numéro retourné par search_decisions.",
      },
    },
    required: ["id"],
  },
} as const;

const GET_DECISION_ANALYSIS_TOOL = {
  name: "get_decision_analysis",
  description:
    "Récupère l'analyse jurisprudentielle d'une décision publiée au Recueil Lebon ou aux Tables " +
    "(décisions classifiées A ou B). Ces analyses synthétiques sont rédigées par les services " +
    "du Conseil d'État et résument la portée juridique de la décision. " +
    "Utiliser le numéro retourné par search_decisions.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description:
          "Numéro d'affaire (ex: '488011') ou identifiant Sinequa. " +
          "Utiliser le numéro retourné par search_decisions.",
      },
    },
    required: ["id"],
  },
} as const;

// ---------------------------------------------------------------------------
// Création du serveur
// ---------------------------------------------------------------------------

export function createServer(): Server {
  const client = new ArianeWebClient();
  const openDataClient = new OpenDataClient();

  const server = new Server(
    { name: "arianeweb-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // Liste des outils disponibles
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [SEARCH_DECISIONS_TOOL, GET_DECISION_TOOL, GET_CONCLUSIONS_TOOL, GET_DECISION_ANALYSIS_TOOL],
  }));

  // Exécution des outils
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      let text: string;

      switch (name) {
        case "search_decisions":
          text = await handleSearchDecisions(args as Record<string, unknown>, client, openDataClient);
          break;
        case "get_decision":
          text = await handleGetDecision(args as Record<string, unknown>, client, openDataClient);
          break;
        case "get_conclusions":
          text = await handleGetConclusions(args as Record<string, unknown>, client);
          break;
        case "get_decision_analysis":
          text = await handleGetDecisionAnalysis(args as Record<string, unknown>, client);
          break;
        default:
          return {
            content: [{ type: "text", text: `Outil inconnu : ${name}` }],
            isError: true,
          };
      }

      return { content: [{ type: "text", text }] };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Erreur : ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}
