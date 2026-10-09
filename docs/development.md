# Development

## Dev loop

```bash
yarn install
API=https://<your-rancher> yarn dev
```

The dashboard is served on https://localhost:8005 and proxies API calls to `API`. Changes to `pkg/rancher-overwatch` hot-reload. Self-signed Rancher certificates are accepted by the dev proxy.

## Tests

```bash
yarn test
```

Runs `pkg/rancher-overwatch/rbac/__tests__/engine.test.mjs` under plain Node. It covers rule categorisation, role and aggregation resolution, effective permissions, access tiers, the graph layout, audit parsing and the findings, all against the demo data in `rbac/demo-data.js`.

## Build

```bash
yarn build-pkg      # → dist-pkg/rancher-overwatch-0.1.0/rancher-overwatch-0.1.0.umd.min.js
```

## Gotchas

- **Do not run `yarn dev` and `yarn build-pkg` at the same time.** The build manages a temporary `pkg/rancher-overwatch/.shell` link; the dev server crashes with `ENOENT … .shell` if it disappears mid-run.
- **Do not import from `@shell/store/*` or other shell internals** in the extension. It pulls large parts of the dashboard into the bundle and breaks the build. The administrator check is therefore replicated in `rbac/access.js`.
- **The menu label comes from `l10n/en-us.yaml`** (`product.rancher-overwatch`), not from the `label` in `product.js`.
- **Shell version.** The extension uses `@rancher/shell` 3.0.4, which Rancher's support matrix lists for Rancher 2.10 and later. Newer shell releases exist; bump deliberately and re-test.
