import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import type { SeasonYear } from '@psg/shared/time';
import { User } from '../../shared/decorators/user.decorator';
import { GetSaleDto } from './dto/get-sale.dto';
import { ISalesService } from './interfaces/sales.service.interface';
import { AddSaleDto } from './dto/add-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { DeleteSaleDto } from './dto/delete-sale.dto';
import { GetSeasonSalesDto } from './dto/get-season-sales.dto';
import { AuthenticatedUser } from '../../shared/types/authenticated-user.type';

@Controller('sales')
export class SalesController {
    constructor(private readonly salesService: ISalesService) {}

    @Get('/current-season')
    async getCurrentSeasonSales(@User() user: AuthenticatedUser) {
        return await this.salesService.getCurrentSeasonSales(user.id);
    }

    @Get('/season/:seasonStartYear')
    async getSeasonSales(
        @User() user: AuthenticatedUser,
        @Param() { seasonStartYear }: GetSeasonSalesDto,
    ) {
        return await this.salesService.getSeasonSales(
            user.id,
            Number.parseInt(seasonStartYear, 10) as SeasonYear,
        );
    }

    @Get('/:saleId')
    async getSale(@User() user: AuthenticatedUser, @Param() { saleId }: GetSaleDto) {
        return await this.salesService.getSale(user.id, saleId);
    }

    @Get('/')
    async getSales(@User() user: AuthenticatedUser) {
        return await this.salesService.getSales(user.id);
    }

    @Post('/')
    async addSale(
        @User() user: AuthenticatedUser,
        @Body() payload: AddSaleDto,
    ): Promise<{ id: string }> {
        return await this.salesService.addSale(user.id, payload);
    }

    @Post('/update')
    async updateSale(@User() user: AuthenticatedUser, @Body() payload: UpdateSaleDto) {
        await this.salesService.updateSale(user.id, payload);
    }

    @Delete('/:saleId')
    async deleteSale(
        @User() user: AuthenticatedUser,
        @Param() { saleId }: DeleteSaleDto,
    ) {
        await this.salesService.deleteSale(user.id, saleId);
    }
}
