import path from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { statusResponseSchema } from "../schemas/landing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = path.resolve(__dirname, "landing.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const landingProto = grpc.loadPackageDefinition(packageDefinition).landing as grpc.GrpcObject;
const LandingService = landingProto.LandingService as grpc.ServiceClientConstructor;

export function startGrpcServer(port: number): grpc.Server {
  const server = new grpc.Server();

  server.addService(LandingService.service, {
    GetStatus: (
      _call: grpc.ServerUnaryCall<Record<string, never>, unknown>,
      callback: grpc.sendUnaryData<unknown>,
    ) => {
      const response = statusResponseSchema.parse({
        message: "Far Away Japan API is online",
        version: "0.1.0",
        healthy: true,
      });

      callback(null, response);
    },
  });

  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (error, boundPort) => {
      if (error) {
        console.error("gRPC bind failed:", error);
        return;
      }
      console.log(`gRPC server listening on port ${boundPort}`);
    },
  );

  return server;
}
