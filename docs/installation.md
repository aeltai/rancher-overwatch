# Installation

Rancher Overwatch is published as a Rancher extension repository on the `gh-pages` branch of this GitHub repository. You add that repository to Rancher once, then install, update and remove the extension from Rancher's **Extensions** page.

## Requirements

- Rancher **2.15** or newer.
- A Rancher user allowed to manage extensions (an administrator).
- The Rancher server must be able to reach `github.com` and `raw.githubusercontent.com`. Rancher downloads the extension code from there and serves it to browsers itself.

## 1. Add the extension repository

In the Rancher UI:

1. Open the menu (☰) and choose **Extensions**.
2. Open the **⋮** menu at the top right and choose **Manage Repositories**, then **Create**.
3. Fill in:

   | Field | Value |
   |---|---|
   | Name | `rancher-overwatch` |
   | Target | Git repository containing Helm chart or cluster template definitions |
   | Git Repo URL | `https://github.com/aeltai/rancher-overwatch.git` |
   | Git Branch | `gh-pages` |

4. Click **Create** and wait until the repository shows **Active**.

Or with `kubectl` against the Rancher local cluster:

```yaml
apiVersion: catalog.cattle.io/v1
kind: ClusterRepo
metadata:
  name: rancher-overwatch
spec:
  gitRepo: https://github.com/aeltai/rancher-overwatch.git
  gitBranch: gh-pages
```

## 2. Install the extension

1. Go back to **Extensions** and open the **Available** tab. If Rancher Overwatch is not listed yet, refresh the repository from **Manage Repositories** (⋮ → **Refresh**).
2. On the **Rancher Overwatch** card click **Install**, pick the version (for example `0.1.0`) and confirm.
3. When Rancher asks, click **Reload**.

**Rancher Overwatch** now appears in the menu (☰) under *Global Apps*. Which data each user sees depends on their own Rancher permissions; see [Access model](access-model.md).

## Update

When a new version is released, Rancher shows it on the **Installed** tab of **Extensions**. Click **Update** on the Rancher Overwatch card, choose the version, and reload when asked. If the new version is not shown, refresh the repository first.

## Uninstall

On **Extensions → Installed**, click **Uninstall** on the Rancher Overwatch card and reload. To remove the repository as well, delete `rancher-overwatch` under **Manage Repositories**.

## Releasing a new version (maintainers)

1. Bump `version` in `pkg/rancher-overwatch/package.json` (for example to `0.2.0`) and push to `main`.
2. Create a GitHub release whose tag is `rancher-overwatch-<version>` (for example `rancher-overwatch-0.2.0`). The tag must match the package name and version exactly.
3. The **Release** workflow (`.github/workflows/release.yml`) builds the extension and its Helm chart and commits them to the `gh-pages` branch. Rancher picks up the new version on its next repository refresh.
