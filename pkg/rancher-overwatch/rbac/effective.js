/**
 * Effective-permission engine + risk analysis (pure functions).
 */
import { CATEGORIES, KNOWN_RESOURCES, GRID_VERBS, ruleAllows } from './rules.js';

export const defaultOpts = () => ({ layer: 'both', cluster: 'local', hideSystem: true, hideManaged: true });

const isBroad = g => g.scope.type === 'global' || g.scope.type === 'cluster';

export function grantVisible(model, g, opts) {
  if (opts.layer !== 'both' && g.layer !== opts.layer) {
    return false;
  }
  if (opts.cluster !== 'all') {
    const c = g.scope.cluster;

    if (c && c !== '*' && c !== opts.cluster) {
      return false;
    }
  }
  if (opts.layer === 'both' && opts.hideManaged && g.managed) {
    return false;
  }
  if (opts.hideSystem && (model.subjects[g.subjectId]?.system || model.roles[g.roleId]?.system)) {
    return false;
  }

  return !!model.roles[g.roleId] && !!model.subjects[g.subjectId];
}

export function visibleGrants(model, opts) {
  return model.grants.filter(g => grantVisible(model, g, opts));
}

/** grants that apply to a subject – tokens inherit the permissions of their owner */
export function grantsOfSubject(model, subjectId, opts) {
  const sub = model.subjects[subjectId];

  if (!sub) {
    return [];
  }
  if (sub.type === 'token') {
    const ownerId = sub.owner;
    const cl = sub.token?.cluster;
    const base = ownerId ? model.grants.filter(g => g.subjectId === ownerId && grantVisible(model, g, { ...opts, hideSystem: false })) : [];

    return cl ? base.filter(g => !g.scope.cluster || g.scope.cluster === '*' || g.scope.cluster === cl) : base;
  }

  return model.grants.filter(g => g.subjectId === subjectId && grantVisible(model, g, { ...opts, hideSystem: false }));
}

export function effective(model, subjectId, opts) {
  const grants = grantsOfSubject(model, subjectId, opts);
  const cats = {};

  CATEGORIES.forEach(c => {
    cats[c.id] = { all: 0, limited: 0, level: 0, roles: new Set(), scopes: new Set() };
  });
  const special = new Set();
  let admin = false;

  for (const g of grants) {
    const role = model.roles[g.roleId];

    if (!role) {
      continue;
    }
    const broad = isBroad(g);

    admin = admin || (role.fullAdmin && broad);
    for (const [cid, info] of Object.entries(role.cats)) {
      if (!info.level) {
        continue;
      }
      const cell = cats[cid];

      if (broad && !info.named) {
        cell.all = Math.max(cell.all, info.level);
      } else {
        cell.limited = Math.max(cell.limited, info.level);
      }
      cell.roles.add(role.id);
      cell.scopes.add(g.scope.label);
      info.special.forEach(s => special.add(s));
    }
  }
  let power = 0;

  for (const cell of Object.values(cats)) {
    cell.level = Math.max(cell.all, cell.limited);
    power += cell.all * 3 + cell.limited;
  }

  return { grants, cats, power: admin ? 999 : power, admin, special: [...special] };
}

/** can <verb> on <group>/<resource>? returns { state: all|limited|none, via:[...] } */
export function explain(model, grants, group, resource, verb) {
  const via = [];
  let all = false;

  for (const g of grants) {
    const role = model.roles[g.roleId];
    const res = role && ruleAllows(role.rules, group, resource, verb);

    if (res?.allowed) {
      via.push({ grant: g, role, named: res.named });
      all = all || isBroad(g) && !res.named;
    }
  }

  return { state: all ? 'all' : via.length ? 'limited' : 'none', via };
}

export function gridRows(model, grants) {
  const known = new Set(KNOWN_RESOURCES.map(r => `${ r.group }/${ r.resource }`));
  const extra = new Map();

  for (const g of grants) {
    for (const rule of model.roles[g.roleId]?.rules || []) {
      for (const grp of rule.apiGroups || []) {
        for (const r of rule.resources || []) {
          const key = `${ grp }/${ r }`;

          if (r !== '*' && grp !== '*' && !known.has(key) && !extra.has(key) && extra.size < 14) {
            extra.set(key, { group: grp, resource: r, label: r, extra: true });
          }
        }
      }
    }
  }

  return [...KNOWN_RESOURCES, ...extra.values()];
}

