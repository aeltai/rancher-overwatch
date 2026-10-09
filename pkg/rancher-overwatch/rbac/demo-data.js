/**
 * Realistic sample data (same shape as the Rancher / Kubernetes APIs).
 * Used by the demo harness, the unit tests, and the “Demo data” switch in the UI.
 */
const R = (apiGroups, resources, verbs, extra = {}) => ({ apiGroups, resources, verbs, ...extra });
const READ = ['get', 'list', 'watch'];
const WRITE = ['create', 'update', 'patch', 'delete', 'deletecollection'];
const ALL = ['*'];
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const obj = (name, extra = {}, ns) => ({ metadata: { name, namespace: ns, creationTimestamp: ago(90), ...(extra.metadata || {}) }, ...extra, id: ns ? `${ ns }/${ name }` : name });

const users = [
  obj('u-admin', { username: 'admin', displayName: 'Default Admin', principalIds: ['local://u-admin'], enabled: true }),
  obj('u-alice', { username: 'alice', displayName: 'Alice Schmidt', principalIds: ['local://u-alice', 'okta_user://alice'], enabled: true }),
  obj('u-bob', { username: 'bob.meier', displayName: 'Bob Meier', principalIds: ['local://u-bob'], enabled: true }),
  obj('u-carol', { username: 'carol', displayName: 'Carol Weiß', principalIds: ['local://u-carol'], enabled: true }),
  obj('u-dave', { username: 'dave.contractor', displayName: 'Dave (contractor)', principalIds: ['local://u-dave'], enabled: false }),
  obj('u-eve', { username: 'eve', displayName: 'Eve Nowak', principalIds: ['local://u-eve'], enabled: true }),
  obj('u-cibot', { username: 'ci-bot', displayName: 'CI Bot', principalIds: ['local://u-cibot'], enabled: true })
];

const clusters = [
  obj('local', { spec: { displayName: 'local' } }),
  obj('c-m-prod1', { spec: { displayName: 'prod-eu' } }),
  obj('c-m-stg1', { spec: { displayName: 'staging' } })
];

const projects = [
  obj('p-sys', { spec: { displayName: 'System', clusterName: 'local' } }, 'local'),
  obj('p-pay', { spec: { displayName: 'Payments', clusterName: 'c-m-prod1' } }, 'c-m-prod1'),
  obj('p-web', { spec: { displayName: 'Storefront', clusterName: 'c-m-prod1' } }, 'c-m-prod1'),
  obj('p-qa', { spec: { displayName: 'QA', clusterName: 'c-m-stg1' } }, 'c-m-stg1')
];

const globalRoles = [
  obj('admin', { displayName: 'Administrator', builtin: true, rules: [R(['*'], ['*'], ALL), R([], [], ALL, { nonResourceURLs: ['*'] })] }),
  obj('user', { displayName: 'User', builtin: true, newUserDefault: true, rules: [R(['management.cattle.io'], ['preferences', 'settings'], READ), R(['management.cattle.io'], ['clusters', 'projects'], ['get', 'list'])] }),
  obj('user-base', { displayName: 'User-Base', builtin: true, rules: [R(['management.cattle.io'], ['preferences'], ['get', 'list', 'update'])] }),
  obj('clusters-create', { displayName: 'Create new Clusters', builtin: true, rules: [R(['management.cattle.io'], ['clusters'], ['create']), R(['provisioning.cattle.io'], ['clusters'], ['create'])] }),
  obj('auditor-global', { displayName: 'Security Auditor', rules: [R(['management.cattle.io'], ['clusters', 'projects', 'users', 'globalroles', 'roletemplates', 'tokens'], READ), R(['provisioning.cattle.io'], ['clusters'], READ)] }),
  obj('platform-ops', { displayName: 'Platform Operations', inheritedClusterRoles: ['cluster-member'], rules: [R(['catalog.cattle.io'], ['clusterrepos', 'apps', 'operations'], ['get', 'list', 'watch', 'create', 'update']), R(['fleet.cattle.io'], ['gitrepos', 'bundles'], [...READ, ...WRITE]), R(['management.cattle.io'], ['clusters'], READ)] })
];

