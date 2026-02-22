/**
 * Client HTTP pour l'API non officielle ArianeWeb (conseil-etat.fr).
 *
 * Endpoint principal : POST/GET https://www.conseil-etat.fr/xsearch?type=json
 * Téléchargement documents : https://www.conseil-etat.fr/plugin?plugin=Service.downloadFilePagePlugin
 *
 * ⚠️ COUCHE GELÉE — ne pas modifier après validation des tests d'intégration.
 *
 * Découvertes reverse engineering (Phase 1) :
 * - L'API Sinequa renvoie 20 résultats par page (SkipFrom pour l'offset)
 * - Les décisions sont en HTML encodé iso-8859-1
 * - Les conclusions sont en PDF (pas HTML — hypothèse project.md incorrecte)
 * - Les analyses (AJCE) sont en HTML
 * - Le filtre de date précis n'est pas supporté en GET ; SourceInt1=YEAR filtre par année
 */

import * as cheerio from "cheerio";
import { PDFParse } from "pdf-parse";
import type {
  DecisionMetadata,
  DecisionComplete,
  Conclusions,
  Analyse,
  Juridiction,
} from "../types/decision.js";
import type { SearchParams, SearchResult } from "../types/search.js";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const BASE_URL = "https://www.conseil-etat.fr";
const XSEARCH_URL = `${BASE_URL}/xsearch?type=json`;
const DOWNLOAD_URL = `${BASE_URL}/plugin?plugin=Service.downloadFilePagePlugin&Index=Ariane_Web`;
const ARIANEWEB_BASE = "https://www.conseil-etat.fr/fr/arianeweb";

/** Délai minimum entre requêtes (ms) — respect des CGU */
const RATE_LIMIT_MS = 500;

/** Codes source Sinequa par juridiction */
const SOURCE_CODES: Record<string, string> = {
  CE: "AW_DCE",
  CAA: "AW_DCA",
  TC: "AW_DTC",
};

// ---------------------------------------------------------------------------
// Mapping des champs Sinequa (extrait du JS ArianeWeb)
// ---------------------------------------------------------------------------

const FIELD = {
  JURIDICTION: "SourceStr3",
  FOND: "SourceStr4",
  DEC_ID: "SourceStr5",
  NUMROLE: "SourceStr6",
  FORMATION: "SourceStr7",
  REFBIB: "SourceStr8",      // Classification A/B/C
  DEGRE: "SourceStr9",
  REQ: "SourceStr13",        // Requérant
  DEF: "SourceStr15",        // Défendeur
  RAP: "SourceStr16",        // Rapporteur
  PDT: "SourceStr17",        // Président
  CDG: "SourceStr18",        // Rapporteur public (ex-commissaire du gouvernement)
  ABSTRACT: "SourceStr21",   // Résumé court (présent dans les résultats de recherche)
  ECLI_ID: "SourceStr30",
  PERMLINK: "SourceStr39",   // Base du lien permanent : /CE/decision/ | /TC/decision/ | /CAA/decision/
  AFF_ID: "SourceCsv1",      // Numéro(s) d'affaire, séparés par ; si jointure
  ANNEE: "SourceInt1",       // Année de lecture
  ANALYSE_ID: "SourceCsv6",  // ID Sinequa du doc d'analyse (AW_AJCE)
  CONCLUSION_ID: "SourceCsv7", // ID Sinequa du PDF de conclusions (AW_CRP)
  DATE_LEC: "SourceDateTime1", // Date de lecture ISO
  SINEQUA_ID: "Id",          // ID interne Sinequa : /Ariane_Web/AW_DCE/|XXXXXX
} as const;

// ---------------------------------------------------------------------------
// Types internes Sinequa
// ---------------------------------------------------------------------------

interface SinequaDocument {
  Id: string;
  [key: string]: string | number | undefined;
}

