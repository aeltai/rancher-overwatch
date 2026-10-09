/**
 * Access-graph builder + layered (Sankey-like) layout. Pure functions.
 *   [Token] → Subject → Role → Capability
 */
import { CATEGORIES } from './rules.js';
import { visibleGrants, effective } from './effective.js';

export const SUBJECT_COLORS = { user: '#3d98d3', group: '#8573c4', serviceaccount: '#c98a2b', token: '#b8607f' };
export const SUBJECT_ICONS = { user: '', group: '', serviceaccount: '', token: '' };
export const LAYER_COLORS = { rancher: '#1c9a9a', k8s: '#326ce5' };

export const clip = (s, n) => {
  const t = String(s ?? '');

  return t.length > n ? `${ t.slice(0, n - 1) }…` : t;
};

const ci = (a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });

export function buildGraph(model, opts, view = {}) {
  const types = view.types || new Set(['user', 'group', 'serviceaccount']);
  const q = (view.search || '').trim().toLowerCase();
  const maxSubjects = view.maxSubjects || 40;
  let grants = visibleGrants(model, opts).filter(g => types.has(model.subjects[g.subjectId].type));

  if (q) {
    grants = grants.filter(g => {
      const s = model.subjects[g.subjectId], r = model.roles[g.roleId];

      return [s.label, s.id, s.rawId, r.label, g.scope.label].some(x => String(x || '').toLowerCase().includes(q));
    });
  }

  /* rank subjects so we can cap the picture */
  const perSubject = new Map();

  grants.forEach(g => {
    const e = perSubject.get(g.subjectId) || { n: 0, p: 0 };

    e.n++;
    e.p = Math.max(e.p, model.roles[g.roleId].power * 10 + (model.roles[g.roleId].fullAdmin ? 100 : 0));
    perSubject.set(g.subjectId, e);
  });
  const ranked = [...perSubject.entries()].sort((a, b) => (b[1].p - a[1].p) || (b[1].n - a[1].n)).map(e => e[0]);
  const keep = new Set(ranked.slice(0, maxSubjects));
  const hiddenSubjects = Math.max(0, ranked.length - keep.size);

  grants = grants.filter(g => keep.has(g.subjectId));

  const nodes = new Map();
  const edges = new Map();
  const addNode = n => {
    if (!nodes.has(n.id)) {
      nodes.set(n.id, n);
    }

    return nodes.get(n.id);
  };

  for (const g of grants) {
    const s = model.subjects[g.subjectId], r = model.roles[g.roleId];

    if (!nodes.has(s.id)) {
      const eff = effective(model, s.id, opts);

      addNode({ id: s.id, kind: 'subject', col: 1, subject: s, label: s.label, sub: subjectSub(s), color: SUBJECT_COLORS[s.type], icon: SUBJECT_ICONS[s.type], admin: eff.admin, power: eff.power });
    }
    addNode({ id: r.id, kind: 'role', col: 2, role: r, label: r.label, sub: `${ r.kind }${ r.cluster ? ` · ${ model.clusters[r.cluster]?.name || r.cluster }` : '' }`, color: LAYER_COLORS[r.layer], icon: '', admin: r.fullAdmin, power: r.power });
    const key = `${ s.id }>${ r.id }`;
    const e = edges.get(key) || { id: key, source: s.id, target: r.id, kind: 'binding', grants: [], weight: 0, broad: false };

    e.grants.push(g);
    e.weight++;
    e.broad = e.broad || g.scope.type === 'global' || g.scope.type === 'cluster';
    edges.set(key, e);
  }

  /* capabilities */
  const usedCats = new Set();

  for (const n of [...nodes.values()].filter(x => x.kind === 'role')) {
    for (const [cid, info] of Object.entries(n.role.cats)) {
      if (info.level > 0) {
        usedCats.add(cid);
        edges.set(`${ n.id }>cat:${ cid }`, { id: `${ n.id }>cat:${ cid }`, source: n.id, target: `cat:${ cid }`, kind: 'capability', level: info.level, special: info.special.size > 0 });
      }
    }
  }
  CATEGORIES.filter(c => usedCats.has(c.id)).forEach(c => addNode({ id: `cat:${ c.id }`, kind: 'category', col: 3, cat: c, label: c.label, sub: c.hint, color: c.color, icon: c.glyph }));

  /* tokens */
  let tokenCount = 0;

  if (view.showTokens) {
    for (const n of [...nodes.values()].filter(x => x.kind === 'subject' && x.subject.type === 'user')) {
      for (const tid of n.subject.tokens) {
        if (tokenCount >= 30) {
          break;
        }
        const t = model.subjects[tid];

        addNode({ id: t.id, kind: 'subject', col: 0, subject: t, label: t.label, sub: tokenSub(t.token), color: SUBJECT_COLORS.token, icon: SUBJECT_ICONS.token, admin: false, power: 0, expired: t.token.expired });
        edges.set(`${ t.id }>${ n.id }`, { id: `${ t.id }>${ n.id }`, source: t.id, target: n.id, kind: 'token', weight: 1 });
        tokenCount++;
      }
    }
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()], hiddenSubjects, grantCount: grants.length };
}

