import { ApiProperty } from '@nestjs/swagger';

export class TestConnectionResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether the connection test was successful',
  })
  success: boolean;

  @ApiProperty({
    example: 'Connection successful',
    description: 'Status message',
  })
  message: string;

  @ApiProperty({
    example: null,
    description: 'Error message if connection failed',
    required: false,
  })
  error?: string;
}