const globalRoleBindings = [
  { n: 'grb-admin', u: 'u-admin', r: 'admin' }, { n: 'grb-alice-1', u: 'u-alice', r: 'user' }, { n: 'grb-alice-2', u: 'u-alice', r: 'platform-ops' },
  { n: 'grb-bob', u: 'u-bob', r: 'user' }, { n: 'grb-carol-1', u: 'u-carol', r: 'user-base' }, { n: 'grb-carol-2', u: 'u-carol', r: 'auditor-global' },
  { n: 'grb-dave', u: 'u-dave', r: 'user' }, { n: 'grb-eve-1', u: 'u-eve', r: 'user' }, { n: 'grb-eve-2', u: 'u-eve', r: 'clusters-create' },
  { n: 'grb-cibot', u: 'u-cibot', r: 'user' }, { n: 'grb-g-dev', g: 'okta_group://developers', r: 'user' }, { n: 'grb-g-plat', g: 'github_team://platform-eng', r: 'platform-ops' },
  { n: 'grb-g-sec', g: 'okta_group://security-audit', r: 'auditor-global' }
].map(b => obj(b.n, { globalRoleName: b.r, userName: b.u, groupPrincipalName: b.g }));

const clusterTemplates = [
  obj('cluster-owner', { displayName: 'Cluster Owner', context: 'cluster', builtin: true, rules: [R(['*'], ['*'], ALL), R([], [], ALL, { nonResourceURLs: ['*'] })] }),
  obj('cluster-member', { displayName: 'Cluster Member', context: 'cluster', builtin: true, rules: [R(['management.cattle.io'], ['clusterroletemplatebindings', 'projects'], READ), R([''], ['namespaces', 'nodes'], READ), R(['management.cattle.io'], ['projects'], ['create'])] }),
  obj('nodes-view', { displayName: 'View Nodes', context: 'cluster', builtin: true, rules: [R([''], ['nodes'], READ), R(['management.cattle.io'], ['nodes'], READ)] }),
  obj('cluster-auditor', { displayName: 'Cluster Auditor', context: 'cluster', rules: [R(['*'], ['*'], READ), R([''], ['secrets'], ['get'], { resourceNames: ['auditor-readme'] })] }),
  obj('project-owner', { displayName: 'Project Owner', context: 'project', builtin: true, rules: [R([''], ['pods', 'pods/log', 'services', 'configmaps', 'persistentvolumeclaims', 'events', 'serviceaccounts'], [...READ, ...WRITE]), R([''], ['secrets'], [...READ, ...WRITE]), R(['apps'], ['*'], ALL), R(['batch'], ['*'], ALL), R(['networking.k8s.io'], ['ingresses', 'networkpolicies'], ALL), R([''], ['pods/exec', 'pods/portforward'], ['create']), R(['rbac.authorization.k8s.io'], ['roles', 'rolebindings'], ALL)] }),
  obj('project-member', { displayName: 'Project Member', context: 'project', builtin: true, rules: [R([''], ['pods', 'pods/log', 'services', 'configmaps', 'persistentvolumeclaims', 'events'], [...READ, ...WRITE]), R([''], ['secrets'], READ), R(['apps', 'batch'], ['*'], ALL), R(['networking.k8s.io'], ['ingresses'], ALL), R([''], ['pods/exec'], ['create'])] }),
  obj('read-only', { displayName: 'Read Only', context: 'project', builtin: true, rules: [R([''], ['pods', 'pods/log', 'services', 'configmaps', 'persistentvolumeclaims', 'events'], READ), R(['apps', 'batch'], ['*'], READ), R(['networking.k8s.io'], ['ingresses'], READ)] }),
  obj('secrets-view', { displayName: 'View Secrets', context: 'project', builtin: true, rules: [R([''], ['secrets'], READ)] }),
  obj('deployer', { displayName: 'Deployer', context: 'project', rules: [R(['apps'], ['deployments', 'statefulsets'], ['get', 'list', 'patch', 'update']), R([''], ['pods', 'pods/log'], READ)] }),
  obj('project-lead', { displayName: 'Project Lead', context: 'project', roleTemplateNames: ['project-member', 'secrets-view'], rules: [R(['management.cattle.io'], ['projectroletemplatebindings'], [...READ, 'create', 'delete'])] })
];

