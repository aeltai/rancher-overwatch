/**
 * Reads RBAC data through the logged-in user's Rancher session.
 * Nothing leaves the browser: the extension only issues GETs against the
 * Rancher API (/v1 and /k8s/clusters/<id>/v1) with the user's own credentials,
 * so every list is naturally limited by what that user is allowed to see.
 */
import { TYPES } from './access.js';

const EX = 'exclude=metadata.managedFields';

const errText = e => {
  const status = e?._status || e?.status || e?.response?.status;
  const msg = e?.message || e?.detail || e?.response?.data?.message || (typeof e === 'string' ? e : '');

  return `${ status ? `HTTP ${ status } ` : '' }${ msg || 'request failed' }`.trim();
};

async function list(store, url) {
  const res = await store.dispatch('management/request', { url, method: 'GET', headers: { accept: 'application/json' } });

  return res?.data ?? res?.items ?? (Array.isArray(res) ? res : []);
}

async function settled(store, jobs, errors, prefix) {
  const names = Object.keys(jobs);
  const results = await Promise.allSettled(names.map(n => list(store, jobs[n])));
  const out = {};

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      out[names[i]] = Array.isArray(r.value) ? r.value : [];
    } else {
      errors[`${ prefix }:${ names[i] }`] = errText(r.reason);
    }
  });

  return out;
}

export function listable(store) {
  const canList = store.getters['management/canList'];

  return key => !!canList?.(TYPES[key]);
}

export async function loadRancher(store) {
  const errors = {};
  const allowed = listable(store);
  const base = '/v1/management.cattle.io';
  const wanted = {
    users:              `${ base }.users?${ EX }`,
    globalRoles:        `${ base }.globalroles?${ EX }`,
    globalRoleBindings: `${ base }.globalrolebindings?${ EX }`,
    roleTemplates:      `${ base }.roletemplates?${ EX }`,
    crtbs:              `${ base }.clusterroletemplatebindings?${ EX }`,
    prtbs:              `${ base }.projectroletemplatebindings?${ EX }`,
    clusters:           `${ base }.clusters?${ EX }`,
    projects:           `${ base }.projects?${ EX }`,
    tokens:             `${ base }.tokens?${ EX }`
  };
  // only ask for what this account may list – everything else is "restricted", not an error
  const restricted = Object.keys(wanted).filter(k => !allowed(k));

  restricted.forEach(k => delete wanted[k]);
  const data = await settled(store, wanted, errors, 'rancher');

  if (!data.tokens && !restricted.includes('tokens')) {
    // Rancher 2.12+ exposes tokens through the extension API as well
    try {
      data.tokens = await list(store, '/ext.cattle.io/v1/tokens');
      delete errors['rancher:tokens'];
    } catch (e) { /* keep the first error */ }
  }

  return { rancher: data, errors, restricted };
}

export async function loadCluster(store, clusterId) {
  const errors = {};
  const b = `/k8s/clusters/${ encodeURIComponent(clusterId) }/v1`;
  const data = await settled(store, {
    clusterRoles:        `${ b }/rbac.authorization.k8s.io.clusterroles?${ EX }`,
    clusterRoleBindings: `${ b }/rbac.authorization.k8s.io.clusterrolebindings?${ EX }`,
    roles:               `${ b }/rbac.authorization.k8s.io.roles?${ EX }`,
    roleBindings:        `${ b }/rbac.authorization.k8s.io.rolebindings?${ EX }`,
    namespaces:          `${ b }/namespaces?${ EX }`
  }, errors, `k8s:${ clusterId }`);

  const rbacOk = ['clusterRoles', 'clusterRoleBindings', 'roles', 'roleBindings'].some(k => data[k]);

  if (!rbacOk) {
    data.error = Object.values(errors)[0] || 'cluster unreachable';
  }

  return { data, errors };
}

/**
 * Rancher API audit events. Rancher has no query API for them: with the Helm chart
 * (auditLog.enabled=true, destination=sidecar) every Rancher pod streams them to the
 * `rancher-audit-log` container, which we read through the Kubernetes pod-log API.
 */
export async function loadAuditText(store, tailLines = 5000) {
  const base = '/k8s/clusters/local/api/v1/namespaces/cattle-system/pods';
  const pods = await list(store, `${ base }?labelSelector=app%3Drancher`);
  const names = (pods || []).map(p => p?.metadata?.name).filter(Boolean).slice(0, 3);

  if (!names.length) {
    throw new Error('No Rancher pods found in cattle-system (single-node Docker installs write the audit log to a file instead; use “Import log file”).');
  }
  const chunks = await Promise.allSettled(names.map(async(n) => {
    const res = await store.dispatch('management/request', {
      url:     `${ base }/${ encodeURIComponent(n) }/log?container=rancher-audit-log&tailLines=${ tailLines }`,
      method:  'GET',
      headers: { accept: 'text/plain' }
    });

    return typeof res === 'string' ? res : (typeof res?.data === 'string' ? res.data : '');
  }));
  const text = chunks.filter(c => c.status === 'fulfilled').map(c => c.value).join('\n');

  if (!text.trim()) {
    const err = chunks.find(c => c.status === 'rejected');

    throw new Error(err ? errText(err.reason) : 'The rancher-audit-log container returned no events. Enable auditLog (level ≥ 1, destination sidecar) on the Rancher chart.');
  }

  return text;
}
