/**
 * Turns raw Rancher + Kubernetes RBAC objects into one uniform model:
 *   subjects  – users, groups, service accounts, tokens
 *   roles     – GlobalRoles, RoleTemplates, ClusterRoles, Roles (with resolved rules)
 *   grants    – one entry per (subject, role, scope) binding
 */
import { categoryLevels, isFullAdmin, hasWildcard } from './rules.js';

const meta = o => o?.metadata || {};
const val = (o, k, d) => {
  if (!o) {
    return d;
  }
  if (o[k] !== undefined && o[k] !== null) {
    return o[k];
  }
  const s = o.spec?.[k];

  return s !== undefined && s !== null ? s : d;
};
const nameOf = o => meta(o).name || o?.name || (o?.id ? String(o.id).split('/').pop() : undefined);
const nsOf = o => meta(o).namespace || o?.namespace || (o?.id && String(o.id).includes('/') ? String(o.id).split('/')[0] : undefined);
const arr = v => Array.isArray(v) ? v : [];

const SYSTEM_NS = ['kube-system', 'kube-public', 'kube-node-lease'];
const SYSTEM_NS_PREFIX = ['cattle-', 'fleet-', 'cluster-fleet', 'calico-', 'tigera-', 'rke2-', 'longhorn-system', 'local-path-storage', 'cert-manager', 'ingress-nginx', 'metallb-system', 'ingress-'];

export function providerOf(principal) {
  const i = String(principal).indexOf('://');

  return i > 0 ? String(principal).slice(0, i) : '';
}

export function prettyPrincipal(principal) {
  const p = String(principal);
  const i = p.indexOf('://');

  if (i < 0) {
    return p;
  }
  const rest = p.slice(i + 3);
  const cn = /^(?:CN|cn)=([^,]+)/.exec(rest);

  return cn ? cn[1] : rest;
}

export function isRancherManaged(o) {
  const labels = meta(o).labels || {};
  const ann = meta(o).annotations || {};
  const n = nameOf(o) || '';

  if (Object.keys(labels).some(k => k.startsWith('authz.cluster.cattle.io/') || k.startsWith('cattle.io/') && labels[k] === 'norman')) {
    return true;
  }
  if (Object.keys(ann).some(k => k.startsWith('lifecycle.cattle.io/'))) {
    return true;
  }

  return /^(crb|rb)-[a-z0-9]{8,}$/.test(n) || /^(clusterrolebinding|rolebinding)-[a-z0-9]{8,}$/.test(n) || /^(globaladmin|grb)-/.test(n);
}

function selectorMatches(sel, labels = {}) {
  const ml = sel.matchLabels || {};

  if (!Object.entries(ml).every(([k, v]) => labels[k] === v)) {
    return false;
  }

  return arr(sel.matchExpressions).every(e => {
    const has = Object.prototype.hasOwnProperty.call(labels, e.key);

    switch (e.operator) {
    case 'In': return has && arr(e.values).includes(labels[e.key]);
    case 'NotIn': return !has || !arr(e.values).includes(labels[e.key]);
    case 'Exists': return has;
    case 'DoesNotExist': return !has;
    default: return false;
    }
  });
}

