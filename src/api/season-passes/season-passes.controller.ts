import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    Put,
    Query,
} from '@nestjs/common';

import { SeasonPass } from './types/season-pass.type';
import { User } from '../../shared/decorators/user.decorator';
import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';
import { CreateSeasonPassDto } from './dto/create-season-pass.dto';
import { GetSeasonPassDto } from './dto/get-season-pass.dto';
import { ListSeasonPassesDto } from './dto/list-season-passes.dto';
import { UpdateSeasonPassDto } from './dto/update-season-pass.dto';
import { ISeasonPassesService } from './interfaces/season-passes.service.interface';

@Controller('season-passes')
export class SeasonPassesController {
    constructor(private readonly service: ISeasonPassesService) {}

    @Get('/')
    async list(
        @User() user: AuthenticatedUser,
        @Query() query: ListSeasonPassesDto,
    ): Promise<SeasonPass[]> {
        if (query.season != null) {
            return await this.service.findBySeason(user.id, query.season);
        }

        return await this.service.findAll(user.id);
    }

    @Get('/current-season')
    async findCurrent(@User() user: AuthenticatedUser): Promise<SeasonPass[]> {
        return await this.service.findCurrentSeason(user.id);
    }

    @Get('/:passId')
    async findOne(
        @User() user: AuthenticatedUser,
        @Param() { passId }: GetSeasonPassDto,
    ): Promise<SeasonPass> {
        return await this.service.findOne(user.id, passId);
    }

    @Post('/')
    async create(
        @User() user: AuthenticatedUser,
        @Body() payload: CreateSeasonPassDto,
    ): Promise<SeasonPass> {
        return await this.service.create(user.id, payload);
    }

    @Put('/:passId')
    async update(
        @User() user: AuthenticatedUser,
        @Param() { passId }: GetSeasonPassDto,
        @Body() payload: UpdateSeasonPassDto,
    ): Promise<SeasonPass> {
        return await this.service.update(user.id, passId, payload);
    }

    @Delete('/:passId')
    @HttpCode(204)
    async remove(
        @User() user: AuthenticatedUser,
        @Param() { passId }: GetSeasonPassDto,
    ): Promise<void> {
        await this.service.remove(user.id, passId);
    }
}
