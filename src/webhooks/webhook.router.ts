import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import ms from "ms";
import { prisma } from "../database/client.js";
import { getInstallationOctokit } from "../services/githubApp.service.js";
import { fetchRepositoryPolicy } from "../services/policy.service.js";
import { scheduleRevocation } from "../jobs/queue.js";
import { PermissionLevel } from "@prisma/client";

export async function webhookRoutes(fastify: FastifyInstance) {
  fastify.post("/api/webhooks", async (req: FastifyRequest, reply: FastifyReply) => {
    const deliveryId = req.headers["x-github-delivery"] as string;
    const eventName = req.headers["x-github-event"] as string;
    const payload = req.body as any;

    if (!deliveryId) return reply.status(400).send({ error: "Missing delivery ID" });

    const existing = await prisma.processedWebhook.findUnique({ where: { deliveryId } });
    if (existing) return reply.status(200).send({ message: "Duplicate event acknowledged" });

    await prisma.processedWebhook.create({
      data: { deliveryId, eventType: eventName || "unknown" },
    });

    if (eventName === "installation") {
      if (payload.action === "created") {
        await prisma.installation.upsert({
          where: { id: BigInt(payload.installation.id) },
          create: {
            id: BigInt(payload.installation.id),
            accountLogin: payload.installation.account.login,
            accountId: BigInt(payload.installation.account.id),
            accountType: payload.installation.account.type,
          },
          update: {
            accountLogin: payload.installation.account.login,
          },
        });
      }
      return reply.status(200).send({ status: "handled" });
    }

    if (eventName === "issue_comment" && payload.action === "created") {
      const body = payload.comment.body.trim();
      if (!body.startsWith("/repolease")) return reply.status(200).send({ status: "ignored" });

      const parts = body.split(/\s+/);
      const command = parts[1]?.toLowerCase();
      const args = parts.slice(2);

      const installationId = payload.installation.id;
      const [owner, repo] = payload.repository.full_name.split("/");
      const issueNumber = payload.issue.number;

      const octokit = await getInstallationOctokit(installationId);

      await prisma.repository.upsert({
        where: { id: BigInt(payload.repository.id) },
        create: {
          id: BigInt(payload.repository.id),
          installationId: BigInt(installationId),
          name: payload.repository.name,
          fullName: payload.repository.full_name,
          isPrivate: payload.repository.private,
        },
        update: {
          fullName: payload.repository.full_name,
        },
      });

      const policy = await fetchRepositoryPolicy(octokit, owner, repo);
      if (!policy || !policy.settings.enabled) {
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: issueNumber,
          body: "⚠️ **RepoLease**: Repository configuration `.repolease.yml` is missing or disabled.",
        });
        return reply.status(200).send({ status: "disabled" });
      }

      if (command === "request") {
        const rawTarget = args[0]?.replace(/^@/, "");
        const rawDuration = args[1] || policy.settings.default_duration;
        const rawPerm = (args[2] || policy.permissions.default) as PermissionLevel;

        if (!rawTarget) {
          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: "❌ Usage: `/repolease request @username [duration] [permission]`",
          });
          return reply.status(200).send({ status: "invalid_syntax" });
        }

        const durationMs = ms(rawDuration as any);
        const maxMs = ms(policy.settings.max_duration as any);

        if (!durationMs || durationMs > maxMs) {
          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: `❌ Duration \`${rawDuration}\` is invalid or exceeds max limit (\`${policy.settings.max_duration}\`).`,
          });
          return reply.status(200).send({ status: "duration_rejected" });
        }

        const { data: targetUser } = await octokit.rest.users.getByUsername({ username: rawTarget });

        const request = await prisma.accessRequest.create({
          data: {
            installationId: BigInt(installationId),
            repositoryId: BigInt(payload.repository.id),
            issueNumber,
            commentId: BigInt(payload.comment.id),
            requesterLogin: payload.comment.user.login,
            requesterId: BigInt(payload.comment.user.id),
            targetUserLogin: targetUser.login,
            targetUserId: BigInt(targetUser.id),
            permission: rawPerm,
            durationString: rawDuration,
            status: policy.approval.required ? "PENDING" : "APPROVED",
          },
        });

        if (!policy.approval.required) {
          await octokit.rest.repos.addCollaborator({
            owner,
            repo,
            username: targetUser.login,
            permission: rawPerm,
          });

          const expiresAt = new Date(Date.now() + durationMs);
          const grant = await prisma.accessGrant.create({
            data: {
              requestId: request.id,
              installationId: BigInt(installationId),
              repositoryId: BigInt(payload.repository.id),
              targetUserLogin: targetUser.login,
              targetUserId: BigInt(targetUser.id),
              permission: rawPerm,
              expiresAt,
            },
          });

          await scheduleRevocation(grant.id, durationMs);

          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: `✅ **Access Granted**: @${targetUser.login} granted **${rawPerm}** permissions for **${rawDuration}** (Expires: \`${expiresAt.toISOString()}\`).`,
          });
        } else {
          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: `⏳ **Access Request Pending**: Access for @${targetUser.login} requires approval. An admin can run \`/repolease approve ${request.id}\`.`,
          });
        }
      }

      if (command === "approve") {
        const requestId = args[0];
        const request = await prisma.accessRequest.findUnique({ where: { id: requestId } });

        if (!request || request.status !== "PENDING") {
          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: "❌ Invalid or already-processed request ID.",
          });
          return reply.status(200).send({ status: "invalid_request" });
        }

        const durationMs = ms(request.durationString as any);
        const expiresAt = new Date(Date.now() + durationMs);

        await octokit.rest.repos.addCollaborator({
          owner,
          repo,
          username: request.targetUserLogin,
          permission: request.permission,
        });

        await prisma.accessRequest.update({
          where: { id: request.id },
          data: { status: "APPROVED" },
        });

        const grant = await prisma.accessGrant.create({
          data: {
            requestId: request.id,
            installationId: request.installationId,
            repositoryId: request.repositoryId,
            targetUserLogin: request.targetUserLogin,
            targetUserId: request.targetUserId,
            permission: request.permission,
            expiresAt,
          },
        });

        await scheduleRevocation(grant.id, durationMs);

        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: issueNumber,
          body: `✅ **Approved**: @${request.targetUserLogin} granted **${request.permission}** until \`${expiresAt.toISOString()}\`.`,
        });
      }
    }

    return reply.status(200).send({ status: "success" });
  });
}