import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
export class CreateUserDto {
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  email!: string;

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  first_name!: string;

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  last_name!: string;

  @IsNotEmpty()
  @Length(8, 24)
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  password!: string;
}

export class LoginDto {
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }: { value: string }) => value.trim().toLowerCase())
  email!: string;

  @IsNotEmpty()
  @Length(8, 24)
  @IsString()
  @Transform(({ value }: { value: string }) => value.trim())
  password!: string;
}
