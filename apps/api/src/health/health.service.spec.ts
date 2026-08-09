import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(() => {
    service = new HealthService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return an ok health status', () => {
    const result = service.check();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('sabz-api');
    expect(result.timestamp).toEqual(expect.any(String));
  });
});
