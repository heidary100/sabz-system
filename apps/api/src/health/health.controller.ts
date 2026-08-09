import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Check API and Redis connectivity' })
  @ApiResponse({ status: 200, description: 'API availability and Redis connectivity status' })
  check() {
    return this.healthService.check();
  }
}