const crtbs = [
  { n: 'crtb-alice', c: 'c-m-prod1', u: 'u-alice', r: 'cluster-owner' }, { n: 'crtb-eve-1', c: 'c-m-prod1', u: 'u-eve', r: 'cluster-owner' },
  { n: 'crtb-eve-2', c: 'c-m-stg1', u: 'u-eve', r: 'cluster-owner' }, { n: 'crtb-carol', c: 'c-m-prod1', u: 'u-carol', r: 'cluster-auditor' },
  { n: 'crtb-plat', c: 'c-m-stg1', g: 'github_team://platform-eng', r: 'cluster-member' }, { n: 'crtb-sec', c: 'c-m-prod1', g: 'okta_group://security-audit', r: 'cluster-auditor' },
  { n: 'crtb-bob-nodes', c: 'c-m-prod1', u: 'u-bob', r: 'nodes-view' }
].map(b => obj(b.n, { clusterName: b.c, userName: b.u, groupPrincipalName: b.g, roleTemplateName: b.r }, b.c));

const prtbs = [
  { n: 'prtb-bob-1', p: 'c-m-prod1:p-pay', u: 'u-bob', r: 'project-owner' }, { n: 'prtb-bob-2', p: 'c-m-prod1:p-web', u: 'u-bob', r: 'read-only' },
  { n: 'prtb-dave', p: 'c-m-stg1:p-qa', u: 'u-dave', r: 'project-member' }, { n: 'prtb-dev', p: 'c-m-stg1:p-qa', g: 'okta_group://developers', r: 'project-member' },
  { n: 'prtb-dev-web', p: 'c-m-prod1:p-web', g: 'okta_group://developers', r: 'project-lead' },
  { n: 'prtb-cibot', p: 'c-m-prod1:p-pay', u: 'u-cibot', r: 'deployer' }
].map(b => obj(b.n, { projectName: b.p, userName: b.u, groupPrincipalName: b.g, roleTemplateName: b.r }, b.p.split(':')[0]));

const tok = (n, user, desc, ttlDays, extra = {}) => obj(n, { userId: user, description: desc, ttl: ttlDays * 864e5, isDerived: false, authProvider: 'local', lastUsedAt: ago(extra.used ?? 3), clusterId: extra.cluster || '', expired: extra.expired || false, metadata: { creationTimestamp: ago(extra.age ?? 40) } });
const tokens = [
  tok('token-a1', 'u-admin', 'admin-api-key', 0, { age: 400 }), tok('token-a2', 'u-alice', 'kubectl laptop', 30, { age: 12 }), tok('token-a3', 'u-alice', 'terraform-prod', 0, { age: 200, used: 1 }),
  tok('token-e1', 'u-eve', 'pagerduty-runbook', 0, { age: 150, cluster: 'c-m-prod1' }), tok('token-c1', 'u-carol', 'audit-export', 7, { age: 3 }),
  tok('token-b1', 'u-bob', 'old-laptop', 30, { age: 120, expired: true }), tok('token-ci', 'u-cibot', 'ci-pipeline', 0, { age: 60, cluster: 'c-m-prod1' })
];

/* ---------------- Kubernetes ---------------- */
const lbl = l => ({ metadata: { labels: l } });
const managed = { 'authz.cluster.cattle.io/crtb-owner': 'x' };
const cr = (n, rules, extra = {}) => obj(n, { rules, ...extra });
const crb = (n, role, subjects, extra = {}) => obj(n, { roleRef: { kind: 'ClusterRole', name: role, apiGroup: 'rbac.authorization.k8s.io' }, subjects, ...extra });
const rb = (n, ns, kind, role, subjects, extra = {}) => obj(n, { roleRef: { kind, name: role, apiGroup: 'rbac.authorization.k8s.io' }, subjects }, ns);
const U = n => ({ kind: 'User', name: n, apiGroup: 'rbac.authorization.k8s.io' });
const G = n => ({ kind: 'Group', name: n, apiGroup: 'rbac.authorization.k8s.io' });
const SA = (ns, n) => ({ kind: 'ServiceAccount', name: n, namespace: ns });

