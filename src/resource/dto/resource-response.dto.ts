import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class ResourceResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty({ required: false, nullable: true }) description!:
    | string
    | null;
  @Expose() @ApiProperty() ownerId!: string;
  @Expose() @ApiProperty() createdAt!: Date;
  @Expose() @ApiProperty() updatedAt!: Date;
}
