import { DraftRowDto } from './draft-row.dto';

export type ValidateImportResponse = {
    rows: DraftRowDto[];
    summary: {
        total: number;
        errors: number;
        warnings: number;
    };
};
