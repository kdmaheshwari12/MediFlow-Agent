import "dotenv/config";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { config } from "./config";
import { patientGraph } from "./graph/patientGraph";
import { getLlm } from "./services/llm";

const app = Fastify({
  logger: {
    level: "info",
    redact: ["req.headers.authorization", "req.headers['x-user-token']"],
  },
  bodyLimit: 64 * 1024,
});

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Sirf MediFlow backend is service ko call kar sakta hai, aur doctor ka token saath chahiye.
function authenticate(req: FastifyRequest, reply: FastifyReply): string | null {
  const header = req.headers.authorization ?? "";
  if (!header) {
    req.log.warn("auth failed: reason=missing_authorization");
    reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
    return null;
  }
  if (!safeEqual(header, `Bearer ${config.AGENT_SERVICE_TOKEN}`)) {
    req.log.warn("auth failed: reason=token_mismatch");
    reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
    return null;
  }
  const userToken = req.headers["x-user-token"];
  if (typeof userToken !== "string" || userToken.length < 20) {
    req.log.warn("auth failed: reason=missing_x_user_token");
    reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
    return null;
  }
  return userToken;
}


async function run(
  mode: "summary" | "followup",
  input: { mrn: string; followUpId?: string; medicalRecordId?: string },
  userToken: string,
) {
  const runId = randomUUID();
  const result = await patientGraph.invoke(
    { mode, runId, userToken, ...input },
    // LangSmith mein patient ki shanakht (MRN) metadata mein nahi jati.
    { runName: `z360-${mode}`, tags: ["z360", mode], metadata: { runId, mode } },
  );
  return { runId, result };
}

app.get("/health", async () => ({ status: "ok" }));

// Patient history ka summary (sirf purane patients ke liye).
app.post("/v1/history-summary", async (req, reply) => {
  const userToken = authenticate(req, reply);
  if (!userToken) return;

  const body = z.object({ mrn: z.string().trim() }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid request" } });

  const { runId, result } = await run("summary", { mrn: body.data.mrn.toUpperCase() }, userToken);
  if (result.error) {
    return reply.code(502).send({ error: { ...result.error, runId }, events: result.events });
  }
  return {
    runId,
    isReturning: result.isReturning ?? false,
    visitCount: result.visitCount ?? 0,
    summary: result.summary ?? null,
    events: result.events,
  };
});

app.post("/history", async (req, reply) => {
  return (app as any).inject({ method: "POST", url: "/v1/history-summary", headers: req.headers, payload: req.body }).then((res: any) => {
    reply.code(res.statusCode).headers(res.headers).send(res.body);
  });
});

// Checkup ke baad follow-up draft.
app.post("/v1/followup-draft", async (req, reply) => {
  const userToken = authenticate(req, reply);
  if (!userToken) return;

  const body = z
    .object({
      mrn: z.string().trim(),
      followUpId: z.string().min(1),
      medicalRecordId: z.string().min(1),
    })
    .safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid request" } });

  const { runId, result } = await run(
    "followup",
    { ...body.data, mrn: body.data.mrn.toUpperCase() },
    userToken,
  );
  if (result.error) {
    return reply.code(502).send({ error: { ...result.error, runId }, events: result.events });
  }
  return {
    runId,
    followUp: result.followUp ?? null,
    guardrails: result.guardrails ?? null,
    sendStatus: result.sendStatus ?? "not_applicable",
    events: result.events,
  };
});

app.post("/draft-message", async (req, reply) => {
  return (app as any).inject({ method: "POST", url: "/v1/followup-draft", headers: req.headers, payload: req.body }).then((res: any) => {
    reply.code(res.statusCode).headers(res.headers).send(res.body);
  });
});

app.post("/send-message", async (req, reply) => {
  const userToken = authenticate(req, reply);
  if (!userToken) return;
  const body = z.object({ followUpId: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid request" } });
  
  const { requestFollowUpSend } = await import("./services/smsService");
  const res = await requestFollowUpSend(body.data.followUpId, userToken);
  return reply.send({ status: "sent", result: res });
});

// Sirf development mein: Groq + LangSmith ka test (is mein patient ka koi data nahi).
if (config.NODE_ENV !== "production") {
  app.get("/v1/dev/ping", async (req, reply) => {
    const header = req.headers.authorization ?? "";
    if (!safeEqual(header, `Bearer ${config.AGENT_SERVICE_TOKEN}`)) return reply.code(401).send({ error: "Unauthorized" });
    const res = await getLlm().invoke("Reply with the single word: OK");
    return { model: config.GROQ_MODEL, reply: String(res.content).slice(0, 50) };
  });
}

app.listen({ port: config.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});