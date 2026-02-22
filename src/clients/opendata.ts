/**
 * Client HTTP pour l'API OpenData justice-administrative.fr.
 *
 * Endpoint principal : https://opendata.justice-administrative.fr/recherche/api
 *
 * Routes utilisées :
 *   - Recherche : GET /model_search_juri/openData/{juriEncoded}/{keyword}/{limit}
 *   - Décision  : GET /testView/openData/vu/{Identification}/{Code_Juridiction}/{Numero_Dossier}
 *
 * Format d'id interne : "{Code_Juridiction}:{Numero_Dossier}:{Identification_sans_ext}"
 * Exemple : "TA76:2600849:ORTA_2600849_20260218"
 *
 * Couverture : TA et CAA uniquement (CE et TC ne sont pas publiés sur OpenData).
 */

import type {
  DecisionMetadata,
  DecisionComplete,
  Juridiction,
} from "../types/decision.js";
import type { SearchParams, SearchResult } from "../types/search.js";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const BASE_URL = "https://opendata.justice-administrative.fr/recherche/api";

/** Délai minimum entre requêtes (ms) — respect des CGU */
const RATE_LIMIT_MS = 500;

/**
 * Chaîne de tous les codes de Tribunaux Administratifs pour le filtre
 * de juridiction de l'API OpenData.
 */
const ALL_TA =
  "TA06 OR TA101 OR TA102 OR TA103 OR TA104 OR TA105 OR TA106 OR TA108 OR " +
  "TA109 OR TA13 OR TA14 OR TA20 OR TA21 OR TA25 OR TA30 OR TA31 OR TA33 OR " +
  "TA34 OR TA35 OR TA38 OR TA44 OR TA45 OR TA51 OR TA54 OR TA59 OR TA63 OR " +
  "TA64 OR TA67 OR TA69 OR TA107 OR TA75 OR TA76 OR TA77 OR TA78 OR TA80 OR " +
  "TA83 OR TA86 OR TA87 OR TA93 OR TA95";

/**
 * Chaîne de tous les codes de Cours Administratives d'Appel pour le filtre
 * de juridiction de l'API OpenData.
 */
const ALL_CAA =
  "CAA33 OR CAA59 OR CAA69 OR CAA13 OR CAA54 OR CAA44 OR CAA75 OR CAA31 OR CAA78";

// ---------------------------------------------------------------------------
// Types internes (réponse de l'API OpenData)
// ---------------------------------------------------------------------------

interface OpenDataSource {
  Identification: string;
  Code_Juridiction: string;
  Nom_Juridiction: string;
  Numero_ECLI: string;
  Code_Publication: string;
  Formation_Jugement: string;
  Numero_Dossier: string;
  Type_Decision: string;
  Date_Lecture: string;
  lastModified: string;
}

interface OpenDataHit {
  _id: string;
  _source: OpenDataSource;
  highlight: { paragraph: string[] } | null;
}

interface OpenDataHits {
  total: { value: number };
  hits: OpenDataHit[];
}

interface OpenDataBody {
  hits: OpenDataHits;
}

interface OpenDataDecisions {
  body: OpenDataBody;
}

interface OpenDataResponse {
  decisions: OpenDataDecisions;
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

let _lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - _lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, RATE_LIMIT_MS - elapsed)
    );
  }
  _lastRequestTime = Date.now();
  return fetch(url);
}

/**
 * Supprime les balises HTML d'une chaîne (inclut les balises `<mark>` du
 * highlighting Elasticsearch).
 */
function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

/**
 * Convertit un code juridiction OpenData en type `Juridiction`.
 *
 * @example
 * parseJuridictionCode("TA76")  // → "TA"
 * parseJuridictionCode("CAA13") // → "CAA"
 */
function parseJuridictionCode(code: string): Juridiction {
  if (code.startsWith("CAA")) return "CAA";
  if (code.startsWith("TA")) return "TA";
  return "CE";
}

/**
 * Construit le `DecisionMetadata` à partir d'un hit OpenData.
 */
function toDecisionMetadata(hit: OpenDataHit): DecisionMetadata {
  const src = hit._source;
  const identSansExt = src.Identification.replace(/\.xml$/, "");
  const id = `${src.Code_Juridiction}:${src.Numero_Dossier}:${identSansExt}`;

  const classif = src.Code_Publication;
  const classification =
    classif === "A" || classif === "B" || classif === "C" ? classif : undefined;

  const formation =
    src.Formation_Jugement && src.Formation_Jugement !== "undefined"
      ? src.Formation_Jugement
      : undefined;

  return {
    id,
    numero: src.Numero_Dossier,
    date: src.Date_Lecture,
    juridiction: parseJuridictionCode(src.Code_Juridiction),
    formation,
    parties: undefined,
    classification,
    extrait: undefined,
    conclusionsDisponibles: false,
    lien: `https://opendata.justice-administrative.fr/recherche/${src.Code_Juridiction}`,
  };
}

// ---------------------------------------------------------------------------
// Parsing de l'id interne
// ---------------------------------------------------------------------------

