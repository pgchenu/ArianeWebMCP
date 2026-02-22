/**
 * Tests unitaires de handleGetDecision.
 * Le client ArianeWeb est mocké — aucune connexion réseau.
 */

import { describe, it, expect, vi } from "vitest";
import { handleGetDecision } from "../../src/tools/decision.js";
import { ArianeWebClient } from "../../src/clients/arianeweb.js";
import type { DecisionComplete } from "../../src/types/decision.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDecisionComplete(overrides: Partial<DecisionComplete> = {}): DecisionComplete {
  return {
    id: "/Ariane_Web/AW_DCE/|488011",
    numero: "488011",
    date: "2024-12-30",
    juridiction: "CE",
    formation: "Section",
    parties: "M. A... c. Ministre de l'intérieur",
    classification: "A",
    extrait: "Résumé court de la décision.",
    conclusionsDisponibles: true,
    lien: "https://www.conseil-etat.fr/fr/arianeweb/CE/decision/2024-12-30/488011",
    texteIntegral: "Vu la procédure suivante... DECIDE: Article 1er...",
    rapporteur: "M. Dupont",
    rapporteurPublic: "Mme Martin",
    lienConclusions: "https://www.conseil-etat.fr/plugin?plugin=Service.downloadFilePagePlugin&Index=Ariane_Web&Id=%2FAriane_Web%2FAW_CRP%2F%7C488011",
    ...overrides,
  };
}

function createMockClient(decision: DecisionComplete): ArianeWebClient {
  return {
    getDecision: vi.fn().mockResolvedValue(decision),
  } as unknown as ArianeWebClient;
}

// ---------------------------------------------------------------------------
// Tests : formatage de la décision
// ---------------------------------------------------------------------------

describe("handleGetDecision — formatage", () => {
  it("inclut le numéro de décision dans la sortie", async () => {
    const client = createMockClient(makeDecisionComplete());
    const out = await handleGetDecision({ id: "488011" }, client);
    expect(out).toContain("488011");
  });

  it("inclut la date", async () => {
    const client = createMockClient(makeDecisionComplete());
    const out = await handleGetDecision({ id: "488011" }, client);
    expect(out).toContain("2024-12-30");
  });

  it("inclut la juridiction et la formation", async () => {
    const client = createMockClient(makeDecisionComplete());
    const out = await handleGetDecision({ id: "488011" }, client);
    expect(out).toContain("CE");
    expect(out).toContain("Section");
  });

  it("inclut les parties", async () => {
    const client = createMockClient(makeDecisionComplete());
    const out = await handleGetDecision({ id: "488011" }, client);
    expect(out).toContain("M. A... c. Ministre de l'intérieur");
  });

  it("inclut la classification", async () => {
    const client = createMockClient(makeDecisionComplete());
    const out = await handleGetDecision({ id: "488011" }, client);
    expect(out).toContain("A");
  });

  it("inclut le rapporteur et le rapporteur public", async () => {
    const client = createMockClient(makeDecisionComplete());
    const out = await handleGetDecision({ id: "488011" }, client);
    expect(out).toContain("M. Dupont");
    expect(out).toContain("Mme Martin");
  });

  it("inclut le texte intégral", async () => {
    const client = createMockClient(makeDecisionComplete());
    const out = await handleGetDecision({ id: "488011" }, client);
    expect(out).toContain("Vu la procédure suivante");
    expect(out).toContain("Article 1er");
  });

  it("indique que les conclusions sont disponibles avec le lien", async () => {
    const client = createMockClient(makeDecisionComplete());
    const out = await handleGetDecision({ id: "488011" }, client);
    expect(out).toContain("disponibles");
    expect(out).toContain("downloadFilePagePlugin");
  });

  it("indique que les conclusions ne sont pas disponibles", async () => {
    const client = createMockClient(
      makeDecisionComplete({ conclusionsDisponibles: false, lienConclusions: undefined })
    );
    const out = await handleGetDecision({ id: "488011" }, client);
    expect(out).toContain("non disponibles");
  });

  it("inclut le lien ArianeWeb", async () => {
    const client = createMockClient(makeDecisionComplete());
    const out = await handleGetDecision({ id: "488011" }, client);
    expect(out).toContain("conseil-etat.fr/fr/arianeweb");
  });
});

// ---------------------------------------------------------------------------
// Tests : champs optionnels absents
// ---------------------------------------------------------------------------

describe("handleGetDecision — champs optionnels", () => {
  it("fonctionne sans rapporteur, formation, parties", async () => {
    const minimal = makeDecisionComplete({
      formation: undefined,
      parties: undefined,
      rapporteur: undefined,
      rapporteurPublic: undefined,
      classification: undefined,
      motsCles: undefined,
    });
    const client = createMockClient(minimal);
    const out = await handleGetDecision({ id: "488011" }, client);
    expect(out).toContain("488011");
    expect(out).toContain("Vu la procédure");
  });

  it("inclut les mots-clés si présents", async () => {
    const client = createMockClient(
      makeDecisionComplete({ motsCles: ["urbanisme", "permis de construire"] })
    );
    const out = await handleGetDecision({ id: "488011" }, client);
    expect(out).toContain("urbanisme");
    expect(out).toContain("permis de construire");
  });
});

// ---------------------------------------------------------------------------
// Tests : validation et erreurs
// ---------------------------------------------------------------------------

describe("handleGetDecision — validation et erreurs", () => {
  it("lance une erreur si id est vide", async () => {
    const client = { getDecision: vi.fn() } as unknown as ArianeWebClient;
    await expect(handleGetDecision({ id: "" }, client)).rejects.toThrow("requis");
  });

  it("lance une erreur si id est absent", async () => {
    const client = { getDecision: vi.fn() } as unknown as ArianeWebClient;
    await expect(handleGetDecision({}, client)).rejects.toThrow("requis");
  });

  it("propage l'erreur du client si la décision est introuvable", async () => {
    const client = {
      getDecision: vi.fn().mockRejectedValue(new Error("Décision introuvable : 000000")),
    } as unknown as ArianeWebClient;
    await expect(handleGetDecision({ id: "000000" }, client)).rejects.toThrow("introuvable");
  });

  it("passe le bon id au client", async () => {
    const client = createMockClient(makeDecisionComplete());
    await handleGetDecision({ id: "488011" }, client);
    expect((client.getDecision as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("488011");
  });

  it("trim l'id avant de l'envoyer au client", async () => {
    const client = createMockClient(makeDecisionComplete());
    await handleGetDecision({ id: "  488011  " }, client);
    expect((client.getDecision as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("488011");
  });
});
