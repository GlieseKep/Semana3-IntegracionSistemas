import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PRODUCTOS_PACKAGE = 'PRODUCTOS_PACKAGE';
export const PROTO_PATH = join(__dirname, 'productos.proto');
export const GRPC_PORT = Number(process.env.GRPC_PORT || 5000);
export const HTTP_PORT = Number(process.env.PORT || 3000);
