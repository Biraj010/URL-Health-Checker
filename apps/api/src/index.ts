import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// TODO: register routes here once schemas from schemas/batch.schema.ts are wired up

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