const builtinRoles = () => [
  cr('cluster-admin', [R(['*'], ['*'], ALL), R([], [], ALL, { nonResourceURLs: ['*'] })], lbl({ 'kubernetes.io/bootstrapping': 'rbac-defaults' })),
  cr('view', [], { aggregationRule: { clusterRoleSelectors: [{ matchLabels: { 'rbac.authorization.k8s.io/aggregate-to-view': 'true' } }] }, ...lbl({ 'kubernetes.io/bootstrapping': 'rbac-defaults' }) }),
  cr('edit', [], { aggregationRule: { clusterRoleSelectors: [{ matchLabels: { 'rbac.authorization.k8s.io/aggregate-to-edit': 'true' } }] }, ...lbl({ 'kubernetes.io/bootstrapping': 'rbac-defaults' }) }),
  cr('admin', [], { aggregationRule: { clusterRoleSelectors: [{ matchLabels: { 'rbac.authorization.k8s.io/aggregate-to-admin': 'true' } }] }, ...lbl({ 'kubernetes.io/bootstrapping': 'rbac-defaults' }) }),
  cr('system:aggregate-to-view', [R([''], ['pods', 'pods/log', 'services', 'endpoints', 'configmaps', 'persistentvolumeclaims', 'events', 'namespaces'], READ), R(['apps', 'batch'], ['*'], READ), R(['networking.k8s.io'], ['ingresses', 'networkpolicies'], READ)], lbl({ 'rbac.authorization.k8s.io/aggregate-to-view': 'true', 'rbac.authorization.k8s.io/aggregate-to-edit': 'true', 'rbac.authorization.k8s.io/aggregate-to-admin': 'true' })),
  cr('system:aggregate-to-edit', [R([''], ['pods', 'services', 'configmaps', 'persistentvolumeclaims'], [...READ, ...WRITE]), R([''], ['secrets', 'serviceaccounts'], [...READ, ...WRITE]), R([''], ['pods/exec', 'pods/portforward'], ['create']), R(['apps', 'batch'], ['*'], [...READ, ...WRITE]), R(['networking.k8s.io'], ['ingresses'], [...READ, ...WRITE])], lbl({ 'rbac.authorization.k8s.io/aggregate-to-edit': 'true', 'rbac.authorization.k8s.io/aggregate-to-admin': 'true' })),
  cr('system:aggregate-to-admin', [R(['rbac.authorization.k8s.io'], ['roles', 'rolebindings'], ALL)], lbl({ 'rbac.authorization.k8s.io/aggregate-to-admin': 'true' })),
  cr('system:node', [R([''], ['nodes'], READ)]), cr('system:discovery', [R([], [], ['get'], { nonResourceURLs: ['/api'] })])
];

const prod = {
  clusterRoles: [
    ...builtinRoles(),
    cr('cluster-owner', [R(['*'], ['*'], ALL)], lbl(managed)), cr('cluster-auditor', [R(['*'], ['*'], READ)], lbl(managed)),
    cr('secret-reader', [R([''], ['secrets'], ['get', 'list'])]), cr('pod-exec', [R([''], ['pods/exec', 'pods/portforward'], ['create']), R([''], ['pods'], READ)]),
    cr('argocd-application-controller', [R(['*'], ['*'], ALL)]), cr('ci-deployer-role', [R(['apps'], ['deployments'], ['get', 'list', 'patch', 'update']), R([''], ['pods'], READ)]),
    cr('external-secrets-controller', [R([''], ['secrets'], [...READ, ...WRITE]), R(['external-secrets.io'], ['*'], ALL)]), cr('ns-viewer-legacy', [R([''], ['namespaces'], READ)]),
    cr('rbac-delegator', [R(['rbac.authorization.k8s.io'], ['clusterroles', 'clusterrolebindings'], ['get', 'list', 'create', 'bind', 'escalate'])])
  ],
  clusterRoleBindings: [
    crb('cluster-admin', 'cluster-admin', [G('system:masters')], lbl({ 'kubernetes.io/bootstrapping': 'rbac-defaults' })),
    crb('globaladmin-u-admin', 'cluster-admin', [U('u-admin')]), crb('crb-a1b2c3d4e5f6', 'cluster-owner', [U('u-alice')], lbl(managed)), crb('crb-f6e5d4c3b2a1', 'cluster-owner', [U('u-eve')], lbl(managed)),
    crb('crb-0a0b0c0d0e0f', 'cluster-auditor', [U('u-carol')], lbl(managed)), crb('crb-1a1b1c1d1e1f', 'cluster-auditor', [G('okta_group://security-audit')], lbl(managed)),
    crb('argocd-controller', 'argocd-application-controller', [SA('argocd', 'argocd-application-controller')]), crb('devs-secret-reader', 'secret-reader', [G('okta_group://developers')]),
    crb('eve-debug', 'pod-exec', [U('u-eve')]), crb('external-secrets', 'external-secrets-controller', [SA('external-secrets', 'external-secrets')]),
    crb('platform-delegation', 'rbac-delegator', [U('u-alice')]), crb('system:node', 'system:node', [G('system:nodes')]), crb('system:discovery', 'system:discovery', [G('system:authenticated')])
  ],
  roles: [obj('payments-runbook', { rules: [R([''], ['configmaps'], ['get', 'update'], { resourceNames: ['runbook'] })] }, 'payments')],
  roleBindings: [
    rb('rb-aaaaaaaaaaaa', 'payments', 'ClusterRole', 'admin', [U('u-bob')], lbl({ 'authz.cluster.cattle.io/prtb-owner': 'x' })), rb('rb-bbbbbbbbbbbb', 'storefront', 'ClusterRole', 'view', [U('u-bob')], lbl({ 'authz.cluster.cattle.io/prtb-owner': 'x' })),
    rb('rb-cccccccccccc', 'storefront', 'ClusterRole', 'edit', [G('okta_group://developers')], lbl({ 'authz.cluster.cattle.io/prtb-owner': 'x' })), rb('rb-dddddddddddd', 'payments', 'ClusterRole', 'edit', [U('u-cibot')], lbl({ 'authz.cluster.cattle.io/prtb-owner': 'x' })),
    rb('ci-deploy', 'payments', 'ClusterRole', 'ci-deployer-role', [SA('payments', 'ci-deployer')]), rb('runbook-editors', 'payments', 'Role', 'payments-runbook', [U('u-bob'), G('okta_group://developers')])
  ],
  namespaces: [obj('payments', { metadata: { labels: { 'field.cattle.io/projectId': 'p-pay' } } }), obj('payments-batch', { metadata: { labels: { 'field.cattle.io/projectId': 'p-pay' } } }), obj('storefront', { metadata: { labels: { 'field.cattle.io/projectId': 'p-web' } } }), obj('kube-system'), obj('argocd')]
};

