/**
 * Audit-log parsing + analysis (pure functions).
 * Understands Rancher API audit logs (rancher-audit-log sidecar / rancher-api-audit.log)
 * and Kubernetes API-server audit events (audit.k8s.io/v1), one JSON object per line.
 */

const RBAC_RE = /(globalrole|roletemplate|rolebinding|clusterrole|\/tokens?(\/|$|\?)|\btokens?\b|\/users?(\/|$|\?)|\/groups?(\/|$|\?)|principals|setpassword|changepassword|authconfig)/i;
const FIELDS = ['roleTemplateName', 'globalRoleName', 'userId', 'userName', 'userPrincipalId', 'userPrincipalName', 'groupPrincipalId', 'groupPrincipalName', 'clusterId', 'clusterName', 'projectId', 'description', 'ttl'];

export function parseAuditText(text) {
  const out = [];
  const t = String(text || '').trim();

  if (t.startsWith('[')) {
    try {
      return JSON.parse(t).map(normalizeEvent).filter(Boolean);
    } catch (e) { /* fall through to line mode */ }
  }
  for (const line of t.split(/\r?\n/)) {
    const l = line.trim();
    const i = l.indexOf('{');

    if (i < 0) {
      continue;
    }
    try {
      const ev = normalizeEvent(JSON.parse(l.slice(i)));

      ev && out.push(ev);
    } catch (e) { /* not a json line */ }
  }

  return out;
}

function parsePath(uriRaw) {
  const [path, query = ''] = String(uriRaw || '').split('?');
  let segs = path.split('/').filter(Boolean);
  let cluster = null;
  const q = Object.fromEntries(query.split('&').filter(Boolean).map(p => p.split('=')));

  if (segs[0] === 'k8s' && segs[1] === 'clusters') {
    cluster = segs[2];
    segs = segs.slice(3);
  }
  if (['v1', 'v3', 'v3-public'].includes(segs[0])) {
    segs = segs.slice(1);
  } else if (segs[0] === 'api') {
    segs = segs.slice(2);
  } else if (segs[0] === 'apis') {
    segs = segs.slice(3);
  }
  let ns = null;

  if (segs[0] === 'namespaces' && segs.length > 2) {
    ns = segs[1];
    segs = segs.slice(2);
  }
  const resource = segs[0] || '';
  const name = segs.slice(1).join('/');

  return { cluster, resource, name, ns, action: q.action || null, link: q.link || null };
}

export function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const k8s = !!raw.verb || !!raw.objectRef;
  const ts = raw.requestTimestamp || raw.stageTimestamp || raw.requestReceivedTimestamp || raw.timestamp || raw.time;
  const time = ts ? Date.parse(ts) : NaN;

  if (!Number.isFinite(time)) {
    return null;
  }
  const u = raw.user || {};
  const username = u.extra?.username?.[0] || u.extra?.Username?.[0] || u.username || u.name || '';
  const userId = u.name || u.username || '';
  let method, verb, res, code, uri, ip;

  if (k8s) {
    const o = raw.objectRef || {};

    verb = raw.verb;
    method = ({ get: 'GET', list: 'GET', watch: 'GET', create: 'POST', update: 'PUT', patch: 'PATCH', delete: 'DELETE', deletecollection: 'DELETE' })[verb] || 'GET';
    res = { cluster: raw.annotations?.cluster || null, resource: o.subresource ? `${ o.resource }/${ o.subresource }` : o.resource || '', name: o.name || '', ns: o.namespace || null, action: null };
    code = Number(raw.responseStatus?.code || 0);
    uri = raw.requestURI || '';
    ip = raw.sourceIPs?.[0] || '';
  } else {
    method = String(raw.method || 'GET').toUpperCase();
    uri = raw.requestURI || raw.requestUri || raw.requestURL || '';
    res = parsePath(uri);
    code = Number(raw.responseCode ?? raw.responseStatus ?? 0);
    ip = raw.remoteAddr || raw.remoteAddress || '';
    verb = res.action ? res.action : method === 'GET' ? (res.name ? 'get' : 'list') : method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'update';
  }
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(method) && !/login|logout/.test(`${ res.action || '' }${ uri }`);
  const login = /action=login|\/login|logout/.test(uri);
  const denied = code === 401 || code === 403;
  const rbac = write && RBAC_RE.test(`${ res.resource }/${ uri }`);
  let detail = '';
  let body = raw.requestBody;

  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) { body = null; }
  }
  if (body && typeof body === 'object') {
    detail = FIELDS.filter(f => body[f] !== undefined && body[f] !== '').map(f => `${ f }=${ body[f] }`).join(', ');
  }

  return {
    id: raw.auditID || raw.auditId || `${ time }-${ Math.random().toString(36).slice(2, 7) }`, time, userId, user: username, method, verb, uri, code, ip, login,
    cluster: res.cluster, resource: res.resource, target: res.name, ns: res.ns, write, denied, rbac, detail, subjectId: null, source: k8s ? 'kubernetes' : 'rancher'
  };
}

