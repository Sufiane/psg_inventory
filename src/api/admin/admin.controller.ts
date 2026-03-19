import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import { toHttpException } from '../../common/exceptions/http-exception.mapper';
import { RolesGuard } from '../../shared/guards/role.guard';
import { CreateMatchDto } from './dto/create-match.dto';
import { LoadSeasonMatchesDto } from './dto/load-season-matches.dto';
import { IAdminService } from './interfaces/admin.service.interface';

@UseGuards(RolesGuard)
@Controller('admin')
export class AdminController {
    constructor(private readonly adminService: IAdminService) {}

    @Post('/matches/load/current-season')
    async loadCurrentSeason(): Promise<void> {
        try {
            await this.adminService.loadMatches();
        } catch (e) {
            throw toHttpException(e);
        }
    }

    @Post('/matches/load/:seasonStartYear')
    async loadMatches(@Param() { seasonStartYear }: LoadSeasonMatchesDto): Promise<void> {
        try {
            await this.adminService.loadMatches(parseInt(seasonStartYear, 10));
        } catch (e) {
            throw toHttpException(e);
        }
    }

    @Post('/matches')
    async createMatch(@Body() payload: CreateMatchDto): Promise<void> {
        try {
            await this.adminService.createMatch(payload);
        } catch (e) {
            throw toHttpException(e);
        }
    }
}
