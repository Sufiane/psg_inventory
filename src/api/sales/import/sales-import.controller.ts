import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Param,
    Post,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { toHttpException } from '../../../common/exceptions/http-exception.mapper';
import { User } from '../../../shared/decorators/user.decorator';
import { AuthenticatedUser } from '../../../shared/types/authenticated-user.type';
import { CommitRequestDto } from './dto/commit-request.dto';
import { DeleteBatchDto } from './dto/delete-batch.dto';
import { PreviewRequestDto } from './dto/preview-request.dto';
import { PreviewResponse } from './dto/preview-response.dto';
import { SalesImportService, CommitResult } from './sales-import.service';

const MAX_UPLOAD_BYTES = 512 * 1024;

@Controller('sales/import')
export class SalesImportController {
    constructor(private readonly salesImportService: SalesImportService) {}

    @Post('preview')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
    async preview(
        @User() user: AuthenticatedUser,
        @UploadedFile() file: Express.Multer.File | undefined,
        @Body() body: PreviewRequestDto,
    ): Promise<PreviewResponse> {
        if (file == null) {
            throw new BadRequestException('file_required');
        }

        try {
            return await this.salesImportService.preview(
                user.id,
                file.buffer,
                body.selectedPassIds,
            );
        } catch (error) {
            throw toHttpException(error);
        }
    }

    @Post('commit')
    async commit(
        @User() user: AuthenticatedUser,
        @Body() body: CommitRequestDto,
    ): Promise<CommitResult> {
        try {
            return await this.salesImportService.commit(user.id, body);
        } catch (error) {
            throw toHttpException(error);
        }
    }

    @Delete(':batchId')
    async revert(
        @User() user: AuthenticatedUser,
        @Param() params: DeleteBatchDto,
    ): Promise<{ deleted: number }> {
        try {
            return await this.salesImportService.revert(user.id, params.batchId);
        } catch (error) {
            throw toHttpException(error);
        }
    }
}
