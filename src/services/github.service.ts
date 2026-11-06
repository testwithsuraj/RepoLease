import { App, Octokit } from 'octokit';
import * as fs from 'fs';
import * as path from 'path';

let appInstance: App | null = null;

export function getGitHubApp(): App {
  if (!appInstance) {
    const appId = process.env.GITHUB_APP_ID;
    const privateKeyPath = process.env.GITHUB_PRIVATE_KEY_PATH || './certs/private-key.pem';
    
    const resolvedKeyPath = path.isAbsolute(privateKeyPath)
      ? privateKeyPath
      : path.join(process.cwd(), privateKeyPath);

    if (!fs.existsSync(resolvedKeyPath)) {
      throw new Error(`Private key not found at path: ${resolvedKeyPath}`);
    }

    const privateKey = fs.readFileSync(resolvedKeyPath, 'utf8');

    appInstance = new App({
      appId: appId!,
      privateKey: privateKey,
    });
  }
  return appInstance;
}

export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  const app = getGitHubApp();
  return (await app.getInstallationOctokit(installationId)) as Octokit;
}

/**
 * Creates the initial active lease message on the issue
 */
export async function postInitialLeaseComment(
  octokit: any,
  owner: string,
  repo: string,
  issueNumber: number,
  username: string,
  duration: string,
  permission: string,
  expiresAt: Date
) {
  const client = octokit.rest || octokit;
  const body = [
    `### 🟢 RepoLease: Active Collaborator Access`,
    ``,
    `Access has been granted to @${username}:`,
    `- **Permission:** \`${permission}\``,
    `- **Duration:** \`${duration}\``,
    `- **Auto-Revocation:** \`${expiresAt.toUTCString()}\``,
    ``,
    `> ⏱️ *This status card will automatically collapse and log audit details once the lease concludes.*`
  ].join('\n');

  return client.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
}

/**
 * Replaces the active status card with a collapsed audit summary
 */
export async function updateLeaseCommentToRevoked(
  octokit: any,
  owner: string,
  repo: string,
  commentId: number,
  username: string,
  duration: string,
  permission: string,
  grantedAt: Date
) {
  const client = octokit.rest || octokit;
  const revokedAt = new Date();

  const body = [
    `<details>`,
    `<summary>🔒 <b>RepoLease: Access Expired & Revoked (@${username})</b></summary>`,
    ``,
    `| Attribute | Detail |`,
    `| :--- | :--- |`,
    `| **Collaborator** | @${username} |`,
    `| **Granted Role** | \`${permission}\` |`,
    `| **Lease Duration** | \`${duration}\` |`,
    `| **Granted At** | ${grantedAt.toUTCString()} |`,
    `| **Revoked At** | ${revokedAt.toUTCString()} |`,
    `| **Status** | Revoked (Access Cleaned) |`,
    ``,
    `*Session concluded automatically. Audit log preserved.*`,
    `</details>`
  ].join('\n');

  return client.issues.updateComment({
    owner,
    repo,
    comment_id: commentId,
    body,
  });
}