export function buildModel(raw = {}) {
  const R = raw.rancher || {};
  const model = {
    subjects:  {},
    roles:     {},
    grants:    [],
    clusters:  {},
    projects:  {},
    tokens:    {},
    errors:    raw.errors || {},
    restricted: raw.restricted || [],
    k8sLoaded: [],
    counts:    {}
  };
  const principalToUser = {};

  /* ---------- clusters & projects ---------- */
  for (const c of arr(R.clusters)) {
    const cid = nameOf(c);

    model.clusters[cid] = { id: cid, name: val(c, 'displayName', cid), local: cid === 'local', state: c.state || c.status?.conditions?.find?.(x => x.type === 'Ready')?.status };
  }
  if (!model.clusters.local) {
    model.clusters.local = { id: 'local', name: 'local', local: true };
  }
  for (const p of arr(R.projects)) {
    const pid = nameOf(p);
    const cid = val(p, 'clusterName', nsOf(p));
    const key = `${ cid }:${ pid }`;

    model.projects[key] = { id: key, rawId: pid, cluster: cid, name: val(p, 'displayName', pid), namespaces: [] };
  }
  for (const [cid, k] of Object.entries(raw.k8s || {})) {
    for (const ns of arr(k.namespaces)) {
      const pid = meta(ns).labels?.['field.cattle.io/projectId'] || meta(ns).annotations?.['field.cattle.io/projectId'];
      const proj = pid && model.projects[`${ cid }:${ pid }`];

      if (proj) {
        proj.namespaces.push(nameOf(ns));
      }
    }
  }

  /* ---------- subjects ---------- */
  const ensure = (id, type, label, extra = {}) => {
    if (!model.subjects[id]) {
      model.subjects[id] = { id, type, label, layers: new Set(), tokens: [], external: false, system: false, ...extra };
    }

    return model.subjects[id];
  };

  for (const u of arr(R.users)) {
    const uid = nameOf(u);
    const username = val(u, 'username', '');
    const display = val(u, 'displayName', '') || username || uid;

    ensure(`user:${ uid }`, 'user', display, {
      rawId: uid, username, enabled: val(u, 'enabled', true) !== false, principalIds: arr(val(u, 'principalIds', [])), description: val(u, 'description', ''), created: meta(u).creationTimestamp, provider: ''
    });
    arr(val(u, 'principalIds', [])).forEach(p => {
      principalToUser[p] = uid;
    });
  }

  const userSubject = (name, principal) => {
    let uid = name && model.subjects[`user:${ name }`] ? name : undefined;

    if (!uid && principal && principalToUser[principal]) {
      uid = principalToUser[principal];
    }
    if (!uid && name && principalToUser[name]) {
      uid = principalToUser[name];
    }
    if (uid) {
      return model.subjects[`user:${ uid }`];
    }
    const raw = name || principal;

    return ensure(`user:${ raw }`, 'user', prettyPrincipal(raw), { rawId: raw, external: true, enabled: true, provider: providerOf(raw), system: String(raw).startsWith('system:') });
  };
  const groupSubject = name => ensure(`group:${ name }`, 'group', prettyPrincipal(name), { rawId: name, provider: providerOf(name), system: String(name).startsWith('system:') });
  const saSubject = (cid, ns, name) => ensure(`sa:${ cid }:${ ns }/${ name }`, 'serviceaccount', name, {
    rawId: name, namespace: ns, cluster: cid, system: SYSTEM_NS.includes(ns) || SYSTEM_NS_PREFIX.some(p => ns?.startsWith(p)) || String(name).startsWith('system:')
  });

  /* ---------- tokens ---------- */
  for (const t of arr(R.tokens)) {
    const tid = nameOf(t);
    const userId = val(t, 'userId', val(t, 'userID', ''));
    const ttl = Number(val(t, 'ttl', 0)) || 0;
    const created = meta(t).creationTimestamp || val(t, 'created');
    const expiresAt = val(t, 'expiresAt') || (ttl && created ? new Date(new Date(created).getTime() + ttl).toISOString() : null);
    const expired = val(t, 'expired', expiresAt ? new Date(expiresAt) < new Date() : false) === true;
    const owner = userId ? userSubject(userId) : null;
    const tok = {
      id: tid, owner: owner?.id, description: val(t, 'description', ''), ttl, expired, expiresAt, created,
      lastUsed: val(t, 'lastUsedAt', null), cluster: val(t, 'clusterId', val(t, 'clusterName', '')) || '', derived: !!val(t, 'isDerived', false), provider: val(t, 'authProvider', '')
    };

    model.tokens[tid] = tok;
    const sub = ensure(`token:${ tid }`, 'token', tok.description || tid, { rawId: tid, owner: owner?.id, token: tok, enabled: !expired });

    if (owner) {
      owner.tokens.push(sub.id);
    }
  }

  /* ---------- Rancher roles ---------- */
  const rtById = {};

  for (const rt of arr(R.roleTemplates)) {
    const id = nameOf(rt);

    rtById[id] = {
      id: `rancher:rt:${ id }`, rawId: id, layer: 'rancher', kind: 'RoleTemplate', name: id, label: val(rt, 'displayName', id) || id,
      context: val(rt, 'context', ''), own: arr(val(rt, 'rules', [])), inherits: arr(val(rt, 'roleTemplateNames', [])), builtin: !!val(rt, 'builtin', false),
      locked: !!val(rt, 'locked', false), external: !!val(rt, 'external', false), description: val(rt, 'description', ''), isDefault: !!(val(rt, 'clusterCreatorDefault') || val(rt, 'projectCreatorDefault'))
    };
  }
  const resolveRT = (id, seen = new Set()) => {
    const rt = rtById[id];

    if (!rt || seen.has(id)) {
      return [];
    }
    seen.add(id);

    return [...rt.own, ...rt.inherits.flatMap(i => resolveRT(i, seen))];
  };

  Object.values(rtById).forEach(rt => {
    rt.rules = resolveRT(rt.rawId);
    model.roles[rt.id] = rt;
  });

  for (const gr of arr(R.globalRoles)) {
    const id = nameOf(gr);
    const fleet = val(gr, 'inheritedFleetWorkspacePermissions', null);
    const rules = [...arr(val(gr, 'rules', []))];

    Object.values(val(gr, 'namespacedRules', {}) || {}).forEach(rs => rules.push(...arr(rs)));
    if (fleet?.resourceRules) {
      rules.push(...arr(fleet.resourceRules));
    }
    if (fleet?.workspaceVerbs) {
      rules.push({ apiGroups: ['management.cattle.io'], resources: ['fleetworkspaces'], verbs: fleet.workspaceVerbs });
    }
    model.roles[`rancher:gr:${ id }`] = {
      id: `rancher:gr:${ id }`, rawId: id, layer: 'rancher', kind: 'GlobalRole', name: id, label: val(gr, 'displayName', id) || id, rules,
      inheritedClusterRoles: arr(val(gr, 'inheritedClusterRoles', [])), builtin: !!val(gr, 'builtin', false), description: val(gr, 'description', ''),
      isDefault: !!val(gr, 'newUserDefault', false), context: 'global'
    };
  }

  /* ---------- Rancher grants ---------- */
  let gid = 0;
  const addGrant = g => {
    const subject = model.subjects[g.subjectId];

    subject?.layers.add(g.layer);
    model.grants.push({ id: `g${ gid++ }`, managed: false, ...g });
  };
  const clusterName = cid => (cid === '*' ? 'All clusters' : model.clusters[cid]?.name || cid);
  const scopeOf = {
    global:  () => ({ type: 'global', label: 'Global' }),
    cluster: cid => ({ type: 'cluster', cluster: cid, clusterName: clusterName(cid), label: `Cluster · ${ clusterName(cid) }` }),
    project: (cid, pid) => {
      const p = model.projects[`${ cid }:${ pid }`];

      return { type: 'project', cluster: cid, clusterName: clusterName(cid), project: pid, projectName: p?.name || pid, label: `Project · ${ clusterName(cid) } / ${ p?.name || pid }` };
    },
    namespace: (cid, ns) => ({ type: 'namespace', cluster: cid, clusterName: clusterName(cid), namespace: ns, label: `Namespace · ${ clusterName(cid) } / ${ ns }` })
  };
  const principalSubject = o => {
    const u = val(o, 'userName'), up = val(o, 'userPrincipalName'), gp = val(o, 'groupPrincipalName'), gn = val(o, 'groupName');

    if (u || up) {
      return userSubject(u, up);
    }
    if (gp || gn) {
      return groupSubject(gp || gn);
    }

    return null;
  };

  for (const b of arr(R.globalRoleBindings)) {
    const sub = principalSubject(b);
    const roleName = val(b, 'globalRoleName');
    const role = model.roles[`rancher:gr:${ roleName }`];

    if (!sub || !role) {
      continue;
    }
    addGrant({ subjectId: sub.id, roleId: role.id, layer: 'rancher', kind: 'GlobalRoleBinding', name: nameOf(b), scope: scopeOf.global() });
    for (const rtName of role.inheritedClusterRoles || []) {
      const rt = model.roles[`rancher:rt:${ rtName }`];

      rt && addGrant({ subjectId: sub.id, roleId: rt.id, layer: 'rancher', kind: 'GlobalRole (inherited)', name: `${ role.label } ➜ ${ rt.label }`, scope: scopeOf.cluster('*'), inherited: true });
    }
  }
  for (const b of arr(R.crtbs)) {
    const sub = principalSubject(b);
    const role = model.roles[`rancher:rt:${ val(b, 'roleTemplateName') }`];
    const cid = val(b, 'clusterName', nsOf(b));

    sub && role && addGrant({ subjectId: sub.id, roleId: role.id, layer: 'rancher', kind: 'ClusterRoleTemplateBinding', name: nameOf(b), scope: scopeOf.cluster(cid) });
  }
  for (const b of arr(R.prtbs)) {
    const sub = principalSubject(b);
    const role = model.roles[`rancher:rt:${ val(b, 'roleTemplateName') }`];
    const [cid, pid] = String(val(b, 'projectName', '')).split(':');

    sub && role && addGrant({ subjectId: sub.id, roleId: role.id, layer: 'rancher', kind: 'ProjectRoleTemplateBinding', name: nameOf(b), scope: scopeOf.project(cid, pid) });
  }

  /* ---------- Kubernetes RBAC (per cluster) ---------- */
  for (const [cid, k] of Object.entries(raw.k8s || {})) {
    if (k.error) {
      model.errors[`k8s:${ cid }`] = k.error;
    }
    if (!k.clusterRoles && !k.roles && !k.clusterRoleBindings && !k.roleBindings) {
      continue;
    }
    model.k8sLoaded.push(cid);
    const crs = arr(k.clusterRoles);

    for (const cr of crs) {
      const n = nameOf(cr);
      let rules = arr(cr.rules);

      if (cr.aggregationRule && !rules.length) {
        const sels = arr(cr.aggregationRule.clusterRoleSelectors);

        rules = crs.filter(o => nameOf(o) !== n && sels.some(s => selectorMatches(s, meta(o).labels))).flatMap(o => arr(o.rules));
      }
      model.roles[`k8s:${ cid }:cr:${ n }`] = {
        id: `k8s:${ cid }:cr:${ n }`, rawId: n, layer: 'k8s', kind: 'ClusterRole', name: n, label: n, cluster: cid, rules, aggregated: !!cr.aggregationRule,
        builtin: n.startsWith('system:') || meta(cr).labels?.['kubernetes.io/bootstrapping'] === 'rbac-defaults', managed: isRancherManaged(cr), context: 'cluster'
      };
    }
    for (const r of arr(k.roles)) {
      const n = nameOf(r), ns = nsOf(r);

      model.roles[`k8s:${ cid }:r:${ ns }/${ n }`] = {
        id: `k8s:${ cid }:r:${ ns }/${ n }`, rawId: n, layer: 'k8s', kind: 'Role', name: n, label: `${ ns }/${ n }`, namespace: ns, cluster: cid, rules: arr(r.rules),
        builtin: n.startsWith('system:'), managed: isRancherManaged(r), context: 'namespace'
      };
    }
    const subjectsOf = (cid2, binding) => arr(binding.subjects).map(s => {
      if (s.kind === 'ServiceAccount') {
        return saSubject(cid2, s.namespace || nsOf(binding), s.name);
      }
      if (s.kind === 'Group') {
        return groupSubject(s.name);
      }

      return userSubject(s.name);
    });
    const roleFor = (cid2, ref, ns) => (ref.kind === 'Role' ? model.roles[`k8s:${ cid2 }:r:${ ns }/${ ref.name }`] : model.roles[`k8s:${ cid2 }:cr:${ ref.name }`]);

    for (const b of arr(k.clusterRoleBindings)) {
      const role = roleFor(cid, b.roleRef);

      if (!role) {
        continue;
      }
      for (const sub of subjectsOf(cid, b)) {
        addGrant({ subjectId: sub.id, roleId: role.id, layer: 'k8s', kind: 'ClusterRoleBinding', name: nameOf(b), scope: scopeOf.cluster(cid), managed: isRancherManaged(b) });
      }
    }
    for (const b of arr(k.roleBindings)) {
      const ns = nsOf(b);
      const role = roleFor(cid, b.roleRef, ns);

      if (!role) {
        continue;
      }
      for (const sub of subjectsOf(cid, b)) {
        addGrant({ subjectId: sub.id, roleId: role.id, layer: 'k8s', kind: 'RoleBinding', name: nameOf(b), scope: scopeOf.namespace(cid, ns), managed: isRancherManaged(b) });
      }
    }
  }

  /* ---------- derived role info ---------- */
  const boundRoles = new Set(model.grants.map(g => g.roleId));

  for (const role of Object.values(model.roles)) {
    role.cats = categoryLevels(role.rules);
    role.power = Math.max(0, ...Object.values(role.cats).map(c => c.level));
    role.fullAdmin = isFullAdmin(role.rules);
    role.wildcard = hasWildcard(role.rules);
    role.bound = boundRoles.has(role.id);
    role.system = !!(role.builtin && role.layer === 'k8s' && role.name.startsWith('system:'));
  }
  for (const sub of Object.values(model.subjects)) {
    if (sub.type === 'token') {
      sub.layers.add('rancher');
    }
  }
  model.counts = {
    users:  Object.values(model.subjects).filter(s => s.type === 'user').length,
    groups: Object.values(model.subjects).filter(s => s.type === 'group').length,
    sas:    Object.values(model.subjects).filter(s => s.type === 'serviceaccount').length,
    tokens: Object.keys(model.tokens).length,
    roles:  Object.keys(model.roles).length,
    grants: model.grants.length,
    clusters: Object.keys(model.clusters).length
  };

  return model;
}
