/**
 * Tests d'intégration du client OpenDataClient.
 * Ces tests requièrent une connexion Internet et frappent l'API réelle.
 * Lancer avec : npm run test:integration
 */

import { describe, it, expect } from "vitest";
import { OpenDataClient } from "../../src/clients/opendata.js";

const client = new OpenDataClient();

describe("OpenDataClient — search() TA", () => {
  it("recherche TA retourne des résultats", async () => {
    const result = await client.search({ query: "urbanisme", jurisdiction: "TA" });
    expect(result.total).toBeGreaterThan(0);
    expect(result.decisions.length).toBeGreaterThan(0);
  }, 30_000);

  it("les résultats TA ont le bon format DecisionMetadata", async () => {
    const result = await client.search({ query: "permis de construire", jurisdiction: "TA" });
    expect(result.decisions.length).toBeGreaterThan(0);
    const d = result.decisions[0];
    expect(d).toMatchObject({
      id: expect.stringMatching(/^TA\d+:\d+:\w+/),
      numero: expect.any(String),
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      juridiction: "TA",
      conclusionsDisponibles: false,
      lien: expect.stringContaining("opendata.justice-administrative.fr"),
    });
  }, 30_000);

  it("la pagination est respectée (page_size max 20)", async () => {
    const result = await client.search({ query: "expulsion", jurisdiction: "TA", page_size: 5 });
    expect(result.decisions.length).toBeLessThanOrEqual(5);
    expect(result.page_size).toBe(5);
  }, 30_000);

  it("les IDs TA sont détectés par isOpenDataId()", async () => {
    const result = await client.search({ query: "procedure", jurisdiction: "TA", page_size: 3 });
    for (const d of result.decisions) {
      expect(OpenDataClient.isOpenDataId(d.id)).toBe(true);
    }
  }, 30_000);
});

describe("OpenDataClient — search() CAA", () => {
  it("recherche CAA retourne des résultats", async () => {
    const result = await client.search({ query: "urbanisme", jurisdiction: "CAA" });
    expect(result.total).toBeGreaterThan(0);
    expect(result.decisions.length).toBeGreaterThan(0);
  }, 30_000);

  it("les résultats CAA ont juridiction='CAA'", async () => {
    const result = await client.search({ query: "fonction publique", jurisdiction: "CAA", page_size: 5 });
    for (const d of result.decisions) {
      expect(d.juridiction).toBe("CAA");
    }
  }, 30_000);
});

describe("OpenDataClient — getDecision()", () => {
  it("récupère le texte intégral d'une décision TA connue", async () => {
    // ORTA_2600849_20260218.xml — décision TA76 vérifiée lors du reverse engineering
    const decision = await client.getDecision("TA76:2600849:ORTA_2600849_20260218");
    expect(decision.texteIntegral).toBeTruthy();
    expect(decision.texteIntegral.length).toBeGreaterThan(500);
    expect(decision.juridiction).toBe("TA");
    expect(decision.numero).toBe("2600849");
    expect(decision.conclusionsDisponibles).toBe(false);
  }, 30_000);

  it("récupère une décision à partir d'un résultat de recherche", async () => {
    const result = await client.search({ query: "procedure", jurisdiction: "TA", page_size: 1 });
    expect(result.decisions.length).toBeGreaterThan(0);

    const firstId = result.decisions[0].id;
    const decision = await client.getDecision(firstId);
    expect(decision.texteIntegral.length).toBeGreaterThan(100);
  }, 60_000);

  it("lance une erreur pour un id invalide", async () => {
    await expect(client.getDecision("format-invalide")).rejects.toThrow("invalide");
  }, 10_000);

  it("lance une erreur pour un id OpenData introuvable", async () => {
    await expect(
      client.getDecision("TA75:0000000:XXXXX_0000000_20000101")
    ).rejects.toThrow();
  }, 30_000);
});

describe("OpenDataClient — méthodes statiques", () => {
  it("isOpenDataId() reconnaît les ids TA", () => {
    expect(OpenDataClient.isOpenDataId("TA76:2600849:ORTA_2600849_20260218")).toBe(true);
    expect(OpenDataClient.isOpenDataId("TA75:12345:DCTA_12345_20250101")).toBe(true);
  });

  it("isOpenDataId() reconnaît les ids CAA", () => {
    expect(OpenDataClient.isOpenDataId("CAA75:25PA01019:DCA_25PA01019_20260218")).toBe(true);
  });

  it("isOpenDataId() rejette les ids ArianeWeb", () => {
    expect(OpenDataClient.isOpenDataId("/Ariane_Web/AW_DCE/|488011")).toBe(false);
    expect(OpenDataClient.isOpenDataId("488011")).toBe(false);
  });

  it("parseId() décompose correctement un id", () => {
    const parsed = OpenDataClient.parseId("TA76:2600849:ORTA_2600849_20260218");
    expect(parsed).toEqual({
      codeJuridiction: "TA76",
      numeroDossier: "2600849",
      identification: "ORTA_2600849_20260218",
    });
  });

  it("parseId() lance une erreur si format invalide", () => {
    expect(() => OpenDataClient.parseId("invalid")).toThrow("invalide");
    expect(() => OpenDataClient.parseId("TA76:2600849")).toThrow("invalide");
  });
});
