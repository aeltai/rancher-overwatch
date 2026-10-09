import assert from 'node:assert/strict';
import { demoRaw } from '../demo-data.js';
import { buildModel } from '../normalize.js';
import { effective, explain, computeRisks, defaultOpts, visibleGrants } from '../effective.js';
import { buildGraph, layoutGraph, connected } from '../graph.js';
import { categoryLevels, ruleAllows, categorize } from '../rules.js';
import { demoAudit } from '../demo-data.js';
import { describeAccess, restrictRaw, can } from '../access.js';
import { parseAuditText, attachSubjects, filterEvents, summarize, bucketEvents } from '../audit.js';

const model = buildModel(demoRaw());
const opts = { ...defaultOpts(), cluster: 'c-m-prod1' };
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ✓', name); };

t('categorize', () => {
  assert.equal(categorize('', 'secrets'), 'secrets');
  assert.equal(categorize('', 'pods/exec'), 'exec');
  assert.equal(categorize('apps', 'deployments'), 'workloads');
  assert.equal(categorize('management.cattle.io', 'clusters'), 'rancher');
  assert.equal(categorize('fleet.cattle.io', 'gitrepos'), 'gitops');
});
t('wildcard rule touches every category at full', () => {
  const c = categoryLevels([{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }]);
  assert.equal(c.secrets.level, 3); assert.equal(c.exec.level, 3); assert.equal(c.rancher.level, 3);
});
t('read-only rule is level 1', () => {
  const c = categoryLevels([{ apiGroups: [''], resources: ['pods'], verbs: ['get', 'list'] }]);
  assert.equal(c.workloads.level, 1);
});
t('ruleAllows handles subresources / wildcards', () => {
  assert.ok(ruleAllows([{ apiGroups: [''], resources: ['pods/exec'], verbs: ['create'] }], '', 'pods/exec', 'create').allowed);
  assert.ok(!ruleAllows([{ apiGroups: [''], resources: ['pods'], verbs: ['get'] }], '', 'pods/exec', 'get').allowed);
});
t('model has users, groups, SAs, tokens, roles, grants', () => {
  assert.ok(model.counts.users >= 7); assert.ok(model.counts.groups >= 3); assert.ok(model.counts.sas >= 3);
  assert.equal(model.counts.tokens, 7); assert.ok(model.counts.grants > 40);
});
t('aggregated ClusterRoles are resolved', () => {
  const edit = model.roles['k8s:c-m-prod1:cr:edit'];
  assert.ok(edit.rules.length > 0); assert.equal(edit.cats.secrets.level, 3);
});
t('RoleTemplate inheritance (project-lead ⊇ project-member + secrets-view)', () => {
  const r = model.roles['rancher:rt:project-lead'];
  assert.equal(r.cats.workloads.level, 3); assert.ok(r.cats.secrets.level >= 1);
});
t('GlobalRole inheritedClusterRoles produce implicit all-cluster grants', () => {
  const g = model.grants.filter(x => x.subjectId === 'user:u-alice' && x.inherited);
  assert.equal(g.length, 1); assert.equal(g[0].scope.cluster, '*');
});
t('Rancher principal ids map onto users', () => {
  assert.ok(!model.subjects['user:okta_user://alice']);
});
t('alice is effectively admin on prod-eu, bob is not', () => {
  assert.ok(effective(model, 'user:u-alice', opts).admin);
  assert.ok(!effective(model, 'user:u-bob', opts).admin);
});
t('bob: write on workloads but only limited scope', () => {
  const e = effective(model, 'user:u-bob', { ...opts, layer: 'k8s' });
  assert.ok(e.cats.workloads.limited >= 2); assert.equal(e.cats.workloads.all, 0);
});
t('carol (auditor) reads everything (incl. secrets!) but cannot write', () => {
  const e = effective(model, 'user:u-carol', { ...opts, layer: 'k8s' });
  assert.equal(e.cats.workloads.all, 1); assert.equal(e.cats.secrets.all, 1); assert.equal(e.cats.workloads.limited, 0);
});
t('tokens inherit owner perms; scoped token ignores other clusters', () => {
  const e = effective(model, 'token:token-e1', { ...opts, cluster: 'all' });
  assert.ok(e.grants.every(g => !g.scope.cluster || g.scope.cluster === '*' || g.scope.cluster === 'c-m-prod1'));
});
t('explain: eve can exec cluster-wide', () => {
  const grants = effective(model, 'user:u-eve', opts).grants;
  assert.equal(explain(model, grants, '', 'pods/exec', 'create').state, 'all');
});
t('Rancher-managed k8s bindings are hidden in "both" layer', () => {
  const vis = visibleGrants(model, opts);
  assert.ok(vis.every(g => !g.managed));
});
t('risks surface admins, secret readers, escalators, tokens', () => {
  const r = computeRisks(model, opts);
  const titles = r.map(x => x.title).join(' | ');
  assert.match(titles, /full administrator/); assert.match(titles, /Secrets cluster-wide/); assert.match(titles, /escalation/); assert.match(titles, /non-expiring/);
  assert.match(titles, /disabled user/);
});
t('graph layout: positioned nodes, edge paths, highlight', () => {
  const g = layoutGraph(buildGraph(model, opts, { showTokens: true }));
  assert.ok(g.nodes.length > 15); assert.ok(g.nodes.every(x => Number.isFinite(x.x) && Number.isFinite(x.y)));
  assert.ok(g.edges.every(e => e.d && e.d.startsWith('M')));
  const bob = connected(g, 'user:u-bob');
  assert.ok(bob.nodes.size > 2 && bob.edges.size >= 2);
  assert.ok(new Set(g.nodes.map(x => x.col)).size === 4);
});
t('search filters the graph', () => {
  const g = buildGraph(model, opts, { search: 'carol' });
  assert.ok(g.nodes.filter(x => x.kind === 'subject').every(x => /carol/i.test(x.label)));
});
const events = attachSubjects(model, parseAuditText(demoAudit().map(e => JSON.stringify(e)).join('\n')));
t('audit: jsonl parsing, classification, subject linking', () => {
  assert.ok(events.length > 100);
  assert.ok(events.filter(e => e.rbac).length >= 4);
  assert.ok(events.filter(e => e.denied).length >= 7);
  assert.ok(events.find(e => e.userId === 'u-alice').subjectId === 'user:u-alice');
  const cr = events.find(e => /clusterroletemplatebindings/.test(e.uri) && e.write && e.code === 201);
  assert.match(cr.detail, /roleTemplateName=cluster-owner/);
});
t('audit: filters, buckets, k8s audit events, garbage lines', () => {
  assert.ok(filterEvents(events, { rbac: true }).every(e => e.rbac));
  assert.ok(filterEvents(events, {}).every(e => e.write || e.denied || e.login));
  assert.ok(filterEvents(events, { reads: true }).length > filterEvents(events, {}).length);
  const b = bucketEvents(events, 24);
  assert.equal(b.length, 24); assert.equal(b.reduce((s, x) => s + x.read + x.write + x.rbac + x.denied, 0), events.length);
  const k = parseAuditText('garbage\n{"verb":"delete","user":{"username":"u-bob"},"objectRef":{"resource":"pods","namespace":"x","name":"p"},"responseStatus":{"code":403},"stageTimestamp":"2026-10-09T10:00:00Z"}\n{broken');
  assert.equal(k.length, 1); assert.ok(k[0].denied && k[0].write && k[0].source === 'kubernetes');
  assert.equal(summarize(events).count, events.length);
});
t('audit-aware findings', () => {
  const titles = computeRisks(model, opts, events).map(x => x.title).join(' | ');
  assert.match(titles, /Repeated denied requests/); assert.match(titles, /RBAC \/ token changes/);
});
t('access: admin vs cluster owner vs project owner vs nobody', () => {
  const rc = restrictRaw(demoRaw(), 'cluster-owner'), rp = restrictRaw(demoRaw(), 'project-owner');
  assert.equal(describeAccess(true, () => true).level, 'admin');
  const co = describeAccess(false, can(rc.restricted)); assert.equal(co.level, 'delegated'); assert.equal(co.canAudit, false);
  assert.match(co.detail, /user directory.*API tokens.*global roles/);
  assert.equal(describeAccess(false, () => false).allowed, false);
  const mc = buildModel(rc);
  assert.equal(mc.counts.tokens, 0); assert.ok(!Object.keys(mc.subjects).some(k => k.startsWith('token:')));
  assert.deepEqual(Object.keys(mc.clusters).filter(c => c !== 'local'), ['c-m-prod1']);
  assert.ok(mc.grants.every(g => !g.scope.cluster || g.scope.cluster === 'c-m-prod1'));
  assert.ok(mc.counts.grants < buildModel(demoRaw()).counts.grants);
  assert.ok(!mc.roles['rancher:gr:admin']);
  const mp = buildModel(rp);
  assert.ok(mp.grants.filter(g => g.layer === 'rancher').every(g => g.scope.type === 'project' && g.scope.project === 'p-pay'));
  assert.equal(mp.k8sLoaded.length, 0);
});
console.log(`\n${ n } checks passed`);