const staging = {
  clusterRoles: [...builtinRoles(), cr('cluster-owner', [R(['*'], ['*'], ALL)], lbl(managed)), cr('cluster-member', [R([''], ['namespaces', 'nodes'], READ)], lbl(managed))],
  clusterRoleBindings: [
    crb('globaladmin-u-admin', 'cluster-admin', [U('u-admin')]), crb('crb-s1s2s3s4s5s6', 'cluster-owner', [U('u-eve')], lbl(managed)), crb('crb-s7s8s9s0a1a2', 'cluster-member', [G('github_team://platform-eng')], lbl(managed)),
    crb('security-view', 'view', [G('okta_group://security-audit')])
  ],
  roles: [],
  roleBindings: [rb('rb-qaqaqaqaqaqa', 'qa', 'ClusterRole', 'edit', [G('okta_group://developers'), U('u-dave')], lbl({ 'authz.cluster.cattle.io/prtb-owner': 'x' }))],
  namespaces: [obj('qa', { metadata: { labels: { 'field.cattle.io/projectId': 'p-qa' } } }), obj('kube-system')]
};

const local = {
  clusterRoles: [...builtinRoles(), cr('cattle-admin', [R(['*'], ['*'], ALL)], lbl(managed))],
  clusterRoleBindings: [crb('globaladmin-u-admin', 'cluster-admin', [U('u-admin')]), crb('rancher-fleet-ops', 'cattle-admin', [SA('cattle-fleet-system', 'fleet-controller')])],
  roles: [], roleBindings: [], namespaces: [obj('cattle-system'), obj('cattle-fleet-system')]
};

export function demoRaw() {
  return {
    rancher: { users, clusters, projects, globalRoles, globalRoleBindings, roleTemplates: clusterTemplates, crtbs, prtbs, tokens },
    k8s:     { local, 'c-m-prod1': prod, 'c-m-stg1': staging },
    errors:  {}
  };
}

