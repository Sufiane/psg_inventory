import type { SoldCount } from '@psg/shared/counts';
import type { LeadDays } from '@psg/shared/time';

export type LeadTime = {
    soldCount: SoldCount;
    avgLeadDays: LeadDays;
    medianLeadDays: LeadDays;
    minLeadDays: LeadDays;
    maxLeadDays: LeadDays;
};
