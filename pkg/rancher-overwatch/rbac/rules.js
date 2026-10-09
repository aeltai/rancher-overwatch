/**
 * Pure RBAC rule helpers – no Rancher / Vue dependencies.
 * Shared by the extension, the demo harness and the unit tests.
 */

export const VERBS_READ = ['get', 'list', 'watch'];
export const VERBS_WRITE = ['create', 'update', 'patch', 'delete', 'deletecollection'];
export const VERBS_ALL = [...VERBS_READ, ...VERBS_WRITE];
export const VERBS_DANGEROUS = ['escalate', 'bind', 'impersonate', 'approve', 'sign'];

/** Level of access a rule-set grants on a capability category. */
export const LEVELS = [
  { id: 0, key: 'none', label: 'No access', color: '#a0a7b4' },
  { id: 1, key: 'read', label: 'Read', color: '#5d995d' },
  { id: 2, key: 'write', label: 'Read / write', color: '#dd9b2e' },
  { id: 3, key: 'full', label: 'Full control', color: '#d9453f' }
];

export const CATEGORIES = [
  { id: 'workloads', label: 'Workloads', glyph: '', color: '#7d8796', hint: 'Pods, Deployments, Jobs, StatefulSets…' },
  { id: 'secrets', label: 'Secrets', glyph: '', color: '#7d8796', hint: 'Kubernetes Secrets' },
  { id: 'config', label: 'Config', glyph: '', color: '#7d8796', hint: 'ConfigMaps, quotas, autoscalers' },
  { id: 'networking', label: 'Networking', glyph: '', color: '#7d8796', hint: 'Services, Ingresses, NetworkPolicies' },
  { id: 'storage', label: 'Storage', glyph: '', color: '#7d8796', hint: 'PVCs, PVs, StorageClasses, Longhorn' },
  { id: 'cluster', label: 'Cluster', glyph: '', color: '#7d8796', hint: 'Nodes, Namespaces, CRDs, Events' },
  { id: 'rbac', label: 'Identity & RBAC', glyph: '', color: '#7d8796', hint: 'Roles, Bindings, ServiceAccounts' },
  { id: 'exec', label: 'Exec & Proxy', glyph: '', color: '#7d8796', hint: 'pods/exec, attach, port-forward, proxy' },
  { id: 'rancher', label: 'Rancher', glyph: '', color: '#7d8796', hint: 'management / provisioning / catalog APIs' },
  { id: 'gitops', label: 'GitOps', glyph: '', color: '#7d8796', hint: 'Fleet, Argo CD, Flux' },
  { id: 'other', label: 'Other CRDs', glyph: '', color: '#7d8796', hint: 'Everything else' }
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

const RANCHER_GROUPS = [
  'management.cattle.io', 'provisioning.cattle.io', 'catalog.cattle.io', 'ui.cattle.io', 'project.cattle.io',
  'cluster.cattle.io', 'ext.cattle.io', 'rke.cattle.io', 'rancher.cattle.io', 'upgrade.cattle.io',
  'auditlog.cattle.io', 'resources.cattle.io', 'turtles-capi.cattle.io', 'cluster.x-k8s.io'
];
const GITOPS_GROUPS = ['fleet.cattle.io', 'gitjob.cattle.io', 'argoproj.io', 'source.toolkit.fluxcd.io', 'kustomize.toolkit.fluxcd.io', 'helm.toolkit.fluxcd.io'];

/** resource name → category (works when the apiGroup is a wildcard) */
const BY_RESOURCE = {
  pods: 'workloads', 'pods/log': 'workloads', 'pods/status': 'workloads', replicationcontrollers: 'workloads',
  deployments: 'workloads', statefulsets: 'workloads', daemonsets: 'workloads', replicasets: 'workloads',
  jobs: 'workloads', cronjobs: 'workloads', 'deployments/scale': 'workloads', 'deployments/status': 'workloads',
  secrets: 'secrets',
  configmaps: 'config', resourcequotas: 'config', limitranges: 'config', podtemplates: 'config',
  horizontalpodautoscalers: 'config', poddisruptionbudgets: 'config',
  services: 'networking', endpoints: 'networking', ingresses: 'networking', networkpolicies: 'networking',
  ingressclasses: 'networking', endpointslices: 'networking',
  persistentvolumeclaims: 'storage', persistentvolumes: 'storage', storageclasses: 'storage',
  volumeattachments: 'storage', volumesnapshots: 'storage',
  nodes: 'cluster', namespaces: 'cluster', events: 'cluster', componentstatuses: 'cluster',
  customresourcedefinitions: 'cluster', apiservices: 'cluster', priorityclasses: 'cluster',
  serviceaccounts: 'rbac', roles: 'rbac', rolebindings: 'rbac', clusterroles: 'rbac', clusterrolebindings: 'rbac',
  'serviceaccounts/token': 'rbac', tokenreviews: 'rbac', subjectaccessreviews: 'rbac',
  'pods/exec': 'exec', 'pods/attach': 'exec', 'pods/portforward': 'exec', 'pods/proxy': 'exec',
  'nodes/proxy': 'exec', 'services/proxy': 'exec'
};

const GROUP_CATEGORY = [
  [['apps', 'batch'], 'workloads'],
  [['autoscaling', 'policy'], 'config'],
  [['networking.k8s.io', 'discovery.k8s.io', 'gateway.networking.k8s.io', 'traefik.io', 'traefik.containo.us', 'k8s.cni.cncf.io', 'cilium.io', 'projectcalico.org', 'crd.projectcalico.org'], 'networking'],
  [['storage.k8s.io', 'snapshot.storage.k8s.io', 'longhorn.io'], 'storage'],
  [['apiextensions.k8s.io', 'apiregistration.k8s.io', 'scheduling.k8s.io', 'node.k8s.io', 'certificates.k8s.io', 'coordination.k8s.io', 'metrics.k8s.io', 'admissionregistration.k8s.io', 'events.k8s.io', 'flowcontrol.apiserver.k8s.io'], 'cluster'],
  [['rbac.authorization.k8s.io', 'authentication.k8s.io', 'authorization.k8s.io'], 'rbac'],
  [RANCHER_GROUPS, 'rancher'],
  [GITOPS_GROUPS, 'gitops']
];

export function categorize(group, resource) {
  const res = String(resource || '').toLowerCase();
  const sub = res.includes('/') ? res.split('/')[1] : null;

  if (sub && ['exec', 'attach', 'portforward', 'proxy'].includes(sub)) {
    return 'exec';
  }
  if (BY_RESOURCE[res] && (group === '' || group === '*' || group === 'apps' || group === 'batch' || group === 'networking.k8s.io' || group === 'rbac.authorization.k8s.io' || group === 'storage.k8s.io')) {
    return BY_RESOURCE[res];
  }
  const g = String(group || '');

  for (const [groups, cat] of GROUP_CATEGORY) {
    if (groups.includes(g)) {
      return cat;
    }
  }
  if (g.endsWith('.cattle.io') || g.startsWith('rke-machine') || g.startsWith('rke-machine-config')) {
    return 'rancher';
  }
  if (g === '' && BY_RESOURCE[res.split('/')[0]]) {
    return BY_RESOURCE[res.split('/')[0]];
  }

  return BY_RESOURCE[res.split('/')[0]] && g === '*' ? BY_RESOURCE[res.split('/')[0]] : 'other';
}

/** all categories a "group + wildcard resource" rule touches */
function categoriesForGroupWildcard(group) {
  if (group === '*') {
    return CATEGORIES.map(c => c.id);
  }
  if (group === '') {
    return ['workloads', 'secrets', 'config', 'networking', 'storage', 'cluster', 'rbac', 'exec'];
  }
  const cats = new Set([categorize(group, '*')]);

  if (group === 'rbac.authorization.k8s.io') {
    cats.add('rbac');
  }

  return [...cats];
}

export function expandVerbs(verbs = []) {
  return (verbs || []).includes('*') ? new Set([...VERBS_ALL, ...VERBS_DANGEROUS, '*']) : new Set(verbs || []);
}

export function levelFromVerbs(set) {
  if (!set || !set.size) {
    return 0;
  }
  if (set.has('*') || VERBS_ALL.every(v => set.has(v))) {
    return 3;
  }
  if (VERBS_WRITE.some(v => set.has(v))) {
    return 2;
  }
  if (VERBS_READ.some(v => set.has(v))) {
    return 1;
  }

  return 0;
}

/**
 * Collapse a list of PolicyRules into per-category capability info.
 * returns { [categoryId]: { level, verbs:Set, resources:Set, named:boolean, special:Set } }
 */
export function categoryLevels(rules = []) {
  const out = {};

  for (const rule of rules) {
    const groups = rule.apiGroups?.length ? rule.apiGroups : [];
    const resources = rule.resources?.length ? rule.resources : [];

    if (!groups.length || !resources.length) {
      continue;
    }
    const verbs = expandVerbs(rule.verbs);
    const named = !!rule.resourceNames?.length;
    const touched = new Map(); // cat → Set(resource)

    const touch = (cat, res) => {
      if (!touched.has(cat)) {
        touched.set(cat, new Set());
      }
      touched.get(cat).add(res);
    };

    for (const g of groups) {
      for (const r of resources) {
        if (r === '*') {
          categoriesForGroupWildcard(g).forEach(c => touch(c, `${ g || 'core' }/*`));
        } else {
          touch(categorize(g, r), `${ g || 'core' }/${ r }`);
        }
      }
    }

    for (const [cat, res] of touched) {
      const cur = out[cat] || (out[cat] = { level: 0, verbs: new Set(), resources: new Set(), named: true, special: new Set() });

      verbs.forEach(v => cur.verbs.add(v));
      res.forEach(x => cur.resources.add(x));
      cur.named = cur.named && named;
      VERBS_DANGEROUS.forEach(v => verbs.has(v) && cur.special.add(v));
    }
  }
  for (const cur of Object.values(out)) {
    cur.level = levelFromVerbs(cur.verbs);
  }

  return out;
}

export function isFullAdmin(rules = []) {
  return rules.some(r => (r.apiGroups || []).includes('*') && (r.resources || []).includes('*') && (r.verbs || []).includes('*') && !r.resourceNames?.length);
}

function nonResourceAdmin(rules = []) {
  return rules.some(r => (r.nonResourceURLs || []).includes('*') && (r.verbs || []).includes('*'));
}

export function hasWildcard(rules = []) {
  return rules.some(r => (r.verbs || []).includes('*') || (r.resources || []).includes('*') || (r.apiGroups || []).includes('*'));
}

/** does any rule allow  verb on group/resource (resource may be "pods/exec") */
export function ruleAllows(rules, group, resource, verb) {
  for (const r of rules || []) {
    if (!(r.verbs || []).includes('*') && !(r.verbs || []).includes(verb)) {
      continue;
    }
    if (!(r.apiGroups || []).includes('*') && !(r.apiGroups || []).includes(group)) {
      continue;
    }
    const rs = r.resources || [];

    if (rs.includes('*') || rs.includes(resource) || rs.includes(`*/${ resource.split('/')[1] }`) && resource.includes('/')) {
      return { allowed: true, named: !!r.resourceNames?.length };
    }
  }

  return { allowed: false, named: false };
}

/** Well known resources shown in the explorer grid */
export const KNOWN_RESOURCES = [
  { group: '', resource: 'pods', label: 'Pods' },
  { group: '', resource: 'pods/log', label: 'Pod logs' },
  { group: '', resource: 'pods/exec', label: 'Pod exec' },
  { group: 'apps', resource: 'deployments', label: 'Deployments' },
  { group: 'apps', resource: 'statefulsets', label: 'StatefulSets' },
  { group: 'apps', resource: 'daemonsets', label: 'DaemonSets' },
  { group: 'batch', resource: 'jobs', label: 'Jobs' },
  { group: 'batch', resource: 'cronjobs', label: 'CronJobs' },
  { group: '', resource: 'secrets', label: 'Secrets' },
  { group: '', resource: 'configmaps', label: 'ConfigMaps' },
  { group: '', resource: 'services', label: 'Services' },
  { group: 'networking.k8s.io', resource: 'ingresses', label: 'Ingresses' },
  { group: 'networking.k8s.io', resource: 'networkpolicies', label: 'NetworkPolicies' },
  { group: '', resource: 'persistentvolumeclaims', label: 'PVCs' },
  { group: '', resource: 'persistentvolumes', label: 'PersistentVolumes' },
  { group: 'storage.k8s.io', resource: 'storageclasses', label: 'StorageClasses' },
  { group: '', resource: 'namespaces', label: 'Namespaces' },
  { group: '', resource: 'nodes', label: 'Nodes' },
  { group: '', resource: 'events', label: 'Events' },
  { group: 'apiextensions.k8s.io', resource: 'customresourcedefinitions', label: 'CRDs' },
  { group: '', resource: 'serviceaccounts', label: 'ServiceAccounts' },
  { group: 'rbac.authorization.k8s.io', resource: 'roles', label: 'Roles' },
  { group: 'rbac.authorization.k8s.io', resource: 'rolebindings', label: 'RoleBindings' },
  { group: 'rbac.authorization.k8s.io', resource: 'clusterroles', label: 'ClusterRoles' },
  { group: 'rbac.authorization.k8s.io', resource: 'clusterrolebindings', label: 'ClusterRoleBindings' },
  { group: 'management.cattle.io', resource: 'clusters', label: 'Rancher clusters' },
  { group: 'management.cattle.io', resource: 'projects', label: 'Rancher projects' },
  { group: 'management.cattle.io', resource: 'users', label: 'Rancher users' },
  { group: 'management.cattle.io', resource: 'globalroles', label: 'Global roles' },
  { group: 'management.cattle.io', resource: 'settings', label: 'Rancher settings' },
  { group: 'provisioning.cattle.io', resource: 'clusters', label: 'Provisioning clusters' },
  { group: 'catalog.cattle.io', resource: 'clusterrepos', label: 'Chart repos' },
  { group: 'fleet.cattle.io', resource: 'gitrepos', label: 'Fleet GitRepos' }
];

export const GRID_VERBS = ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'];

export function describeRule(r) {
  const g = (r.apiGroups || []).map(x => x === '' ? 'core' : x).join(', ') || '—';
  const res = (r.resources || r.nonResourceURLs || []).join(', ') || '—';
  const v = (r.verbs || []).join(', ') || '—';

  return { groups: g, resources: res, verbs: v, names: (r.resourceNames || []).join(', ') };
}

export { nonResourceAdmin };
