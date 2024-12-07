import { IsBoolean, IsOptional } from 'class-validator';

export class GetCurrentSeasonDto {
  @IsOptional()
  @IsBoolean()
  withResult?: boolean;
}