interface SinequaResponse {
  TotalCount: number;
  DocumentsPerPage: number;
  Documents: SinequaDocument[];
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

let _lastRequestTime = 0;

async function rateLimitedFetch(url: string, init?: RequestInit): Promise<Response> {
  const now = Date.now();
  const elapsed = now - _lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  _lastRequestTime = Date.now();
  return fetch(url, init);
}

function encodeId(sinequaId: string): string {
  return encodeURIComponent(sinequaId);
}

function decodeIso8859(buffer: Buffer): string {
  return buffer.toString("latin1");
}

function parseDecisionHtml(html: string): {
  texteIntegral: string;
  rapporteur?: string;
  rapporteurPublic?: string;
  motsCles?: string[];
} {
  const $ = cheerio.load(html);
  const texteIntegral = $("body").text().replace(/\s+/g, " ").trim();
  return { texteIntegral };
}

function parseAnalyseHtml(html: string): string {
  const $ = cheerio.load(html);
  return $("body").text().replace(/\s+/g, " ").trim();
}

function buildLien(sinequaDoc: SinequaDocument): string {
  const permlink = sinequaDoc[FIELD.PERMLINK] as string | undefined;
  const dateLec = sinequaDoc[FIELD.DATE_LEC] as string | undefined;
  const affId = (sinequaDoc[FIELD.AFF_ID] as string | undefined)?.split(";")[0];
  if (!permlink || !dateLec || !affId) return "";
  const date = dateLec.split(" ")[0]; // YYYY-MM-DD
  return `${ARIANEWEB_BASE}${permlink}${date}/${affId}`;
}

function parseJuridiction(fondCode: string): Juridiction {
  switch (fondCode) {
    case "AW_DCE": return "CE";
    case "AW_DCA": return "CAA";
    case "AW_DTC": return "TC";
    default: return "CE";
  }
}

function toDecisionMetadata(doc: SinequaDocument): DecisionMetadata {
  const fondCode = doc[FIELD.FOND] as string;
  const affId = doc[FIELD.AFF_ID] as string | undefined;
  const classif = doc[FIELD.REFBIB] as string | undefined;
  return {
    id: doc[FIELD.SINEQUA_ID] as string,
    numero: affId ?? "",
    date: (doc[FIELD.DATE_LEC] as string)?.split(" ")[0] ?? "",
    juridiction: parseJuridiction(fondCode),
    formation: doc[FIELD.FORMATION] as string | undefined,
    parties: buildParties(doc),
    classification: (classif === "A" || classif === "B" || classif === "C") ? classif : undefined,
    extrait: (doc[FIELD.ABSTRACT] as string | undefined)?.substring(0, 300),
    conclusionsDisponibles: Boolean(doc[FIELD.CONCLUSION_ID]),
    lien: buildLien(doc),
  };
}

function buildParties(doc: SinequaDocument): string | undefined {
  const req = doc[FIELD.REQ] as string | undefined;
  const def = doc[FIELD.DEF] as string | undefined;
  if (req && def) return `${req} c. ${def}`;
  return req ?? def ?? undefined;
}

// ---------------------------------------------------------------------------
// ArianeWebClient
// ---------------------------------------------------------------------------

export class ArianeWebClient {
  /**
   * Recherche des décisions.
   * Par défaut : Conseil d'État + Tribunal des conflits.
   */
  async search(params: SearchParams): Promise<SearchResult> {
    const {
      query,
      jurisdiction = "CE+TC",
      classification,
      date_start,
      date_end,
      page = 1,
      page_size = 10,
    } = params;

    const url = new URL(XSEARCH_URL);
    url.searchParams.set("advanced", "1");

    // Juridiction
    if (jurisdiction === "CE+TC") {
      // On requête CE ET TC en deux passes ou on filtre avec OR — Sinequa ne supporte pas
      // SourceStr4=AW_DCE OU AW_DTC en GET simple. On utilise les deux sources via SearchText.
      // Sinequa xsearch ne supporte pas plusieurs SourceStr4. On fait deux requêtes et on fusionne.
      const [ceDocs, tcDocs] = await Promise.all([
        this._searchSingleSource("AW_DCE", params),
        this._searchSingleSource("AW_DTC", params),
      ]);
      const allDocs = [...ceDocs.decisions, ...tcDocs.decisions]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, page_size);
      return {
        total: ceDocs.total + tcDocs.total,
        page,
        page_size,
        decisions: allDocs,
      };
    }

    return this._searchSingleSource(SOURCE_CODES[jurisdiction] ?? "AW_DCE", params);
  }

  private async _searchSingleSource(
    sourceCode: string,
    params: SearchParams
  ): Promise<SearchResult> {
    const {
      query,
      classification,
      date_start,
      date_end,
      page = 1,
      page_size = 10,
    } = params;

    const PAGE_SIZE_API = 20; // La page API est toujours 20
    const skipFrom = (page - 1) * PAGE_SIZE_API;

    const url = new URL(XSEARCH_URL);
    url.searchParams.set("advanced", "1");
    url.searchParams.set(FIELD.FOND, sourceCode);
    if (query) url.searchParams.set("SearchText", query);
    if (classification && classification !== "AB") {
      url.searchParams.set(FIELD.REFBIB, classification);
    }
    // Filtre d'année (approximation si seule l'année est donnée)
    if (date_start) {
      const year = date_start.substring(0, 4);
      if (!date_end || date_end.substring(0, 4) === year) {
        url.searchParams.set(FIELD.ANNEE, year);
      }
    }
    if (skipFrom > 0) url.searchParams.set("SkipFrom", String(skipFrom));
    url.searchParams.set("sort", `${FIELD.DATE_LEC} desc`);

    const response = await rateLimitedFetch(url.toString());
    if (!response.ok) {
      throw new Error(`xsearch HTTP ${response.status}`);
    }
    const data = (await response.json()) as SinequaResponse;
    const decisions = (data.Documents ?? [])
      .slice(0, page_size)
      .map(toDecisionMetadata);

    return {
      total: data.TotalCount ?? 0,
      page,
      page_size,
      decisions,
    };
  }

