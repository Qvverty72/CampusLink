/** Perfil público mínimo; las métricas opcionales corresponden al ámbito rotulado por cada módulo. */
export interface ResourceOwner {
  id: string;
  fullName: string;
  averageRating?: number | null;
  ratingCount?: number;
  completedAgreements?: number;
  completedSales?: number;
  careers?: string[];
}

export interface ResourceActivity { pendingRequests: number; completedAgreements?: number }
