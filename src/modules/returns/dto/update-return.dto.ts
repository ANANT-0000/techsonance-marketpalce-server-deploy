import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ReturnStatus } from 'src/drizzle/types/types';

export class UpdateReturnDto {
    @IsEnum(ReturnStatus)
    @IsNotEmpty()
    status: ReturnStatus;

    @IsString()
    @IsOptional()
    store_owner_note?: string;

    @IsString()
    @IsNotEmpty()
    request_for: string;

    @IsString()
    @IsOptional()
    tracking_id?: string;
}