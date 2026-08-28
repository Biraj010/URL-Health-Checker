import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import batchesRoutes from "./routes/batches.js";
import batchEventsRoutes from "./routes/batch-events.js";

const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.get("/health", async () => {
  return { status: "ok" };
});

app.register(batchesRoutes, { prefix: "/batches" });
app.register(batchEventsRoutes, { prefix: "/batches" });

const port = Number(process.env.PORT_API ?? 4000);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    console.log(`api started on port ${port}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
