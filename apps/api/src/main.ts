import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const configService = app.get(ConfigService);
  const port = Number(configService.get('PORT', 3000));

  await app.listen(port);
  console.log(`Sabz System API is running at http://localhost:${port}/api/v1`);
}

void bootstrap();
