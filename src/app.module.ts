import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { ProductosRestController } from './productos-rest.controller.js';
import { GRPC_PORT, PRODUCTOS_PACKAGE, PROTO_PATH } from './grpc.config.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'nestjs-productos-grpc',
    }),
    // Cliente gRPC que usa el gateway REST para hablar con ProductoService
    ClientsModule.register([
      {
        name: PRODUCTOS_PACKAGE,
        transport: Transport.GRPC,
        options: {
          package: 'productos',
          protoPath: PROTO_PATH,
          url: `localhost:${GRPC_PORT}`,
        },
      },
    ]),
  ],
  controllers: [AppController, ProductosRestController],
})
export class AppModule {}
