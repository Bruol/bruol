const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const USERNAME = "bruol"
const headers = {
  "Authorization": `Bearer ${GITHUB_TOKEN}`,
  "Accept": "application/vnd.github+json",
  "User-Agent": "bun-script"
}

interface Repo {
  name: string
  full_name: string
  owner: { login: string }
  private: boolean
}

interface Commit {
  sha: string
  commit: {
    message: string
    author: {
      name: string
      email: string
      date: string
    }
  }
  html_url: string
  repository?: { full_name: string }
}

async function fetchAllPages<T>(url: string): Promise<T[]> {
  const results: T[] = []
  let page = 1
  const perPage = 100

  while (true) {
    const separator = url.includes("?") ? "&" : "?"
    const response = await fetch(`${url}${separator}page=${page}&per_page=${perPage}`, { headers })
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`)
      break
    }
    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) break
    results.push(...data)
    if (data.length < perPage) break
    page++
  }

  return results
}

async function getCommitsForRepo(owner: string, repo: string): Promise<Commit[]> {
  const twoMonthsAgo = new Date()
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)
  const since = twoMonthsAgo.toISOString()

  const url = `https://api.github.com/repos/${owner}/${repo}/commits?author=${USERNAME}&since=${since}`
  return fetchAllPages<Commit>(url)
}

async function main() {
  if (!GITHUB_TOKEN) {
    console.error("GITHUB_TOKEN environment variable is required")
    process.exit(1)
  }

  console.log("Fetching user repos...")
  const userRepos = await fetchAllPages<Repo>(`https://api.github.com/users/${USERNAME}/repos`)
  console.log(`Found ${userRepos.length} user repos`)

  console.log("Fetching orgs...")
  const orgs = await fetchAllPages<{ login: string }>(`https://api.github.com/user/orgs`)
  console.log(`Found ${orgs.length} orgs: ${orgs.map(o => o.login).join(", ")}`)

  console.log("Fetching org repos...")
  const orgRepos: Repo[] = []
  for (const org of orgs) {
    const repos = await fetchAllPages<Repo>(`https://api.github.com/orgs/${org.login}/repos`)
    console.log(`  ${org.login}: ${repos.length} repos`)
    orgRepos.push(...repos)
  }

  interface RepoWithCommits {
    repo: Repo
    commits: Commit[]
  }

  const results = {
    user: USERNAME,
    fetchedAt: new Date().toISOString(),
    userRepos: [] as RepoWithCommits[],
    orgRepos: [] as RepoWithCommits[]
  }

  console.log("\nFetching commits for user repos...")
  for (const repo of userRepos) {
    const commits = await getCommitsForRepo(repo.owner.login, repo.name)
    if (commits.length > 0) {
      console.log(`  ${repo.full_name}: ${commits.length} commits`)
      results.userRepos.push({ repo, commits })
    }
  }

  console.log("\nFetching commits for org repos...")
  for (const repo of orgRepos) {
    const commits = await getCommitsForRepo(repo.owner.login, repo.name)
    if (commits.length > 0) {
      console.log(`  ${repo.full_name}: ${commits.length} commits`)
      results.orgRepos.push({ repo, commits })
    }
  }

  const outputFile = "github-data.json"
  await Bun.write(outputFile, JSON.stringify(results, null, 2))
  console.log(`\nWritten to ${outputFile}`)
}

main().catch(console.error)
