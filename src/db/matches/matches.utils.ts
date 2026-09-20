import { Competition } from '@prisma/client';

export function convertStringToCompetition(competition: string): Competition | null {
    switch (competition) {
        case 'Ligue 1':
            return Competition.CHAMPIONSHIP;
        case 'UEFA Champions League':
            return Competition.CHAMPIONS_LEAGUE;
        case 'Coupe de France':
            return Competition.FRENCH_CUP;
        case 'Coupe de la Ligue':
            return Competition.LEAGUE_CUP;
        default:
            return null;
    }
}
