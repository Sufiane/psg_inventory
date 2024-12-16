import { Prisma } from '@prisma/client';
import { SalesService } from '../sales.service';

export type Sale = Prisma.SalesGetPayload<typeof SalesService.saleQuery>;