/** Sample Rancher API audit events (same shape as the rancher-audit-log sidecar writes). */
export function demoAudit() {
  const now = Date.now();
  const H = 3600e3;
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const names = { 'u-admin': 'admin', 'u-alice': 'alice', 'u-bob': 'bob.meier', 'u-carol': 'carol', 'u-dave': 'dave.contractor', 'u-eve': 'eve', 'u-cibot': 'ci-bot' };
  const ev = [];
  const add = (hoursAgo, uid, method, uri, code, ip, body) => ev.push({
    auditID:          `demo-${ ev.length }`,
    requestURI:       uri,
    user:             uid ? { name: uid, group: ['system:authenticated'], extra: { username: [names[uid]], principalid: [`local://${ uid }`] } } : { name: 'system:unauthenticated', group: ['system:unauthenticated'] },
    method,
    remoteAddr:       ip,
    responseCode:     code,
    requestTimestamp: new Date(now - hoursAgo * H).toISOString(),
    ...(body ? { requestBody: JSON.stringify(body) } : {})
  });
  const ips = { 'u-admin': '10.0.4.12', 'u-alice': '10.0.4.31', 'u-bob': '10.0.7.8', 'u-carol': '10.0.9.4', 'u-dave': '203.0.113.50', 'u-eve': '10.0.4.77', 'u-cibot': '10.0.20.3' };
  const reads = ['/v1/management.cattle.io.clusters', '/v1/management.cattle.io.projects', '/k8s/clusters/c-m-prod1/v1/apps.deployments', '/k8s/clusters/c-m-prod1/v1/pods', '/v3/settings/server-version', '/k8s/clusters/c-m-stg1/v1/namespaces', '/v1/catalog.cattle.io.clusterrepos'];
  const actors = ['u-admin', 'u-alice', 'u-bob', 'u-carol', 'u-eve', 'u-cibot'];

  for (let i = 0; i < 90; i++) {
    const u = actors[Math.floor(rnd() * actors.length)];

    add(rnd() * 72, u, 'GET', reads[Math.floor(rnd() * reads.length)], 200, ips[u]);
  }
  add(71, 'u-admin', 'POST', '/v3/users', 201, ips['u-admin'], { username: 'eve', description: 'SRE on-call' });
  add(70, 'u-admin', 'POST', '/v3/globalrolebindings', 201, ips['u-admin'], { globalRoleName: 'user', userId: 'u-eve' });
  add(52, 'u-alice', 'POST', '/v3/clusterroletemplatebindings', 201, ips['u-alice'], { clusterId: 'c-m-prod1', roleTemplateName: 'cluster-owner', userPrincipalId: 'local://u-eve' });
  add(46, 'u-eve', 'POST', '/v3/tokens', 201, ips['u-eve'], { description: 'pagerduty-runbook', ttl: 0, clusterId: 'c-m-prod1' });
  for (let i = 0; i < 3; i++) {
    add(27 - i * 0.2, 'u-bob', 'DELETE', '/k8s/clusters/c-m-prod1/v1/namespaces/payments', 403, ips['u-bob']);
  }
  for (let i = 0; i < 4; i++) {
    add(21 - i * 0.1, null, 'POST', '/v3-public/localProviders/local?action=login', 401, ips['u-dave'], { username: 'dave.contractor' });
  }
  for (let i = 0; i < 6; i++) {
    add(18 - i * 2, 'u-cibot', 'PATCH', '/k8s/clusters/c-m-prod1/v1/apps.deployments/payments/checkout', 200, ips['u-cibot']);
  }
  add(14, 'u-alice', 'POST', '/v3/projectroletemplatebindings', 201, ips['u-alice'], { projectId: 'c-m-prod1:p-web', roleTemplateName: 'project-lead', groupPrincipalId: 'okta_group://developers' });
  add(9, 'u-carol', 'GET', '/v3/tokens', 200, ips['u-carol']);
  add(8, 'u-carol', 'GET', '/k8s/clusters/c-m-prod1/v1/secrets/payments/db-credentials', 200, ips['u-carol']);
  add(6, 'u-admin', 'PUT', '/v3/globalroles/platform-ops', 200, ips['u-admin'], { description: 'Platform Operations' });
  add(4.5, 'u-bob', 'GET', '/k8s/clusters/c-m-prod1/v1/secrets/payments/db-credentials', 200, ips['u-bob']);
  add(3, 'u-eve', 'GET', '/k8s/clusters/c-m-prod1/api/v1/namespaces/payments/pods/checkout-7d9c/exec', 200, ips['u-eve']);
  add(2.2, 'u-bob', 'POST', '/v3/clusterroletemplatebindings', 403, ips['u-bob'], { clusterId: 'c-m-prod1', roleTemplateName: 'cluster-owner', userPrincipalId: 'local://u-bob' });
  add(1.4, 'u-alice', 'DELETE', '/v3/clusterroletemplatebindings/c-m-stg1:crtb-old', 200, ips['u-alice']);
  add(0.6, 'u-alice', 'POST', '/v3/tokens', 201, ips['u-alice'], { description: 'terraform-prod', ttl: 0 });

  return ev;
}
