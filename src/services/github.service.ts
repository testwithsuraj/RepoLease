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

export async function postGrantReply(
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
  const commentBody = [
    `✨ **Thank you!** Collaborator access has been assigned to @${username}.`,
    ``,
    `- **Permission:** \`${permission}\``,
    `- **Duration:** \`${duration}\``,
    `- **Expires at:** \`${expiresAt.toUTCString()}\``,
    ``,
    `> Access will automatically revoke once the timer ends.`
  ].join('\n');

  return client.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: commentBody,
  });
}

export async function postRevokeReply(
  octokit: any,
  owner: string,
  repo: string,
  issueNumber: number,
  username: string,
  reason: string = 'Lease expired'
) {
  const client = octokit.rest || octokit;
  const commentBody = [
    `⏱️ **Access Revoked:** Temporary lease for @${username} has concluded.`,
    `- **Reason:** ${reason}`,
    `- **Timestamp:** \`${new Date().toUTCString()}\``,
    ``,
    `Thank you!`
  ].join('\n');

  return client.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: commentBody,
  });
}