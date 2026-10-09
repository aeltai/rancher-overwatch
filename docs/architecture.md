# Architecture

```
Rancher UI (browser)
  └─ Rancher Overwatch (UI extension, no backend)
       ├─ loader.js      read-only GETs with the user's session
       ├─ normalize.js   raw objects → subjects, roles, grants
       ├─ access.js      who may see what
       ├─ effective.js   effective permissions + findings
       ├─ audit.js       audit-log parsing and analysis
       ├─ graph.js       graph building and layered layout
       └─ components/    Vue 3 views
```

There is no server component.

## Model

`buildModel(raw)` turns Rancher and Kubernetes objects into three collections:

- **subjects**: users, groups, service accounts and tokens (tokens act with their owner's permissions; a cluster-scoped token is limited to that cluster),
- **roles**: GlobalRoles, RoleTemplates (with inheritance resolved), ClusterRoles (aggregation resolved) and Roles, each with its resolved rules,
- **grants**: one entry per binding: subject, role, scope (global, cluster, project or namespace) and whether Rancher generated it.

Kubernetes users named after Rancher user IDs (`u-xxxx`) or principal IDs are mapped back onto the Rancher user, so both layers describe the same person.

## Capability areas and levels

Rules are collapsed into capability areas (Workloads, Secrets, Config, Networking, Storage, Cluster, Identity & RBAC, Exec & Proxy, Rancher, GitOps, Other) and a level:

| Level | Meaning |
|---|---|
| Read | get, list or watch |
| Read / write | any create, update, patch, delete |
| Full control | every verb |

A subject's access in an area is tracked separately for *wide* scope (global or cluster) and *limited* scope (project, namespace or named resources).

## Layout

`pkg/rancher-overwatch/`

- `index.js`, `product.js`, `routing/`, `l10n/`: extension registration (route under Rancher's header-only `plain` template, so there is no side navigation)
- `RbacViewerPage.vue` (page entry): loads data, derives the access tier, owns demo mode
- `components/`: `RbacExplorer` (shell of the page), `AccessGraph`, `PermissionMatrix`, `SubjectExplorer`, `AuditPanel`, `RiskPanel`, `DetailDrawer`
- `rbac/`: the pure logic; no Vue or Rancher imports, so it runs under plain Node for tests
