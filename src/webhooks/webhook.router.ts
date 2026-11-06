import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { 
  getInstallationOctokit, 
  postInitialLeaseComment, 
  updateLeaseCommentToRevoked 
} from '../services/github.service';
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
      const userCommentId = payload.comment.id;

      // Syntax: /repolease request @username 1m push
      const parts = commentBody.trim().split(/\s+/);
      const command = parts[1];
      const targetUser = parts[2]?.replace('@', '');
      const durationStr = parts[3] || '1m';
      const permission = (parts[4] || 'pull').toLowerCase();

      if (command === 'request' && targetUser) {
        const client = octokit.rest || octokit;

        // 1. Verify repo policy
        await fetchRepositoryPolicy(octokit, owner, repo);

        // 2. Grant repository collaborator role
        await client.repos.addCollaborator({
          owner,
          repo,
          username: targetUser,
          permission: permission as any,
        });

        const grantedAt = new Date();
        const durationMinutes = parseInt(durationStr.replace('m', '')) || 1;
        const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

        // 3. Post active lease card
        const statusComment = await postInitialLeaseComment(
          octokit,
          owner,
          repo,
          issueNumber,
          targetUser,
          durationStr,
          permission,
          expiresAt
        );

        // 4. Delete the triggering command comment to keep thread pristine
        try {
          await client.issues.deleteComment({
            owner,
            repo,
            comment_id: userCommentId,
          });
        } catch (delErr) {
          fastify.log.warn(`Could not delete user comment: ${delErr}`);
        }

        // 5. In-memory / Worker timeout to edit the comment upon lease expiry
        const delayMs = durationMinutes * 60 * 1000;
        setTimeout(async () => {
          try {
            // Revoke access from repository
            await client.repos.removeCollaborator({
              owner,
              repo,
              username: targetUser,
            });

            // Edit active comment into collapsed audit log
            await updateLeaseCommentToRevoked(
              octokit,
              owner,
              repo,
              statusComment.data.id,
              targetUser,
              durationStr,
              permission,
              grantedAt
            );
          } catch (revokeErr) {
            fastify.log.error(`Auto-revocation failed for ${targetUser}: ${revokeErr}`);
          }
        }, delayMs);

        return reply.status(200).send({ status: 'granted', targetUser, expiresAt });
      }
    }

    return reply.status(200).send({ status: 'event received' });
  });
}