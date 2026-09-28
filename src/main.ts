import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { GRPC_PORT, HTTP_PORT, PROTO_PATH } from './grpc.config.js';

async function bootstrap() {
  // Aplicación híbrida: API REST (para el usuario) + microservicio gRPC
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'productos',
      protoPath: PROTO_PATH,
      url: `0.0.0.0:${GRPC_PORT}`,
    },
  });

  const config = new DocumentBuilder()
    .setTitle('API REST de Productos')
    .setDescription(
      'Gateway REST que consume el microservicio gRPC ProductoService (productos.proto)',
    )
    .setVersion('1.0')
    .addTag('productos')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.startAllMicroservices();
  console.log(`Microservicio gRPC escuchando en 0.0.0.0:${GRPC_PORT}`);

  await app.listen(HTTP_PORT);
  console.log(`API REST escuchando en http://localhost:${HTTP_PORT}`);
  console.log(`Swagger disponible en http://localhost:${HTTP_PORT}/api`);
}
bootstrap();
