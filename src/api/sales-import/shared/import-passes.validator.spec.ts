import { Test } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { ImportPassesValidator } from './import-passes.validator';
import { ISeasonPassesDbService } from '../../../db/season-passes/season-passes.db.interface';
import { ErrorCode } from '../../../common/exceptions/error-codes.enum';
import type { SeasonPassId, UserId } from '@psg/shared/ids';
import type { SeasonPass } from '../../../db/season-passes/type/season-pass.type';

describe('ImportPassesValidator', () => {
    let validator: ImportPassesValidator;
    let passesDb: DeepMockProxy<ISeasonPassesDbService>;

    const userId = 'user-1' as UserId;
    const passAId = '11111111-1111-1111-1111-111111111111';
    const passBId = '22222222-2222-2222-2222-222222222222';

    function passFixture(overrides: Partial<SeasonPass> = {}): SeasonPass {
        return {
            id: passAId as SeasonPassId,
            userId,
            seasonStartYear: 2025,
            price: 800,
            label: 'A',
            category: 'A',
            row: '1',
            seat: '1',
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides,
        } as SeasonPass;
    }

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                ImportPassesValidator,
                {
                    provide: ISeasonPassesDbService,
                    useValue: mockDeep<ISeasonPassesDbService>(),
                },
            ],
        }).compile();

        validator = module.get(ImportPassesValidator);
        passesDb = module.get(ISeasonPassesDbService);

        module.useLogger(false);
    });

    it('returns the single season year when every pass is owned and same-season', async () => {
        passesDb.findById.mockResolvedValue(passFixture());

        await expect(validator.validate(userId, [passAId])).resolves.toBe(2025);
    });

    it('throws SEASON_PASS_NOT_FOUND when a pass does not exist', async () => {
        passesDb.findById.mockResolvedValue(null);

        await expect(validator.validate(userId, [passAId])).rejects.toMatchObject({
            code: ErrorCode.SEASON_PASS_NOT_FOUND,
        });
    });

    it('throws SEASON_PASS_FORBIDDEN when pass belongs to other user', async () => {
        passesDb.findById.mockResolvedValue(
            passFixture({ userId: 'other-user' as UserId }),
        );

        await expect(validator.validate(userId, [passAId])).rejects.toMatchObject({
            code: ErrorCode.SEASON_PASS_FORBIDDEN,
        });
    });

    it('throws IMPORT_PASSES_MIXED_SEASONS when passes differ in year', async () => {
        passesDb.findById.mockImplementation(async (id) => {
            if (id === passBId) {
                return passFixture({
                    id: passBId as SeasonPassId,
                    seasonStartYear: 2024,
                });
            }

            return passFixture({});
        });

        await expect(
            validator.validate(userId, [passAId, passBId]),
        ).rejects.toMatchObject({ code: ErrorCode.IMPORT_PASSES_MIXED_SEASONS });
    });
});
