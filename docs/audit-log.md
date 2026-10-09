# Audit log

Rancher does not offer an API to query audit events. They are written by Rancher itself and have to be collected from where they land.

## Sources

| Source | How |
|---|---|
| **Load from Rancher** | Reads the `rancher-audit-log` sidecar of the Rancher pods in `cattle-system` through the Kubernetes pod-log API (`/k8s/clusters/local/api/v1/namespaces/cattle-system/pods/<pod>/log?container=rancher-audit-log`). Needs the Helm chart option `auditLog.enabled=true` (level 1 or higher) with `auditLog.destination=sidecar`, and permission to read pod logs there. |
| **Import log file** | Any JSON-lines file: Rancher's `rancher-api-audit.log` or Kubernetes API-server audit logs (`audit.k8s.io/v1`). For a single-node Docker install start Rancher with `-e AUDIT_LEVEL=1` and import `/var/log/auditlog/rancher-api-audit.log`. |
| **Demo data** | Sample events that match the demo RBAC objects. |

Unparsable lines are skipped.

## What is extracted

For every event: time, user (Rancher user ID and username), method and URI, response code, source address, cluster / namespace / resource / name, and, when the request body was logged (audit level 2 and above), the interesting fields such as `roleTemplateName`, `userPrincipalId` or `clusterId`.

Events are classified as:

- **change**: any non-GET request (logins excluded),
- **RBAC / token change**: a change touching global roles, role templates, role bindings, cluster roles, users, groups, tokens or auth configuration,
- **denied**: HTTP 401 or 403.

Reads are hidden by default; enable *Include reads* to see them.

## Linking to RBAC

Events are matched to subjects by Rancher user ID or username. That drives:

- the **Recent activity** card in the subject explorer,
- the findings *repeated denied requests*, *RBAC / token changes*, *administrators with no activity* and *disabled users still making requests*.

The audit tab and these findings are only available to administrators.

## Privacy

Audit logs contain who did what and from where. Rancher redacts credentials in them, but treat imported files like any sensitive log. Everything is parsed in the browser; nothing is uploaded.