export function permissionGrid(model, subjectId, opts) {
  const { grants } = effective(model, subjectId, opts);

  return gridRows(model, grants).map(row => ({
    ...row,
    cells: Object.fromEntries(GRID_VERBS.map(v => [v, explain(model, grants, row.group, row.resource, v)]))
  }));
}

/* ------------------------------------------------------------------ */
/*  Risk analysis                                                       */
/* ------------------------------------------------------------------ */
export const SEVERITY = {
  critical: { rank: 4, label: 'Critical', color: '#d9453f' },
  high:     { rank: 3, label: 'High', color: '#e07b39' },
  medium:   { rank: 2, label: 'Medium', color: '#dd9b2e' },
  low:      { rank: 1, label: 'Low', color: '#3d98d3' },
  info:     { rank: 0, label: 'Info', color: '#8a94a3' }
};

export function computeRisks(model, opts, events = []) {
  const findings = [];
  const o = { ...opts, hideSystem: true, hideManaged: opts.layer === 'both' };
  const grants = visibleGrants(model, o);
  const push = f => findings.push({ ...f, id: `f${ findings.length }` });
  const bySubject = new Map();

  grants.forEach(g => {
    bySubject.set(g.subjectId, [...(bySubject.get(g.subjectId) || []), g]);
  });

  const admins = new Set();

  for (const [sid, gs] of bySubject) {
    if (gs.some(g => model.roles[g.roleId]?.fullAdmin && isBroad(g))) {
      admins.add(sid);
    }
  }
  if (admins.size) {
    push({
      severity: 'critical', title: `${ admins.size } subject${ admins.size === 1 ? '' : 's' } with full administrator access`,
      detail:   'Bound to a role that allows every verb on every resource (cluster-admin / Rancher admin) at global or cluster scope.', subjects: [...admins], roles: []
    });
  }

  const wild = Object.values(model.roles).filter(r => r.wildcard && !r.fullAdmin && !r.builtin && r.bound && (opts.layer === 'both' || r.layer === opts.layer));

  wild.forEach(r => push({ severity: 'high', title: `Custom role “${ r.label }” uses wildcards`, detail: 'Wildcard verbs, resources or API groups silently grant access to resources added in the future.', subjects: [], roles: [r.id] }));

  const escalators = new Set(), secretsReaders = new Set(), execers = new Set();

  for (const [sid, gs] of bySubject) {
    if (admins.has(sid)) {
      continue;
    }
    for (const g of gs) {
      const role = model.roles[g.roleId];

      if (!role) {
        continue;
      }
      if (Object.values(role.cats).some(c => c.special.size) && isBroad(g)) {
        escalators.add(sid);
      }
      if (role.cats.secrets?.level >= 1 && isBroad(g) && !role.cats.secrets.named) {
        secretsReaders.add(sid);
      }
      if (role.cats.exec?.level >= 2 && isBroad(g) && !role.cats.exec.named) {
        execers.add(sid);
      }
    }
  }
  if (escalators.size) {
    push({ severity: 'high', title: 'Privilege-escalation verbs granted', detail: '`escalate`, `bind`, `impersonate` or `approve` let a subject grant itself more access than it was given.', subjects: [...escalators], roles: [] });
  }
  if (secretsReaders.size) {
    push({ severity: 'medium', title: `${ secretsReaders.size } non-admin subject${ secretsReaders.size === 1 ? '' : 's' } can read Secrets cluster-wide`, detail: 'Reading secrets across namespaces exposes credentials, tokens and certificates.', subjects: [...secretsReaders], roles: [] });
  }
  if (execers.size) {
    push({ severity: 'medium', title: 'Exec / proxy access cluster-wide', detail: 'pods/exec, port-forward and proxy give an interactive shell inside workloads – a lateral-movement path.', subjects: [...execers], roles: [] });
  }

  const tokens = Object.values(model.tokens);
  const neverExpiring = tokens.filter(t => !t.ttl && !t.expired && !t.derived);

  if (neverExpiring.length) {
    const adminOwned = neverExpiring.filter(t => admins.has(t.owner));

    if (adminOwned.length) {
      push({ severity: 'high', title: `${ adminOwned.length } non-expiring API token${ adminOwned.length === 1 ? '' : 's' } owned by administrators`, detail: 'A leaked admin token without TTL is a permanent backdoor.', subjects: adminOwned.map(t => `token:${ t.id }`), roles: [] });
    }
    const rest = neverExpiring.filter(t => !admins.has(t.owner));

    if (rest.length) {
      push({ severity: 'low', title: `${ rest.length } API token${ rest.length === 1 ? '' : 's' } never expire`, detail: 'Prefer a TTL so unused credentials age out.', subjects: rest.map(t => `token:${ t.id }`), roles: [] });
    }
  }
  const expired = tokens.filter(t => t.expired);

  if (expired.length) {
    push({ severity: 'info', title: `${ expired.length } expired token${ expired.length === 1 ? '' : 's' } still present`, detail: 'Safe to clean up.', subjects: expired.map(t => `token:${ t.id }`), roles: [] });
  }
  const disabled = Object.values(model.subjects).filter(s => s.type === 'user' && s.enabled === false && model.grants.some(g => g.subjectId === s.id));

  if (disabled.length) {
    push({ severity: 'medium', title: `${ disabled.length } disabled user${ disabled.length === 1 ? '' : 's' } still hold role bindings`, detail: 'Disabled accounts should have their bindings removed so re-enabling is a deliberate act.', subjects: disabled.map(s => s.id), roles: [] });
  }
  const unused = Object.values(model.roles).filter(r => !r.builtin && !r.bound && !r.managed && r.layer === 'k8s' && (opts.cluster === 'all' || r.cluster === opts.cluster));

  if (unused.length) {
    push({ severity: 'info', title: `${ unused.length } custom Kubernetes role${ unused.length === 1 ? '' : 's' } without any binding`, detail: unused.slice(0, 6).map(r => r.label).join(', ') + (unused.length > 6 ? '…' : ''), subjects: [], roles: unused.map(r => r.id) });
  }

  /* ---- access × activity (needs audit events) ---- */
  if (events.length) {
    const hrs = (Math.max(...events.map(x => x.time)) - Math.min(...events.map(x => x.time))) / 36e5;
    const win = hrs >= 48 ? `${ Math.round(hrs / 24) } days` : `${ Math.max(1, Math.round(hrs)) } h`;
    const by = (pred) => {
      const m = new Map();

      events.filter(pred).forEach(x => x.subjectId && m.set(x.subjectId, (m.get(x.subjectId) || 0) + 1));

      return m;
    };
    const deniedBy = [...by(x => x.denied)].filter(([, n]) => n >= 3);

    if (deniedBy.length) {
      push({ severity: 'medium', title: 'Repeated denied requests', detail: `Three or more 401/403 responses within ${ win } – probing for access or a missing binding.`, subjects: deniedBy.map(([id]) => id), roles: [] });
    }
    const rbacBy = [...by(x => x.rbac)];

    if (rbacBy.length) {
      push({ severity: 'info', title: `${ events.filter(x => x.rbac).length } RBAC / token changes in the audit window`, detail: `Made by ${ rbacBy.map(([id, n]) => `${ model.subjects[id]?.label || id } (${ n })` ).join(', ') } over ${ win }.`, subjects: rbacBy.map(([id]) => id), roles: [] });
    }
    const active = new Set(events.filter(x => x.subjectId && !x.denied).map(x => x.subjectId));
    const dormant = [...admins].filter(id => model.subjects[id]?.type === 'user' && !active.has(id));

    if (dormant.length && hrs >= 1) {
      push({ severity: 'low', title: `${ dormant.length } administrator${ dormant.length === 1 ? '' : 's' } with no activity in ${ win }`, detail: 'Standing admin rights nobody is using are a good candidate for removal or just-in-time access.', subjects: dormant, roles: [] });
    }
    const ghosts = [...by(x => !x.denied && !x.login)].filter(([id]) => model.subjects[id]?.enabled === false);

    if (ghosts.length) {
      push({ severity: 'high', title: 'Disabled users are still making successful requests', detail: 'A disabled account should not be able to call the API – check for long-lived tokens.', subjects: ghosts.map(([id]) => id), roles: [] });
    }
  }

  return findings.sort((a, b) => SEVERITY[b.severity].rank - SEVERITY[a.severity].rank);
}
