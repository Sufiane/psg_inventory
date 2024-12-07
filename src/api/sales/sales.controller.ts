import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { User } from '../../shared/decorators/user.decorator';
import { Users } from '@prisma/client';
import { GetSaleDto } from './dto/get-sale.dto';
import { SalesService } from './sales.service';
import { AddSaleDto } from './dto/add-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { DeleteSaleDto } from './dto/delete-sale.dto';

@Controller('sales')
export class SalesController {

    constructor(private readonly salesService: SalesService) {
    }

    @Get('/:saleId')
    getSale(@User() user: Users, @Param() { saleId }: GetSaleDto) {
        return this.salesService.getSale(user.id, saleId);
    }

    @Get('/')
    getSales(@User() user: Users) {
        return this.salesService.getSales(user.id);
    }

    @Post('/')
    async addSale(@User() user: Users, @Body() payload: AddSaleDto): Promise<void> {
        await this.salesService.addSale(user.id, payload);
    }

    @Post('/update')
    async updateSale(@User() user: Users, @Body() payload: UpdateSaleDto) {
        await this.salesService.updateSale(user.id, payload);
    }

    @Delete('/:saleId')
    async deleteSale(@User() user: Users, @Param() { saleId }: DeleteSaleDto) {
        await this.salesService.deleteSale(user.id, saleId);
    }
}
