/**
 * Tests unitaires de handleGetConclusions.
 * Le client ArianeWeb est mocké — aucune connexion réseau.
 */

import { describe, it, expect, vi } from "vitest";
import { handleGetConclusions } from "../../src/tools/conclusions.js";
import { ArianeWebClient } from "../../src/clients/arianeweb.js";
import type { Conclusions } from "../../src/types/decision.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConclusions(overrides: Partial<Conclusions> = {}): Conclusions {
  return {
    decisionId: "488011",
    rapporteurPublic: "Mme Martin",
    texte: "En ce qui concerne la recevabilité... Je conclus au rejet.",
    ...overrides,
  };
}

function createMockClient(conclusions: Conclusions): ArianeWebClient {
  return {
    getConclusions: vi.fn().mockResolvedValue(conclusions),
  } as unknown as ArianeWebClient;
}

// ---------------------------------------------------------------------------
// Tests : formatage
// ---------------------------------------------------------------------------

describe("handleGetConclusions — formatage", () => {
  it("inclut le numéro de décision", async () => {
    const client = createMockClient(makeConclusions());
    const out = await handleGetConclusions({ id: "488011" }, client);
    expect(out).toContain("488011");
  });

  it("inclut le nom du rapporteur public", async () => {
    const client = createMockClient(makeConclusions());
    const out = await handleGetConclusions({ id: "488011" }, client);
    expect(out).toContain("Mme Martin");
  });

  it("inclut le texte des conclusions", async () => {
    const client = createMockClient(makeConclusions());
    const out = await handleGetConclusions({ id: "488011" }, client);
    expect(out).toContain("recevabilité");
    expect(out).toContain("Je conclus au rejet");
  });

  it("contient le titre de section", async () => {
    const client = createMockClient(makeConclusions());
    const out = await handleGetConclusions({ id: "488011" }, client);
    expect(out).toContain("RAPPORTEUR PUBLIC");
  });
});

// ---------------------------------------------------------------------------
// Tests : champs optionnels
// ---------------------------------------------------------------------------

describe("handleGetConclusions — champs optionnels", () => {
  it("fonctionne sans rapporteur public", async () => {
    const client = createMockClient(makeConclusions({ rapporteurPublic: undefined }));
    const out = await handleGetConclusions({ id: "488011" }, client);
    expect(out).toContain("488011");
    expect(out).toContain("recevabilité");
  });
});

// ---------------------------------------------------------------------------
// Tests : validation et erreurs
// ---------------------------------------------------------------------------

describe("handleGetConclusions — validation et erreurs", () => {
  it("lance une erreur si id est vide", async () => {
    const client = { getConclusions: vi.fn() } as unknown as ArianeWebClient;
    await expect(handleGetConclusions({ id: "" }, client)).rejects.toThrow("requis");
  });

  it("lance une erreur si id est absent", async () => {
    const client = { getConclusions: vi.fn() } as unknown as ArianeWebClient;
    await expect(handleGetConclusions({}, client)).rejects.toThrow("requis");
  });

  it("propage l'erreur du client si aucune conclusion disponible", async () => {
    const client = {
      getConclusions: vi.fn().mockRejectedValue(
        new Error("Aucune conclusion disponible pour la décision 000000")
      ),
    } as unknown as ArianeWebClient;
    await expect(handleGetConclusions({ id: "000000" }, client)).rejects.toThrow(
      "Aucune conclusion"
    );
  });

  it("passe le bon id au client", async () => {
    const client = createMockClient(makeConclusions());
    await handleGetConclusions({ id: "488011" }, client);
    expect((client.getConclusions as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("488011");
  });

  it("trim l'id avant de l'envoyer au client", async () => {
    const client = createMockClient(makeConclusions());
    await handleGetConclusions({ id: "  488011  " }, client);
    expect((client.getConclusions as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("488011");
  });
});
