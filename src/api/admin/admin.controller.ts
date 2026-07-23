import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';

import { RolesGuard } from '../../shared/guards/role.guard';
import { CreateMatchDto } from './dto/create-match.dto';
import { LoadSeasonMatchesDto } from './dto/load-season-matches.dto';
import { FlushUserCacheDto } from './dto/flush-user-cache.dto';
import { IAdminService } from './interfaces/admin.service.interface';
import { CacheFlushResult } from './types/cache-flush-result.type';

@UseGuards(RolesGuard)
@Controller('admin')
export class AdminController {
    constructor(private readonly adminService: IAdminService) {}

    @Post('/matches/load/current-season')
    async loadCurrentSeason(): Promise<void> {
        await this.adminService.loadMatches();
    }

    @Post('/matches/load/:seasonStartYear')
    async loadMatches(@Param() { seasonStartYear }: LoadSeasonMatchesDto): Promise<void> {
        await this.adminService.loadMatches(parseInt(seasonStartYear, 10));
    }

    @Post('/matches')
    async createMatch(@Body() payload: CreateMatchDto): Promise<void> {
        await this.adminService.createMatch(payload);
    }

    @Post('/users/cache/flush')
    async flushUserCache(
        @Body() { email }: FlushUserCacheDto,
    ): Promise<CacheFlushResult[]> {
        return await this.adminService.flushUserCache(email);
    }
}
