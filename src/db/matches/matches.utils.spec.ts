import { Competition } from '@prisma/client';
import { convertStringToCompetition } from './matches.utils';

describe('convertStringToCompetition', () => {
    it('maps "Ligue 1" to CHAMPIONSHIP', () => {
        expect(convertStringToCompetition('Ligue 1')).toBe(Competition.CHAMPIONSHIP);
    });

    it('maps "UEFA Champions League" to CHAMPIONS_LEAGUE', () => {
        expect(convertStringToCompetition('UEFA Champions League')).toBe(
            Competition.CHAMPIONS_LEAGUE,
        );
    });

    it('returns null for an unknown competition', () => {
        expect(convertStringToCompetition('Coupe de France')).toBeNull();
    });

    it('returns null for an empty string', () => {
        expect(convertStringToCompetition('')).toBeNull();
    });
});
