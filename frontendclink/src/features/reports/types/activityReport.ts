export interface ActivityReportInput { reason: string; description?: string }
export interface ActivityReportReceipt {
  id: string; activityId: string; campusId: string; status: 'PENDIENTE'; reportedAt: string;
}
