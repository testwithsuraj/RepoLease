import Fastify from "fastify";
import dotenv from "dotenv";
import { webhookRoutes } from "./webhooks/webhook.router.js";
import "./jobs/queue.js";

dotenv.config();

const app = Fastify({ logger: true });

app.get("/", async () => {
  return {
    name: "RepoLease Backend Engine",
    status: "online",
    version: "1.0.0",
    docs: "GitHub-native access management via webhook listener",
    endpoints: {
      health: "/health",
      webhooks: "/api/webhooks"
    }
  };
});

app.get("/health", async () => {
  return { status: "ok", service: "RepoLease Engine" };
});

app.register(webhookRoutes);

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`RepoLease engine online at port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();