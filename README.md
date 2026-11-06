Run this command directly in PowerShell from `D:\repolease` to write the complete README, commit it, and push to GitHub:

```powershell
Set-Location D:\repolease
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$readmePath = "D:\repolease\README.md"
$readmeContent = @'
<p align="center">
  <img src="repolease-logo.svg" alt="RepoLease Logo" width="128" height="128" />
</p>

<h1 align="center">RepoLease</h1>

<p align="center">
  <b>Automated, time-bounded GitHub collaborator access management powered by issue commands.</b>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#command-reference">Commands</a> •
  <a href="#lifecycle">How It Works</a> •
  <a href="#repository-configuration">Configuration</a> •
  <a href="#license">License</a>
</p>

---

## Features

- ⏱️ **Time-Bounded Leases:** Grant temporary repository access that revokes automatically.
- 💬 **Issue Command Interface:** Manage access directly inside GitHub issues via clean slash commands.
- 🧹 **Zero Conversation Clutter:** Automatically purges trigger comments to keep discussion threads clean.
- 🔒 **In-Place Audit Logs:** Dynamic status cards seamlessly collapse into immutable audit records upon lease conclusion.
- 📋 **Declarative Repository Policies:** Enforce role constraints, duration limits, and approval policies via `.repolease.yml`.

---

## Command Reference

Issue commands directly in any repository issue:

| Command | Description | Example |
| :--- | :--- | :--- |
| `/repolease request @user <duration> <role>` | Provisions a timed collaborator lease on the repository. | `/repolease request @contributor 2h push` |
| `/repolease revoke @user` | Immediately revokes an active lease before the duration expires. | `/repolease revoke @contributor` |
| `/repolease status` | Displays active leases and remaining durations for this repository. | `/repolease status` |

### Supported Roles & Durations

- **Roles:** `pull` (Read-only), `triage` (Issue & PR triage), `push` (Write / Code contribution)
- **Durations:**
  - Minutes: `15m`, `30m`
  - Hours: `1h`, `2h`, `4h`, `12h`, `24h`
  - Days: `2d`, `7d` *(subject to repository configuration limits)*

---

## Lifecycle & Architecture

1. **Trigger:** A maintainer posts a `/repolease request` command on an issue.
2. **Sanitization:** The bot purges the raw command comment to maintain a tidy discussion history.
3. **Active Status:** A real-time status card displays the active collaborator role and expiration timestamp.
4. **Automated Revocation:** Once the lease timer expires, access is stripped via the GitHub API, and the status card updates in-place into an expandable audit summary.

---

## Repository Configuration

Target repositories can define custom access policies by placing a `.repolease.yml` file in the repository root:

```yaml
version: 1

settings:
  enabled: true
  default_duration: 24h
  max_duration: 30d

permissions:
  allowed:
    - pull
    - triage
    - push
  default: pull
  allow_admin: false

requests:
  allowed_durations:
    - 1h
    - 24h
    - 7d

notifications:
  on_grant: true
  on_expiry: true

revocation:
  automatic: true
  retry_failed: true

```
## License

MIT License. Designed and maintained for secure open-source and team collaboration.
