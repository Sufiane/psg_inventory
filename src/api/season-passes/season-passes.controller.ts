import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';

import { toHttpException } from '../../common/exceptions/http-exception.mapper';
import { User } from '../../shared/decorators/user.decorator';
import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';
import { GetSeasonPassDto } from './dto/get-season-pass.dto';
import { UpsertSeasonPassDto } from './dto/upsert-season-pass.dto';
import { ISeasonPassesService } from './interfaces/season-passes.service.interface';

@Controller('season-passes')
export class SeasonPassesController {
    constructor(private readonly service: ISeasonPassesService) {}

    @Get('/')
    findAll(@User() user: AuthenticatedUser) {
        try {
            return this.service.findAll(user.id);
        } catch (e) {
            throw toHttpException(e);
        }
    }

    @Get('/current-season')
    findCurrent(@User() user: AuthenticatedUser) {
        try {
            return this.service.findCurrentSeason(user.id);
        } catch (e) {
            throw toHttpException(e);
        }
    }

    @Get('/season/:seasonStartYear')
    findBySeason(
        @User() user: AuthenticatedUser,
        @Param() { seasonStartYear }: GetSeasonPassDto,
    ) {
        try {
            return this.service.findBySeason(
                user.id,
                Number.parseInt(seasonStartYear, 10),
            );
        } catch (e) {
            throw toHttpException(e);
        }
    }

    @Put('/season/:seasonStartYear')
    upsert(
        @User() user: AuthenticatedUser,
        @Param() { seasonStartYear }: GetSeasonPassDto,
        @Body() payload: UpsertSeasonPassDto,
    ) {
        try {
            return this.service.upsert(
                user.id,
                Number.parseInt(seasonStartYear, 10),
                payload,
            );
        } catch (e) {
            throw toHttpException(e);
        }
    }

    @Delete('/season/:seasonStartYear')
    @HttpCode(204)
    async remove(
        @User() user: AuthenticatedUser,
        @Param() { seasonStartYear }: GetSeasonPassDto,
    ): Promise<void> {
        try {
            await this.service.remove(user.id, Number.parseInt(seasonStartYear, 10));
        } catch (e) {
            throw toHttpException(e);
        }
    }
}
