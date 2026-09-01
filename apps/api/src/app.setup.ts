import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { parseTrustProxy } from './trust-proxy.util';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const configService = app.get(ConfigService);

  const trustProxy = configService.get<string>('TRUST_PROXY');
  const parsedTrustProxy = trustProxy ? parseTrustProxy(trustProxy) : null;
  if (parsedTrustProxy !== null) {
    app.getHttpAdapter().getInstance().set('trust proxy', parsedTrustProxy);
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
        },
      },
    }),
  );

  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.enableCors({ origin: corsOrigins, credentials: true });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  if (configService.get<string>('NODE_ENV') !== 'production') {
    setupSwagger(app);
  }
}

function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Sabz System API')
    .setDescription('REST API for the Sabz System e-commerce platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
    swaggerOptions: { persistAuthorization: true },
  });
}
