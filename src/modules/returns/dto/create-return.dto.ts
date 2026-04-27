import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, IsArray } from 'class-validator';
import { ReturnType } from 'src/drizzle/types/types';


export class CreateReturnDto {
    @IsString()
    @IsNotEmpty()
    order_item_id: string;
    @IsEnum(ReturnType)
    @IsNotEmpty()
    type: ReturnType;

    @IsString()
    @IsNotEmpty()
    reason: string;

    @IsString()
    @IsOptional()
    customer_note?: string;

}