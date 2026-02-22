/**
 * Tests unitaires de handleGetDecisionAnalysis.
 * Le client ArianeWeb est mocké — aucune connexion réseau.
 */

import { describe, it, expect, vi } from "vitest";
import { handleGetDecisionAnalysis } from "../../src/tools/analysis.js";
import { ArianeWebClient } from "../../src/clients/arianeweb.js";
import type { Analyse } from "../../src/types/decision.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAnalyse(overrides: Partial<Analyse> = {}): Analyse {
  return {
    decisionId: "488011",
    texte: "La décision précise les conditions dans lesquelles... Recueil p. 42.",
    ...overrides,
  };
}

function createMockClient(analyse: Analyse): ArianeWebClient {
  return {
    getAnalyse: vi.fn().mockResolvedValue(analyse),
  } as unknown as ArianeWebClient;
}

// ---------------------------------------------------------------------------
// Tests : formatage
// ---------------------------------------------------------------------------

describe("handleGetDecisionAnalysis — formatage", () => {
  it("inclut le numéro de décision", async () => {
    const client = createMockClient(makeAnalyse());
    const out = await handleGetDecisionAnalysis({ id: "488011" }, client);
    expect(out).toContain("488011");
  });

  it("inclut le texte de l'analyse", async () => {
    const client = createMockClient(makeAnalyse());
    const out = await handleGetDecisionAnalysis({ id: "488011" }, client);
    expect(out).toContain("précise les conditions");
    expect(out).toContain("Recueil");
  });

  it("contient le titre de section", async () => {
    const client = createMockClient(makeAnalyse());
    const out = await handleGetDecisionAnalysis({ id: "488011" }, client);
    expect(out).toContain("ANALYSE JURISPRUDENTIELLE");
  });
});

// ---------------------------------------------------------------------------
// Tests : validation et erreurs
// ---------------------------------------------------------------------------

describe("handleGetDecisionAnalysis — validation et erreurs", () => {
  it("lance une erreur si id est vide", async () => {
    const client = { getAnalyse: vi.fn() } as unknown as ArianeWebClient;
    await expect(handleGetDecisionAnalysis({ id: "" }, client)).rejects.toThrow("requis");
  });

  it("lance une erreur si id est absent", async () => {
    const client = { getAnalyse: vi.fn() } as unknown as ArianeWebClient;
    await expect(handleGetDecisionAnalysis({}, client)).rejects.toThrow("requis");
  });

  it("propage l'erreur du client si aucune analyse disponible", async () => {
    const client = {
      getAnalyse: vi.fn().mockRejectedValue(
        new Error("Aucune analyse disponible pour la décision 000000")
      ),
    } as unknown as ArianeWebClient;
    await expect(handleGetDecisionAnalysis({ id: "000000" }, client)).rejects.toThrow(
      "Aucune analyse"
    );
  });

  it("passe le bon id au client", async () => {
    const client = createMockClient(makeAnalyse());
    await handleGetDecisionAnalysis({ id: "488011" }, client);
    expect((client.getAnalyse as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("488011");
  });

  it("trim l'id avant de l'envoyer au client", async () => {
    const client = createMockClient(makeAnalyse());
    await handleGetDecisionAnalysis({ id: "  488011  " }, client);
    expect((client.getAnalyse as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("488011");
  });
});
