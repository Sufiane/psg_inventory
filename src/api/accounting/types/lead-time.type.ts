import type { SoldCount } from '@psg/shared';

export type LeadTime = {
    soldCount: SoldCount;
    avgLeadDays: number;
    medianLeadDays: number;
    minLeadDays: number;
    maxLeadDays: number;
};
