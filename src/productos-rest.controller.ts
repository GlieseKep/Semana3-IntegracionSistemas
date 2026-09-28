import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  OnModuleInit,
  Param,
  ParseFloatPipe,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import {
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { status } from '@grpc/grpc-js';
import { Observable, catchError, firstValueFrom, throwError, toArray } from 'rxjs';
import { PRODUCTOS_PACKAGE } from './grpc.config.js';

interface ProductoResponse { id: number; nombre: string; precio: number; }

interface ProductoServiceClient {
  obtenerProducto(data: { id: number }): Observable<ProductoResponse>;
  listarProductos(data: object): Observable<ProductoResponse>;
  buscarPorPrecioMaximo(data: { precioMaximo: number }): Observable<ProductoResponse>;
}

class ProductoDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Teclado mecánico' })
  nombre: string;

  @ApiProperty({ example: 45.9 })
  precio: number;
}

class ErrorGrpcDto {
  @ApiProperty({ example: 5, description: 'Código de estado gRPC (5 = NOT_FOUND)' })
  code: number;

  @ApiProperty({ example: 'Producto 999 no existe' })
  details: string;
}

class PruebaClienteDto {
  @ApiProperty({ type: ProductoDto, description: 'ObtenerProducto (unary) con id 1' })
  obtenerProducto: ProductoDto;

  @ApiProperty({ type: [ProductoDto], description: 'ListarProductos (server streaming)' })
  listarProductos: ProductoDto[];

  @ApiProperty({ type: [ProductoDto], description: 'BuscarPorPrecioMaximo con precioMaximo = 50' })
  buscarPorPrecioMaximo: ProductoDto[];

  @ApiProperty({ type: ErrorGrpcDto, description: 'Prueba de error: ObtenerProducto con id 999' })
  pruebaError: ErrorGrpcDto;

  @ApiProperty({
    type: [String],
    description: 'Salida en texto, igual a la que imprime cliente.cjs por consola',
    example: ['== ObtenerProducto (unary) ==', '1 - Teclado mecánico - $45.9'],
  })
  consola: string[];
}

// Traduce los códigos de error gRPC a respuestas HTTP
function grpcAHttp(err: { code?: number; details?: string; message?: string }) {
  const httpStatus =
    err.code === status.NOT_FOUND
      ? HttpStatus.NOT_FOUND
      : err.code === status.INVALID_ARGUMENT
        ? HttpStatus.BAD_REQUEST
        : err.code === status.UNAVAILABLE
          ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.INTERNAL_SERVER_ERROR;
  return new HttpException(
    { statusCode: httpStatus, grpcCode: err.code, message: err.details ?? err.message },
    httpStatus,
  );
}

@ApiTags('productos')
@Controller('productos')
export class ProductosRestController implements OnModuleInit {
  private productoService: ProductoServiceClient;

  constructor(@Inject(PRODUCTOS_PACKAGE) private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.productoService = this.client.getService<ProductoServiceClient>('ProductoService');
  }

  @Get()
  @ApiOperation({ summary: 'Lista todos los productos (gRPC ListarProductos - server streaming)' })
  @ApiOkResponse({ type: [ProductoDto] })
  listar(): Promise<ProductoResponse[]> {
    return this.recolectar(this.productoService.listarProductos({}));
  }

  @Get('precio-maximo')
  @ApiOperation({ summary: 'Filtra productos por precio máximo (gRPC BuscarPorPrecioMaximo)' })
  @ApiQuery({ name: 'max', type: Number, example: 50 })
  @ApiOkResponse({ type: [ProductoDto] })
  buscarPorPrecioMaximo(@Query('max', ParseFloatPipe) max: number): Promise<ProductoResponse[]> {
    return this.recolectar(this.productoService.buscarPorPrecioMaximo({ precioMaximo: max }));
  }

  @Get('prueba-cliente')
  @ApiOperation({
    summary: 'Ejecuta la misma prueba que cliente.cjs y devuelve lo recibido',
    description:
      'Llama en secuencia a ObtenerProducto(1), ListarProductos, BuscarPorPrecioMaximo(50) y ObtenerProducto(999) para mostrar el error.',
  })
  @ApiOkResponse({ type: PruebaClienteDto })
  async pruebaCliente(): Promise<PruebaClienteDto> {
    const consola: string[] = [];
    const linea = (p: ProductoResponse, extra = '') =>
      `${p.id} - ${p.nombre} - $${p.precio}${extra}`;

    consola.push('== ObtenerProducto (unary) ==');
    const producto = await firstValueFrom(this.productoService.obtenerProducto({ id: 1 }));
    consola.push(linea(producto));

    consola.push('', '== ListarProductos (server streaming) ==');
    const lista = await firstValueFrom(this.productoService.listarProductos({}).pipe(toArray()));
    lista.forEach((p) => consola.push(linea(p, '  (llegó en streaming)')));
    consola.push('Streaming finalizado.');

    consola.push('', '== BuscarPorPrecioMaximo ==');
    const filtrados = await firstValueFrom(
      this.productoService.buscarPorPrecioMaximo({ precioMaximo: 50 }).pipe(toArray()),
    );
    filtrados.forEach((p) => consola.push(linea(p, '  (filtrado por precio)')));
    consola.push('Búsqueda por precio finalizada.');

    consola.push('', '== Prueba de error (id inexistente) ==');
    let pruebaError: ErrorGrpcDto;
    try {
      const inesperado = await firstValueFrom(this.productoService.obtenerProducto({ id: 999 }));
      pruebaError = { code: 0, details: `No debería llegar aquí: ${JSON.stringify(inesperado)}` };
    } catch (err: any) {
      pruebaError = { code: err.code, details: err.details ?? err.message };
    }
    consola.push(`Error gRPC: ${pruebaError.code} - ${pruebaError.details}`);

    return {
      obtenerProducto: producto,
      listarProductos: lista,
      buscarPorPrecioMaximo: filtrados,
      pruebaError,
      consola,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtiene un producto por id (gRPC ObtenerProducto - unary)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: ProductoDto })
  @ApiNotFoundResponse({ description: 'El producto no existe (gRPC NOT_FOUND)' })
  obtener(@Param('id', ParseIntPipe) id: number): Promise<ProductoResponse> {
    return firstValueFrom(
      this.productoService
        .obtenerProducto({ id })
        .pipe(catchError((err) => throwError(() => grpcAHttp(err)))),
    );
  }

  private recolectar(stream: Observable<ProductoResponse>): Promise<ProductoResponse[]> {
    return firstValueFrom(
      stream.pipe(
        toArray(),
        catchError((err) => throwError(() => grpcAHttp(err))),
      ),
    );
  }
}
