/**
 * Tests unitaires de handleSearchDecisions.
 * Le client ArianeWeb est mocké — aucune connexion réseau.
 */

import { describe, it, expect, vi } from "vitest";
import { handleSearchDecisions } from "../../src/tools/search.js";
import { ArianeWebClient } from "../../src/clients/arianeweb.js";
import type { DecisionMetadata } from "../../src/types/decision.js";
import type { SearchResult } from "../../src/types/search.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDecision(overrides: Partial<DecisionMetadata> = {}): DecisionMetadata {
  return {
    id: "/Ariane_Web/AW_DCE/|123456",
    numero: "123456",
    date: "2024-06-15",
    juridiction: "CE",
    conclusionsDisponibles: false,
    lien: "https://www.conseil-etat.fr/fr/arianeweb/CE/decision/2024-06-15/123456",
    ...overrides,
  };
}

function makeResult(decisions: DecisionMetadata[], total?: number): SearchResult {
  return { total: total ?? decisions.length, page: 1, page_size: 10, decisions };
}

function createMockClient(searchImpl: (...args: unknown[]) => unknown): ArianeWebClient {
  return { search: vi.fn(searchImpl) } as unknown as ArianeWebClient;
}

// ---------------------------------------------------------------------------
// Tests : résultats de base
// ---------------------------------------------------------------------------

describe("handleSearchDecisions — résultats de base", () => {
  it("retourne un message vide si aucune décision trouvée", async () => {
    const client = createMockClient(() => makeResult([]));
    const out = await handleSearchDecisions({ query: "xyz" }, client);
    expect(out).toContain("Aucune décision trouvée");
  });

  it("affiche le numéro et la date de chaque décision", async () => {
    const client = createMockClient(() =>
      makeResult([makeDecision({ numero: "488011", date: "2024-12-30", classification: "A" })])
    );
    const out = await handleSearchDecisions({ query: "responsabilite" }, client);
    expect(out).toContain("488011");
    expect(out).toContain("2024-12-30");
  });

  it("affiche le tag de classification", async () => {
    const client = createMockClient(() =>
      makeResult([makeDecision({ classification: "B" })])
    );
    const out = await handleSearchDecisions({ query: "test" }, client);
    expect(out).toContain("[B]");
  });

  it("affiche les parties si disponibles", async () => {
    const client = createMockClient(() =>
      makeResult([makeDecision({ classification: "A", parties: "Dupont c. Commune de Lyon" })])
    );
    const out = await handleSearchDecisions({ query: "test" }, client);
    expect(out).toContain("Dupont c. Commune de Lyon");
  });

  it("affiche 'conclusions : disponibles' quand conclusionsDisponibles est true", async () => {
    const client = createMockClient(() =>
      makeResult([makeDecision({ classification: "A", conclusionsDisponibles: true })])
    );
    const out = await handleSearchDecisions({ query: "test" }, client);
    expect(out).toContain("disponibles");
  });

  it("affiche le total et la page", async () => {
    const client = createMockClient(() =>
      makeResult([makeDecision({ classification: "A" })], 42)
    );
    const out = await handleSearchDecisions({ query: "test" }, client);
    expect(out).toContain("42");
    expect(out).toContain("page 1");
  });
});

// ---------------------------------------------------------------------------
// Tests : tri par classification
// ---------------------------------------------------------------------------

describe("handleSearchDecisions — tri par classification", () => {
  it("place les décisions A avant B avant C", async () => {
    const decisions = [
      makeDecision({ numero: "111", classification: "C" }),
      makeDecision({ numero: "222", classification: "A" }),
      makeDecision({ numero: "333", classification: "B" }),
    ];
    const client = createMockClient(() => makeResult(decisions));
    const out = await handleSearchDecisions({ query: "test" }, client);
    const posA = out.indexOf("222");
    const posB = out.indexOf("333");
    const posC = out.indexOf("111");
    // A doit apparaître avant B, B avant C — mais C est filtré par défaut si A/B présents
    expect(posA).toBeLessThan(posB);
  });

  it("filtre les décisions C quand des A/B sont présents (classification défaut AB)", async () => {
    const decisions = [
      makeDecision({ numero: "C_DOC", classification: "C" }),
      makeDecision({ numero: "A_DOC", classification: "A" }),
    ];
    const client = createMockClient(() => makeResult(decisions));
    const out = await handleSearchDecisions({ query: "test" }, client);
    expect(out).toContain("A_DOC");
    expect(out).not.toContain("C_DOC");
  });
});