function subjectSub(s) {
  if (s.type === 'user') {
    return `User · ${ s.enabled === false ? 'disabled · ' : '' }${ s.username || s.rawId }${ s.external ? ' (external)' : '' }`;
  }
  if (s.type === 'group') {
    return `Group${ s.provider ? ` · ${ s.provider }` : '' }`;
  }
  if (s.type === 'serviceaccount') {
    return `Service account · ${ s.namespace }`;
  }

  return s.type;
}

function tokenSub(t) {
  if (t.expired) {
    return 'Token · expired';
  }

  return `Token · ${ t.ttl ? `ttl ${ Math.round(t.ttl / 3600000) }h` : 'no expiry' }${ t.cluster ? ` · ${ t.cluster }` : '' }`;
}

/* ------------------------------------------------------------------ */
/*  Layout                                                              */
/* ------------------------------------------------------------------ */
export function layoutGraph(graph, o = {}) {
  const w = o.nodeW || 196, h = o.nodeH || 42, gapY = o.gapY || 14, colGap = o.colGap || 150, pad = o.pad || 28;
  const cols = [...new Set(graph.nodes.map(n => n.col))].sort((a, b) => a - b);
  const byCol = cols.map(c => graph.nodes.filter(n => n.col === c));
  const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
  const nbr = new Map(graph.nodes.map(n => [n.id, { in: [], out: [] }]));

  graph.edges.forEach(e => {
    nbr.get(e.source)?.out.push(e.target);
    nbr.get(e.target)?.in.push(e.source);
  });

  const catOrder = Object.fromEntries(CATEGORIES.map((c, i) => [`cat:${ c.id }`, i]));

  byCol.forEach(list => list.sort((a, b) => {
    if (a.kind === 'category') {
      return catOrder[a.id] - catOrder[b.id];
    }
    const ta = a.subject?.type || '', tb = b.subject?.type || '';

    return (ta === tb ? 0 : ci(ta, tb)) || ci(a.label, b.label);
  }));

  const idx = new Map();
  const reindex = () => byCol.forEach(list => list.forEach((n, i) => idx.set(n.id, i)));

  reindex();
  const bary = (n, side) => {
    const ns = nbr.get(n.id)[side].filter(id => idx.has(id));

    return ns.length ? ns.reduce((s, id) => s + idx.get(id), 0) / ns.length : idx.get(n.id);
  };

  for (let it = 0; it < 6; it++) {
    for (let c = 1; c < byCol.length; c++) {
      if (byCol[c][0]?.kind === 'category') {
        continue;
      }
      byCol[c].sort((a, b) => bary(a, 'in') - bary(b, 'in') || ci(a.label, b.label));
      reindex();
    }
    for (let c = byCol.length - 2; c >= 0; c--) {
      if (byCol[c][0]?.kind === 'category') {
        continue;
      }
      byCol[c].sort((a, b) => bary(a, 'out') - bary(b, 'out') || ci(a.label, b.label));
      reindex();
    }
  }

  const maxCount = Math.max(1, ...byCol.map(l => l.length));
  const height = pad * 2 + maxCount * (h + gapY) - gapY;

  byCol.forEach((list, ci2) => {
    const colH = list.length * (h + gapY) - gapY;
    const top = pad + (height - pad * 2 - colH) / 2;

    list.forEach((n, i) => {
      n.x = pad + ci2 * (w + colGap);
      n.y = top + i * (h + gapY);
      n.w = w;
      n.h = h;
    });
  });

  graph.edges.forEach(e => {
    const s = nodeById.get(e.source), t = nodeById.get(e.target);

    if (!s || !t) {
      return;
    }
    const x1 = s.x + s.w, y1 = s.y + s.h / 2, x2 = t.x, y2 = t.y + t.h / 2;
    const dx = Math.max(40, (x2 - x1) * 0.55);

    e.d = `M${ x1 },${ y1 } C${ x1 + dx },${ y1 } ${ x2 - dx },${ y2 } ${ x2 },${ y2 }`;
    e.width = e.kind === 'capability' ? 1.2 + e.level * 1.4 : e.kind === 'token' ? 1.4 : 1.6 + Math.min(4, Math.log2(1 + (e.weight || 1)) * 1.4);
  });

  graph.width = pad * 2 + cols.length * w + (cols.length - 1) * colGap;
  graph.height = height;
  graph.colX = cols.map((c, i) => ({ col: c, x: pad + i * (w + colGap) }));
  graph.nodeW = w;

  return graph;
}

/** every node/edge reachable upstream + downstream from a node */
export function connected(graph, startId) {
  const outs = new Map(), ins = new Map();

  graph.edges.forEach(e => {
    (outs.get(e.source) || outs.set(e.source, []).get(e.source)).push(e);
    (ins.get(e.target) || ins.set(e.target, []).get(e.target)).push(e);
  });
  const nodes = new Set([startId]), edges = new Set();
  const walk = (id, map, next) => {
    for (const e of map.get(id) || []) {
      edges.add(e.id);
      const n = e[next];

      if (!nodes.has(n)) {
        nodes.add(n);
        walk(n, map, next);
      }
    }
  };

  walk(startId, outs, 'target');
  walk(startId, ins, 'source');

  return { nodes, edges };
}
