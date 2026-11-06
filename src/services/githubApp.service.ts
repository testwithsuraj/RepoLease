import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import fs from "fs";

const privateKey = process.env.GITHUB_PRIVATE_KEY
  ? process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n")
  : fs.existsSync(process.env.GITHUB_PRIVATE_KEY_PATH || "./certs/private-key.pem")
  ? fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH || "./certs/private-key.pem", "utf8")
  : "dummy-key-for-development";

export const githubApp = new App({
  appId: process.env.GITHUB_APP_ID || "0",
  privateKey,
  webhooks: {
    secret: process.env.GITHUB_WEBHOOK_SECRET || "development_secret",
  },
});

export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  const octokit = await githubApp.getInstallationOctokit(installationId);
  return octokit as unknown as Octokit;
}