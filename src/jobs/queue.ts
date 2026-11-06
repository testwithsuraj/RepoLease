import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import { prisma } from "../database/client.js";
import { getInstallationOctokit } from "../services/githubApp.service.js";

const redisConnection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const revocationQueue = new Queue("revocationQueue", { connection: redisConnection });

export async function scheduleRevocation(grantId: string, delayMs: number) {
  await revocationQueue.add(
    "revokeAccess",
    { grantId },
    {
      delay: delayMs,
      jobId: `revoke_${grantId}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: true,
    }
  );
}

export const revocationWorker = new Worker(
  "revocationQueue",
  async (job: Job<{ grantId: string }>) => {
    const { grantId } = job.data;
    const grant = await prisma.accessGrant.findUnique({
      where: { id: grantId },
      include: { repository: true },
    });

    if (!grant || grant.status !== "ACTIVE") return;

    const octokit = await getInstallationOctokit(Number(grant.installationId));
    const [owner, repo] = grant.repository.fullName.split("/");

    try {
      await octokit.rest.repos.removeCollaborator({
        owner,
        repo,
        username: grant.targetUserLogin,
      });

      await prisma.accessGrant.update({
        where: { id: grant.id },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          installationId: grant.installationId,
          repositoryId: grant.repositoryId,
          action: "ACCESS_REVOKED_AUTOMATIC",
          actorLogin: "repolease[bot]",
          targetLogin: grant.targetUserLogin,
          details: { grantId: grant.id, reason: "Scheduled duration reached" },
        },
      });

      const request = await prisma.accessRequest.findUnique({ where: { id: grant.requestId } });
      if (request) {
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: request.issueNumber,
          body: `🔒 **RepoLease Notice**: Temporary access for @${grant.targetUserLogin} has ended and direct collaborator permissions have been revoked.`,
        });
      }
    } catch (err: any) {
      await prisma.accessGrant.update({
        where: { id: grant.id },
        data: {
          retryCount: { increment: 1 },
          status: "REVOCATION_FAILED",
        },
      });
      throw err;
    }
  },
  { connection: redisConnection }
);