/**
 * Tests d'intégration du client ArianeWebClient.
 * Ces tests requièrent une connexion Internet et frappent l'API réelle.
 * Lancer avec : npm run test:integration
 */

import { describe, it, expect } from "vitest";
import { ArianeWebClient } from "../../src/clients/arianeweb.js";

const client = new ArianeWebClient();

describe("ArianeWebClient — search()", () => {
  it("recherche basique CE+TC retourne des résultats", async () => {
    const result = await client.search({ query: "responsabilite" });
    expect(result.total).toBeGreaterThan(0);
    expect(result.decisions.length).toBeGreaterThan(0);
    expect(result.decisions[0]).toMatchObject({
      id: expect.any(String),
      numero: expect.any(String),
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      juridiction: expect.stringMatching(/^(CE|CAA|TC)$/),
      lien: expect.stringContaining("conseil-etat.fr"),
    });
  }, 30_000);

  it("filtre classification A retourne uniquement des décisions A", async () => {
    const result = await client.search({ query: "urbanisme", classification: "A" });
    expect(result.total).toBeGreaterThan(0);
    for (const d of result.decisions) {
      expect(d.classification).toBe("A");
    }
  }, 30_000);

  it("filtre par juridiction CE uniquement", async () => {
    const result = await client.search({ query: "fonctionnaire", jurisdiction: "CE" });
    for (const d of result.decisions) {
      expect(d.juridiction).toBe("CE");
    }
  }, 30_000);

  it("pagination fonctionne", async () => {
    const page1 = await client.search({ query: "procedure", page: 1 });
    const page2 = await client.search({ query: "procedure", page: 2 });
    expect(page1.decisions[0].numero).not.toBe(page2.decisions[0].numero);
  }, 60_000);

  it("l'abstract est présent pour les décisions fichées", async () => {
    const result = await client.search({ query: "contrat", classification: "A" });
    const avecAbstract = result.decisions.filter((d) => d.extrait);
    expect(avecAbstract.length).toBeGreaterThan(0);
  }, 30_000);
});

describe("ArianeWebClient — getDecision()", () => {
  it("récupère une décision par numéro", async () => {
    const decision = await client.getDecision("488011");
    expect(decision.numero).toContain("488011");
    expect(decision.texteIntegral).toBeTruthy();
    expect(decision.texteIntegral.length).toBeGreaterThan(500);
    expect(decision.juridiction).toBe("CE");
  }, 30_000);

  it("lance une erreur pour une décision inexistante", async () => {
    await expect(client.getDecision("000000")).rejects.toThrow("introuvable");
  }, 30_000);
});

describe("ArianeWebClient — getConclusions()", () => {
  it("récupère les conclusions PDF d'une décision Section", async () => {
    // 488011 — décision Section avec conclusions confirmées (SourceCsv7 non vide)
    const conclusions = await client.getConclusions("488011");
    expect(conclusions.texte).toBeTruthy();
    expect(conclusions.texte.length).toBeGreaterThan(500);
    expect(conclusions.decisionId).toContain("488011");
  }, 60_000);

  it("lance une erreur si pas de conclusions disponibles", async () => {
    // Décision C sans conclusions — on cherche une décision C récente
    const result = await client.search({ query: "voirie", classification: "C", jurisdiction: "CE" });
    const sansConcl = result.decisions.find((d) => !d.conclusionsDisponibles);
    if (sansConcl) {
      await expect(client.getConclusions(sansConcl.numero.split(";")[0])).rejects.toThrow(
        "Aucune conclusion"
      );
    }
  }, 60_000);
});

describe("ArianeWebClient — getAnalyse()", () => {
  it("récupère l'analyse d'une décision A", async () => {
    // 488011 — décision A avec analyse (SourceCsv6 non vide)
    const analyse = await client.getAnalyse("488011");
    expect(analyse.texte).toBeTruthy();
    expect(analyse.texte.length).toBeGreaterThan(100);
  }, 30_000);
});