  /**
   * Récupère une décision par son numéro d'affaire (ex : "488011").
   * Retourne le texte intégral HTML parsé.
   */
  async getDecision(numeroOuId: string): Promise<DecisionComplete> {
    const sinequaDoc = await this._findDocument(numeroOuId);
    const sinequaId = sinequaDoc[FIELD.SINEQUA_ID] as string;

    const htmlBuffer = await this._downloadDocument(sinequaId);
    const html = decodeIso8859(htmlBuffer);
    const parsed = parseDecisionHtml(html);

    const meta = toDecisionMetadata(sinequaDoc);
    const conclusionId = sinequaDoc[FIELD.CONCLUSION_ID] as string | undefined;
    const analyseId = sinequaDoc[FIELD.ANALYSE_ID] as string | undefined;

    return {
      ...meta,
      ...parsed,
      rapporteur: sinequaDoc[FIELD.RAP] as string | undefined,
      rapporteurPublic: sinequaDoc[FIELD.CDG] as string | undefined,
      lienConclusions: conclusionId
        ? `${DOWNLOAD_URL}&Id=${encodeId(conclusionId)}`
        : undefined,
    };
  }

  /**
   * Récupère les conclusions du rapporteur public (format PDF → texte extrait).
   */
  async getConclusions(numeroOuId: string): Promise<Conclusions> {
    const sinequaDoc = await this._findDocument(numeroOuId);
    const conclusionId = sinequaDoc[FIELD.CONCLUSION_ID] as string | undefined;

    if (!conclusionId) {
      throw new Error(`Aucune conclusion disponible pour la décision ${numeroOuId}`);
    }

    const pdfBuffer = await this._downloadDocument(conclusionId);
    const parser = new PDFParse({ data: pdfBuffer });
    const parsed = await parser.getText();
    await parser.destroy();

    return {
      decisionId: (sinequaDoc[FIELD.AFF_ID] as string) ?? numeroOuId,
      rapporteurPublic: sinequaDoc[FIELD.CDG] as string | undefined,
      texte: parsed.text,
    };
  }

  /**
   * Récupère l'analyse jurisprudentielle (format HTML).
   */
  async getAnalyse(numeroOuId: string): Promise<Analyse> {
    const sinequaDoc = await this._findDocument(numeroOuId);
    const analyseId = sinequaDoc[FIELD.ANALYSE_ID] as string | undefined;

    if (!analyseId) {
      throw new Error(`Aucune analyse disponible pour la décision ${numeroOuId}`);
    }

    const htmlBuffer = await this._downloadDocument(analyseId);
    const html = decodeIso8859(htmlBuffer);
    const texte = parseAnalyseHtml(html);

    return {
      decisionId: (sinequaDoc[FIELD.AFF_ID] as string) ?? numeroOuId,
      texte,
    };
  }

  // ---------------------------------------------------------------------------
  // Méthodes internes
  // ---------------------------------------------------------------------------

  private async _findDocument(numeroOuId: string): Promise<SinequaDocument> {
    const url = new URL(XSEARCH_URL);
    url.searchParams.set("advanced", "1");
    url.searchParams.set(FIELD.AFF_ID, numeroOuId);

    const response = await rateLimitedFetch(url.toString());
    if (!response.ok) {
      throw new Error(`xsearch HTTP ${response.status}`);
    }
    const data = (await response.json()) as SinequaResponse;

    // La recherche par numéro retourne aussi les docs AW_CRP (conclusions) et AW_AJCE (analyses)
    // associés à la même affaire — on filtre pour ne conserver que les décisions.
    const DECISION_SOURCES = new Set(["AW_DCE", "AW_DCA", "AW_DTC"]);
    const doc = (data.Documents ?? []).find(
      (d) => DECISION_SOURCES.has(d[FIELD.FOND] as string)
    );
    if (!doc) {
      throw new Error(`Décision introuvable : ${numeroOuId}`);
    }
    return doc;
  }

  private async _downloadDocument(sinequaId: string): Promise<Buffer> {
    const url = `${DOWNLOAD_URL}&Id=${encodeId(sinequaId)}`;
    const response = await rateLimitedFetch(url);
    if (!response.ok) {
      throw new Error(`Download HTTP ${response.status} pour Id=${sinequaId}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
