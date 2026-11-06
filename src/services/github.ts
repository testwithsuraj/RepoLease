// Post confirmation when access is granted
export async function postGrantConfirmation(
  octokit: any,
  owner: string,
  repo: string,
  issueNumber: number,
  username: string,
  duration: string,
  permission: string,
  expiresAt: Date
) {
  const body = `### 🛡️ RepoLease Access Granted
  
Thank you! Temporary collaborator access has been configured:
- **Collaborator:** @${username}
- **Permission Level:** \`${permission}\`
- **Lease Duration:** \`${duration}\`
- **Auto-Revocation At:** \`${expiresAt.toUTCString()}\`

> Access will be automatically removed once the lease expires. To revoke early, comment \`/repolease revoke @${username}\`.`;

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
}

// Post notification when access is revoked
export async function postRevocationNotice(
  octokit: any,
  owner: string,
  repo: string,
  issueNumber: number,
  username: string,
  reason: string = 'Lease expired'
) {
  const body = `### ⏱️ RepoLease Access Revoked
  
The temporary lease for @${username} has concluded:
- **Status:** Access removed
- **Reason:** ${reason}
- **Timestamp:** \`${new Date().toUTCString()}\`

Thank you for using RepoLease!`;

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
}
import { Octokit } from '@octokit/rest';

/**
 * Replies on the issue when access is successfully granted
 */
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
  const commentBody = [
    `### 🛡️ RepoLease Access Granted`,
    ``,
    `Thank you! Temporary collaborator access has been configured:`,
    `- **Collaborator:** @${username}`,
    `- **Permission:** \`${permission}\``,
    `- **Duration:** \`${duration}\``,
    `- **Auto-Revocation:** \`${expiresAt.toUTCString()}\``,
    ``,
    `> Access will be automatically removed when the lease finishes. To revoke manually before then, reply with \`/repolease revoke @${username}\`.`
  ].join('\n');

  return octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: commentBody,
  });
}

/**
 * Replies on the issue when the lease expires and access is stripped
 */
export async function postRevokeReply(
  octokit: any,
  owner: string,
  repo: string,
  issueNumber: number,
  username: string,
  reason: string = 'Lease expired'
) {
  const commentBody = [
    `### ⏱️ RepoLease Access Revoked`,
    ``,
    `The temporary access lease for @${username} has concluded:`,
    `- **Reason:** ${reason}`,
    `- **Timestamp:** \`${new Date().toUTCString()}\``,
    ``,
    `Thank you for using RepoLease!`
  ].join('\n');

  return octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: commentBody,
  });
}
