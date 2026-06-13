import type { LeadDays, SoldCount } from '@psg/shared';

export type LeadTime = {
    soldCount: SoldCount;
    avgLeadDays: LeadDays;
    medianLeadDays: LeadDays;
    minLeadDays: LeadDays;
    maxLeadDays: LeadDays;
};
