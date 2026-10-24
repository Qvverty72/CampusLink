export type TransactionAction = 'confirm' | 'cancel';
export interface TransactionParticipant { id: string; name: string; role: string }
export interface TransactionConfirmation { userId: string; role: string; confirmedAt: string }
