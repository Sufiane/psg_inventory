import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { IAdminService } from './interfaces/admin.service.interface';
import { LoadSeasonMatchesDto } from './dto/load-season-matches.dto';
import { RolesGuard } from '../../shared/guards/role.guard';
import { CreateMatchDto } from './dto/create-match.dto';

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
}
