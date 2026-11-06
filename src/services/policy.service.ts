import yaml from 'js-yaml';

export async function fetchRepositoryPolicy(octokit: any, owner: string, repo: string) {
  if (!octokit) {
    throw new Error("Invalid or unauthenticated Octokit instance passed to fetchRepositoryPolicy");
  }

  const client = octokit.rest ? octokit.rest : octokit;

  try {
    const response: any = await client.repos.getContent({
      owner,
      repo,
      path: '.repolease.yml',
    });

    if ('content' in response.data) {
      const decoded = Buffer.from(response.data.content, 'base64').toString('utf8');
      return yaml.load(decoded) as any;
    }
  } catch (error: any) {
    if (error.status === 404) {
      return {
        approval: { required: false },
        permissions: { allowed: ['pull', 'triage', 'push'] },
        settings: { default_duration: '24h' }
      };
    }
    throw error;
  }
}