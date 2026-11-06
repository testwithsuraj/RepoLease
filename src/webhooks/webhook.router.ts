import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getInstallationOctokit, postGrantReply } from '../services/github.service';
import { fetchRepositoryPolicy } from '../services/policy.service';

export async function webhookRoutes(fastify: FastifyInstance) {
  fastify.post('/api/webhooks', async (request: FastifyRequest, reply: FastifyReply) => {
    const event = request.headers['x-github-event'] as string;
    const payload: any = request.body;

    if (event === 'ping') {
      return reply.status(200).send({ msg: 'pong' });
    }

    if (event === 'issue_comment' && payload.action === 'created') {
      const commentBody: string = payload.comment?.body || '';
      if (!commentBody.startsWith('/repolease')) {
        return reply.status(200).send({ msg: 'ignored non-command comment' });
      }

      const installationId = payload.installation?.id;
      if (!installationId) {
        throw new Error('No installation ID found in payload');
      }

      const octokit = await getInstallationOctokit(installationId);
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      const issueNumber = payload.issue.number;
      const commentId = payload.comment.id;

      // Parse: /repolease request @username 1m push
      const parts = commentBody.trim().split(/\s+/);
      const command = parts[1];
      const targetUser = parts[2]?.replace('@', '');
      const durationStr = parts[3] || '1m';
      const permission = (parts[4] || 'pull').toLowerCase();

      if (command === 'request' && targetUser) {
        const client = octokit.rest || octokit;

        // 1. Fetch policy
        await fetchRepositoryPolicy(octokit, owner, repo);

        // 2. Add collaborator on GitHub
        await client.repos.addCollaborator({
          owner,
          repo,
          username: targetUser,
          permission: permission as any,
        });

        // 3. Compute expiration
        const durationMinutes = parseInt(durationStr.replace('m', '')) || 1;
        const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

        // 4. Post concise thank-you confirmation
        await postGrantReply(
          octokit,
          owner,
          repo,
          issueNumber,
          targetUser,
          durationStr,
          permission,
          expiresAt
        );

        // 5. Delete original command comment so issue thread stays clean
        try {
          await client.issues.deleteComment({
            owner,
            repo,
            comment_id: commentId,
          });
        } catch (delErr) {
          fastify.log.warn(`Could not delete user comment: ${delErr}`);
        }

        return reply.status(200).send({ status: 'granted', targetUser, expiresAt });
      }
    }

    return reply.status(200).send({ status: 'event received' });
  });
}