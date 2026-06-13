import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import type { SeasonYear } from '@psg/shared';
import { toHttpException } from '../../common/exceptions/http-exception.mapper';
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
        try {
            return await this.salesService.getCurrentSeasonSales(user.id);
        } catch (e) {
            throw toHttpException(e);
        }
    }

    @Get('/season/:seasonStartYear')
    async getSeasonSales(
        @User() user: AuthenticatedUser,
        @Param() { seasonStartYear }: GetSeasonSalesDto,
    ) {
        try {
            return await this.salesService.getSeasonSales(
                user.id,
                Number.parseInt(seasonStartYear, 10) as SeasonYear,
            );
        } catch (e) {
            throw toHttpException(e);
        }
    }

    @Get('/:saleId')
    async getSale(@User() user: AuthenticatedUser, @Param() { saleId }: GetSaleDto) {
        try {
            return await this.salesService.getSale(user.id, saleId);
        } catch (e) {
            throw toHttpException(e);
        }
    }

    @Get('/')
    async getSales(@User() user: AuthenticatedUser) {
        try {
            return await this.salesService.getSales(user.id);
        } catch (e) {
            throw toHttpException(e);
        }
    }

    @Post('/')
    async addSale(
        @User() user: AuthenticatedUser,
        @Body() payload: AddSaleDto,
    ): Promise<{ id: string }> {
        try {
            return await this.salesService.addSale(user.id, payload);
        } catch (e) {
            throw toHttpException(e);
        }
    }

    @Post('/update')
    async updateSale(@User() user: AuthenticatedUser, @Body() payload: UpdateSaleDto) {
        try {
            await this.salesService.updateSale(user.id, payload);
        } catch (e) {
            throw toHttpException(e);
        }
    }

    @Delete('/:saleId')
    async deleteSale(
        @User() user: AuthenticatedUser,
        @Param() { saleId }: DeleteSaleDto,
    ) {
        try {
            await this.salesService.deleteSale(user.id, saleId);
        } catch (e) {
            throw toHttpException(e);
        }
    }
}