interface ParsedOpenDataId {
  codeJuridiction: string;
  numeroDossier: string;
  identification: string;
}

// ---------------------------------------------------------------------------
// OpenDataClient
// ---------------------------------------------------------------------------

export class OpenDataClient {
  /**
   * Recherche des décisions dans la base OpenData.
   *
   * La juridiction doit être "TA" ou "CAA". Toute autre valeur (y compris
   * l'absence de paramètre) est traitée comme "TA" par défaut, car CE et TC
   * ne sont pas disponibles sur l'API OpenData.
   *
   * @example
   * const client = new OpenDataClient();
   * const results = await client.search({ query: "urbanisme", jurisdiction: "CAA" });
   */
  async search(params: SearchParams): Promise<SearchResult> {
    const {
      query,
      jurisdiction,
      page = 1,
      page_size = 20,
    } = params;

    // L'API OpenData ne supporte pas l'offset — on ne peut retourner que page 1.
    const limit = Math.min(page_size, 20);

    let juriString: string;
    if (jurisdiction === "CAA") {
      juriString = ALL_CAA;
    } else {
      // TA par défaut (CE et TC ne sont pas disponibles sur OpenData)
      juriString = ALL_TA;
    }

    const juriEncoded = encodeURIComponent(juriString);
    const keywordEncoded = encodeURIComponent(query);
    const url = `${BASE_URL}/model_search_juri/openData/${juriEncoded}/${keywordEncoded}/${limit}`;

    const response = await rateLimitedFetch(url);
    if (!response.ok) {
      throw new Error(`OpenData API HTTP ${response.status} pour la recherche`);
    }

    const data = (await response.json()) as OpenDataResponse;
    const hitsObj = data.decisions.body.hits;
    const decisions = hitsObj.hits.map(toDecisionMetadata);

    return {
      total: hitsObj.total.value,
      page,
      page_size: limit,
      decisions,
    };
  }

  /**
   * Récupère le texte intégral d'une décision par son id OpenData.
   *
   * L'id doit être au format `{Code_Juridiction}:{Numero_Dossier}:{Identification_sans_ext}`.
   *
   * @example
   * const client = new OpenDataClient();
   * const decision = await client.getDecision("TA76:2600849:ORTA_2600849_20260218");
   */
  async getDecision(id: string): Promise<DecisionComplete> {
    const parsed = OpenDataClient.parseId(id);
    const { codeJuridiction, numeroDossier, identification } = parsed;
    const identificationXml = `${identification}.xml`;

    const identEncoded = encodeURIComponent(identificationXml);
    const juriEncoded = encodeURIComponent(codeJuridiction);
    const numEncoded = encodeURIComponent(numeroDossier);
    const url = `${BASE_URL}/testView/openData/vu/${identEncoded}/${juriEncoded}/${numEncoded}`;

    const response = await rateLimitedFetch(url);
    if (!response.ok) {
      throw new Error(`OpenData API HTTP ${response.status} pour id=${id}`);
    }

    const data = (await response.json()) as OpenDataResponse;
    const hits = data.decisions.body.hits.hits;

    if (hits.length === 0) {
      throw new Error(`Décision introuvable : ${id}`);
    }

    const hit = hits[0];

    if (!hit.highlight) {
      throw new Error("Texte de la décision non disponible");
    }

    const rawParagraphs = hit.highlight.paragraph[0]
      .split("$$$")
      .map((p) => stripHtml(p).trim())
      .filter((p) => p.length > 0);

    const texteIntegral = rawParagraphs.join("\n\n");
    const meta = toDecisionMetadata(hit);

    return {
      ...meta,
      texteIntegral,
    };
  }

  // ---------------------------------------------------------------------------
  // Méthodes statiques
  // ---------------------------------------------------------------------------

  /**
   * Retourne `true` si `id` est au format OpenData :
   * commence par "TA" ou "CAA" suivi de chiffres, puis contient des `:`.
   *
   * @example
   * OpenDataClient.isOpenDataId("TA76:2600849:ORTA_2600849_20260218") // true
   * OpenDataClient.isOpenDataId("/Ariane_Web/AW_DCE/|488011")          // false
   */
  static isOpenDataId(id: string): boolean {
    return /^(?:TA|CAA)\d+:/.test(id);
  }

  /**
   * Décompose un id OpenData en ses trois composantes.
   *
   * @throws {Error} si le format est invalide
   *
   * @example
   * OpenDataClient.parseId("TA76:2600849:ORTA_2600849_20260218")
   * // → { codeJuridiction: "TA76", numeroDossier: "2600849", identification: "ORTA_2600849_20260218" }
   */
  static parseId(id: string): ParsedOpenDataId {
    const parts = id.split(":");
    if (parts.length !== 3) {
      throw new Error(
        `Format d'id OpenData invalide : "${id}". ` +
          'Attendu : "{Code_Juridiction}:{Numero_Dossier}:{Identification_sans_ext}"'
      );
    }
    const [codeJuridiction, numeroDossier, identification] = parts as [
      string,
      string,
      string,
    ];
    return { codeJuridiction, numeroDossier, identification };
  }
}
