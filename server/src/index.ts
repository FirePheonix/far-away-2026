import { startGrpcServer } from "./grpc/server.js";
import { createHttpApp } from "./http/app.js";

const HTTP_PORT = Number(process.env.HTTP_PORT ?? 4000);
const GRPC_PORT = Number(process.env.GRPC_PORT ?? 50051);

startGrpcServer(GRPC_PORT);

const app = createHttpApp();

app.listen(HTTP_PORT, () => {
  console.log(`Express server listening on http://localhost:${HTTP_PORT}`);
});
