# Access model

Rancher Overwatch never has more access than the person using it.

## Enforcement

All data is fetched in the browser through the Rancher API with the **signed-in user's own session** (`/v1/management.cattle.io.*` for Rancher objects and `/k8s/clusters/<id>/v1/rbac.authorization.k8s.io.*` for Kubernetes RBAC). Rancher decides what each request returns. The extension holds no service account and stores nothing.

The UI then adapts so nobody stares at a wall of 403 errors:

1. **Menu entry.** The product is registered with `ifHaveType` for the three binding types, so it only appears for accounts whose schema includes `globalrolebinding`, `clusterroletemplatebinding` or `projectroletemplatebinding`.
2. **Capability check.** On load the page asks the store which resource types the account can *list* and requests only those. Anything else is recorded as *restricted*, not as an error.
3. **Access tier.** From those capabilities the page picks a tier and shows it as a banner:

| Tier | Condition | Behaviour |
|---|---|---|
| Administrator | passes the same check Rancher's own dashboard uses (may edit settings and feature flags and manage apps, repositories and Helm operations) | everything, including users, tokens, global roles and the audit log |
| Cluster-level / project-level access | can list cluster or project role bindings but is not an administrator | only the bindings Rancher returns for them; users, tokens, global roles and global role bindings are reported as unavailable; the audit log tab is hidden |
| No access | cannot list any role binding | a short explanation, no data |

## What a cluster owner sees

Rancher lets cluster owners read the role bindings of their cluster and its projects, and gives them cluster-admin inside that cluster. They cannot list the user directory, API tokens or global roles, so subjects appear as the user IDs used in the bindings, and tokens are absent. The Rancher audit log lives in the Rancher pods and needs pod-log access in `cattle-system`, so it is reserved for administrators.

## Demo mode

**Show demo data** loads built-in sample objects. **View as** then applies the restrictions Rancher's API would impose on a cluster owner or a project owner (`restrictRaw` in `pkg/rancher-overwatch/rbac/access.js`), so the tiers can be compared without extra accounts. This is a preview based on the expected API behaviour, not a replacement for testing with real accounts.
