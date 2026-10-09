/**
 * Who may see what.
 *
 * The real boundary is Rancher's own API: every list is fetched with the signed-in
 * user's session, so the server only returns what that user is entitled to. This module
 * decides what the UI offers on top of that (so nobody stares at a wall of 403s) and
 * powers the demo "view as" switch.
 */
export const TYPES = {
  users:              'management.cattle.io.user',
  globalRoles:        'management.cattle.io.globalrole',
  globalRoleBindings: 'management.cattle.io.globalrolebinding',
  roleTemplates:      'management.cattle.io.roletemplate',
  crtbs:              'management.cattle.io.clusterroletemplatebinding',
  prtbs:              'management.cattle.io.projectroletemplatebinding',
  clusters:           'management.cattle.io.cluster',
  projects:           'management.cattle.io.project',
  tokens:             'management.cattle.io.token'
};

const HIDDEN_LABELS = {
  users: 'user directory', tokens: 'API tokens', globalRoles: 'global roles', globalRoleBindings: 'global role bindings'
};

/**
 * @param {boolean} isAdmin  Rancher's own administrator check
 * @param {(key:string)=>boolean} can  can the user list this resource?
 */
export function describeAccess(isAdmin, can) {
  const binds = can('crtbs') || can('prtbs') || can('globalRoleBindings');

  if (isAdmin) {
    return {
      level: 'admin', allowed: true, canAudit: true, label: 'Administrator',
      detail: 'Full view: Rancher RBAC for every cluster, the user directory, API tokens and the audit log.', hidden: []
    };
  }
  if (!binds) {
    return {
      level: 'none', allowed: false, canAudit: false, label: 'No access',
      detail: 'Your account is not allowed to read any role bindings, so there is nothing to show. Ask an administrator for the cluster-owner or project-owner role.', hidden: []
    };
  }
  const hidden = Object.keys(HIDDEN_LABELS).filter(k => !can(k)).map(k => HIDDEN_LABELS[k]);

  return {
    level: 'delegated', allowed: true, canAudit: false, label: can('crtbs') ? 'Cluster-level access' : 'Project-level access',
    detail: `You only see the role bindings of the clusters and projects you manage${ hidden.length ? `. Not available to your account: ${ hidden.join(', ') }, and the Rancher audit log.` : '.' }`, hidden
  };
}

export const VIEW_AS = [
  { id: 'admin', label: 'Administrator' },
  { id: 'cluster-owner', label: 'Cluster owner (prod-eu)' },
  { id: 'project-owner', label: 'Project owner (Payments)' }
];

/**
 * Demo only: what Rancher's API would return to a non-admin. Cluster owners can read the
 * bindings of their cluster (+ role templates), but not the user directory, tokens or global roles.
 */
export function restrictRaw(raw, who) {
  if (!who || who === 'admin') {
    return raw;
  }
  const R = raw.rancher;
  const cluster = 'c-m-prod1', project = 'c-m-prod1:p-pay';
  const ns = o => o.metadata?.namespace;
  const rancher = {
    users: [], globalRoles: [], globalRoleBindings: [], tokens: [],
    roleTemplates: R.roleTemplates,
    clusters:      R.clusters.filter(c => c.metadata.name === cluster),
    projects:      R.projects.filter(p => who === 'cluster-owner' ? ns(p) === cluster : p.metadata.name === 'p-pay'),
    crtbs:         who === 'cluster-owner' ? R.crtbs.filter(b => ns(b) === cluster) : [],
    prtbs:         R.prtbs.filter(b => who === 'cluster-owner' ? ns(b) === cluster : b.projectName === project)
  };
  const restricted = ['users', 'tokens', 'globalRoles', 'globalRoleBindings', ...(who === 'cluster-owner' ? [] : ['crtbs'])];

  return { rancher, k8s: who === 'cluster-owner' ? { [cluster]: raw.k8s[cluster] } : {}, errors: {}, restricted };
}

export function can(restricted = []) {
  return key => !restricted.includes(key);
}

/**
 * Same test Rancher's own dashboard uses for "is administrator": the account may edit settings and
 * feature flags and manage apps/repos/operations. (Replicated here so the bundle does not pull in shell internals.)
 */
export function isAdminFromGetters(getters) {
  const put = type => (getters['management/schemaFor'](type)?.resourceMethods || []).includes('PUT');

  return ['management.cattle.io.setting', 'management.cattle.io.feature', 'catalog.cattle.io.app', 'catalog.cattle.io.clusterrepo', 'catalog.cattle.io.operation'].every(put);
}
