import { Injectable } from '@nestjs/common';

export interface HealthCheckResult {
  status: 'ok';
  service: string;
  timestamp: string;
}

@Injectable()
export class HealthService {
  check(): HealthCheckResult {
    return {
      status: 'ok',
      service: 'sabz-api',
      timestamp: new Date().toISOString(),
    };
  }
}
