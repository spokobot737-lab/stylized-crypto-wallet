export type RewardDefinition = {
    id: string;
    version: number;
    kind: 'skin' | 'theme' | 'badge' | 'mode' | 'partner' | 'nft';
    cost: number;
    enabled: boolean;
    fulfillmentHandler: string;
};
// Empty by design. Only operator-controlled definitions may be passed to reserve().
export const catalog: ReadonlyArray<RewardDefinition> = [];
// Worker contract: use redemption ID as the external idempotency key. Confirm only
// with a durable receipt; do not refund an ambiguous external delivery automatically.
export type FulfillmentReceipt = {
    redemptionId: string;
    state: 'reserved' | 'processing' | 'confirmed' | 'refunded';
    externalReceipt?: string;
};
