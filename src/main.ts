import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  SwaggerModule,
  DocumentBuilder,
  SwaggerCustomOptions,
} from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000'];
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));
  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  app.use(helmet());
  app.enableVersioning();
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  const config = new DocumentBuilder()
    .setTitle('Techsonance Marketplace API')
    .setDescription('API documentation for Techsonance Marketplace')
    .setVersion('1.0')
    // .addServer(`http://localhost:${process.env.PORT ?? 8000}`)
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addSecurityRequirements('JWT-auth') // <-- second parameter is the name of the security scheme
    .addTag('auth', 'Authentication related endpoints')
    .addTag('users', 'User management endpoints')
    .addTag('products', 'Product management endpoints')
    .addTag('orders', 'Order management endpoints')
    .addTag('vendors', 'Vendor management endpoints')
    .addTag('tickets', 'Support ticket management endpoints')
    .build();
  const swaggerUiOptions: SwaggerCustomOptions = {
    swaggerOptions: {
      persistAuthorization: true, // Keeps token after refresh
    },
    customSiteTitle: 'API Documentation',
  };
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, swaggerUiOptions);
  await app.listen(process.env.PORT ?? 8000);
}
bootstrap();
