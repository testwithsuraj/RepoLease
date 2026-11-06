import yaml from "js-yaml";
import { Octokit } from "@octokit/rest";
import { z } from "zod";

const RepoLeasePolicySchema = z.object({
  version: z.number().default(1),
  settings: z.object({
    enabled: z.boolean().default(true),
    default_duration: z.string().default("24h"),
    max_duration: z.string().default("30d"),
  }).default({}),
  permissions: z.object({
    allowed: z.array(z.enum(["pull", "triage", "push", "maintain", "admin"])).default(["pull", "triage", "push"]),
    default: z.enum(["pull", "triage", "push", "maintain", "admin"]).default("pull"),
    allow_admin: z.boolean().default(false),
  }).default({}),
  approval: z.object({
    required: z.boolean().default(true),
    approvers: z.array(z.string()).default(["repo-admins"]),
    self_approval: z.boolean().default(false),
  }).default({}),
  requests: z.object({
    allowed_durations: z.array(z.string()).default(["1h", "6h", "24h", "7d", "14d", "30d"]),
  }).default({}),
  revocation: z.object({
    automatic: z.boolean().default(true),
    retry_failed: z.boolean().default(true),
  }).default({}),
});

export type RepoLeasePolicy = z.infer<typeof RepoLeasePolicySchema>;

export async function fetchRepositoryPolicy(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<RepoLeasePolicy | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: ".repolease.yml",
    });

    if ("content" in data && data.content) {
      const rawYaml = Buffer.from(data.content, "base64").toString("utf8");
      const parsed = yaml.load(rawYaml);
      return RepoLeasePolicySchema.parse(parsed);
    }
  } catch (error: any) {
    if (error.status === 404) return null;
    throw error;
  }
  return null;
}