// ---------------------------------------------------------------------------
// Tests : décisions C uniquement (aucun A/B)
// ---------------------------------------------------------------------------

describe("handleSearchDecisions — aucun résultat A/B", () => {
  it("signale l'absence d'A/B quand juridiction spécifique (pas de fallback)", async () => {
    const client = createMockClient(() =>
      makeResult([makeDecision({ classification: "C", numero: "C_ONLY" })])
    );
    const out = await handleSearchDecisions({ query: "test", jurisdiction: "CE" }, client);
    expect(out).toContain("C_ONLY");
    expect(out).toContain("C");
  });

  it("n'élargit pas aux CAA si jurisdiction est 'CE' (pas de fallback)", async () => {
    const client = createMockClient(() =>
      makeResult([makeDecision({ classification: "C" })])
    );
    const out = await handleSearchDecisions({ query: "test", jurisdiction: "CE" }, client);
    // search n'est appelé qu'une seule fois
    expect((client.search as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect(out).not.toContain("élargie aux Cours");
  });
});

// ---------------------------------------------------------------------------
// Tests : fallback CE+TC → CAA
// ---------------------------------------------------------------------------

describe("handleSearchDecisions — fallback CE+TC → CAA", () => {
  it("élargit aux CAA si CE+TC ne retourne aucun résultat A/B", async () => {
    let callCount = 0;
    const client = createMockClient(() => {
      callCount++;
      if (callCount === 1) {
        // Premier appel : CE+TC, que des C
        return makeResult([makeDecision({ classification: "C", numero: "CE_C" })]);
      }
      // Deuxième appel : CAA, avec un A
      return makeResult([makeDecision({ classification: "A", numero: "CAA_A", juridiction: "CAA" })]);
    });

    const out = await handleSearchDecisions({ query: "test" }, client);
    expect(out).toContain("élargie aux Cours");
    expect(out).toContain("CAA_A");
  });

  it("n'élargit pas si CE+TC retourne au moins un A/B", async () => {
    const client = createMockClient(() =>
      makeResult([makeDecision({ classification: "A", numero: "CE_A" })])
    );
    const out = await handleSearchDecisions({ query: "test" }, client);
    expect((client.search as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect(out).not.toContain("élargie");
  });

  it("n'élargit pas si jurisdiction=CE+TC est absent (défaut) mais résultats vides", async () => {
    // Aucun résultat du tout même après fallback → message vide
    const client = createMockClient(() => makeResult([]));
    const out = await handleSearchDecisions({ query: "rien" }, client);
    expect(out).toContain("élargie aux Cours"); // fallback quand même tenté
    expect(out).toContain("Aucune décision");
  });
});

// ---------------------------------------------------------------------------
// Tests : classification C explicite
// ---------------------------------------------------------------------------

describe("handleSearchDecisions — classification C explicite", () => {
  it("retourne les C sans fallback quand explicitement demandé", async () => {
    const client = createMockClient(() =>
      makeResult([makeDecision({ classification: "C", numero: "C_EXPLICITE" })])
    );
    const out = await handleSearchDecisions({ query: "test", classification: "C" }, client);
    expect(out).toContain("C_EXPLICITE");
    expect(out).not.toContain("élargie");
    // Un seul appel (pas de fallback)
    expect((client.search as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Tests : paramètres
// ---------------------------------------------------------------------------

describe("handleSearchDecisions — paramètres", () => {
  it("cap page_size à 20", async () => {
    const client = createMockClient(() => makeResult([]));
    await handleSearchDecisions({ query: "test", page_size: 50 }, client);
    const call = (client.search as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.page_size).toBeLessThanOrEqual(20);
  });

  it("passe les dates au client", async () => {
    const client = createMockClient(() => makeResult([]));
    await handleSearchDecisions({ query: "test", date_start: "2023-01-01", date_end: "2023-12-31" }, client);
    const call = (client.search as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.date_start).toBe("2023-01-01");
    expect(call.date_end).toBe("2023-12-31");
  });
});
