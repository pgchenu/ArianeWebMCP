export type Juridiction = "CE" | "CAA" | "TA" | "TC";

export type Classification = "A" | "B" | "C";

export interface DecisionMetadata {
  id: string;
  numero: string;
  date: string;
  juridiction: Juridiction;
  formation?: string;
  parties?: string;
  classification?: Classification;
  extrait?: string;
  conclusionsDisponibles: boolean;
  lien: string;
}

export interface DecisionComplete extends DecisionMetadata {
  texteIntegral: string;
  rapporteur?: string;
  rapporteurPublic?: string;
  motsCles?: string[];
  lienConclusions?: string;
}

export interface Conclusions {
  decisionId: string;
  rapporteurPublic?: string;
  texte: string;
}

export interface Analyse {
  decisionId: string;
  texte: string;
}