/** link events to the subjects of the RBAC model */
export function attachSubjects(model, events) {
  const byUsername = {};

  Object.values(model.subjects).filter(s => s.type === 'user' && s.username).forEach(s => {
    byUsername[s.username] = s.id;
  });

  return events.map(e => {
    let id = model.subjects[`user:${ e.userId }`] ? `user:${ e.userId }` : null;

    id = id || byUsername[e.user] || byUsername[e.userId] || null;

    return { ...e, subjectId: id };
  });
}

export function filterEvents(events, f = {}) {
  const q = (f.search || '').trim().toLowerCase();

  return events.filter(e => {
    if (!f.reads && !e.write && !e.denied && !e.login) {
      return false;
    }
    if (f.rbac && !e.rbac) {
      return false;
    }
    if (f.denied && !e.denied) {
      return false;
    }
    if (f.writes && !e.write) {
      return false;
    }
    if (f.subjectId && e.subjectId !== f.subjectId) {
      return false;
    }
    if (q && !`${ e.user } ${ e.userId } ${ e.resource } ${ e.target } ${ e.verb } ${ e.uri } ${ e.detail } ${ e.cluster || '' } ${ e.ip }`.toLowerCase().includes(q)) {
      return false;
    }

    return true;
  }).sort((a, b) => b.time - a.time);
}

export function summarize(events) {
  if (!events.length) {
    return { count: 0, from: null, to: null, writes: 0, denied: 0, rbac: 0, users: 0 };
  }
  const times = events.map(e => e.time);

  return {
    count: events.length, from: Math.min(...times), to: Math.max(...times), writes: events.filter(e => e.write).length,
    denied: events.filter(e => e.denied).length, rbac: events.filter(e => e.rbac).length, users: new Set(events.map(e => e.user || e.userId)).size
  };
}

export function bucketEvents(events, n = 48) {
  const s = summarize(events);

  if (!s.count) {
    return [];
  }
  const span = Math.max(1, s.to - s.from);
  const step = span / n;
  const out = Array.from({ length: n }, (_, i) => ({ t0: s.from + i * step, t1: s.from + (i + 1) * step, read: 0, write: 0, rbac: 0, denied: 0 }));

  for (const e of events) {
    const b = out[Math.min(n - 1, Math.floor((e.time - s.from) / step))];

    if (e.denied) {
      b.denied++;
    } else if (e.rbac) {
      b.rbac++;
    } else if (e.write) {
      b.write++;
    } else {
      b.read++;
    }
  }

  return out;
}

export function describe(e) {
  const what = e.verb === 'login' || e.login ? (e.denied ? 'failed login' : 'login') : `${ e.verb } ${ e.resource }`.trim();

  return { what, target: [e.cluster && e.cluster !== 'local' ? e.cluster : null, e.ns, e.target].filter(Boolean).join(' / ') };
}
