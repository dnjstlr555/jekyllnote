// Minimal API client (global `API`).
window.API = (() => {
  async function j(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Server sends only status + an `error` code; localize on the client.
      const err = new Error(window.i18n.errText(data.error, res.status));
      err.code = data.error; err.data = data; err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    getConfig: () => j('GET', '/api/config'),
    setTarget: (targetRoot) => j('POST', '/api/config/target', { targetRoot }),
    listFiles: () => j('GET', '/api/files'),
    readFile: (path) => j('GET', `/api/files/read?path=${encodeURIComponent(path)}`),
    taxonomy: () => j('GET', '/api/meta/taxonomy'),

    listDrafts: () => j('GET', '/api/drafts'),
    createDraft: (d) => j('POST', '/api/drafts', d),
    getDraft: (id) => j('GET', `/api/drafts/${id}`),
    updateDraft: (id, patch) => j('PUT', `/api/drafts/${id}`, patch),
    deleteDraft: (id) => j('DELETE', `/api/drafts/${id}`),

    fetchImage: (draftId, url) => j('POST', `/api/drafts/${draftId}/images/fetch`, { url }),
    async uploadImage(draftId, file, kind = 'upload') {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch(`/api/drafts/${draftId}/images/upload`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { const e = new Error(window.i18n.errText(data.error || 'upload-failed', res.status)); e.code = data.error; throw e; }
      return data;
    },

    submitPlan: (draftId) => j('POST', '/api/submit/plan', { draftId }),
    submitCommit: (draftId, confirmOverwrite) => j('POST', '/api/submit/commit', { draftId, confirmOverwrite }),

    // Import an existing markdown file into a new draft (server converts md->blocks).
    importFile: (path) => j('POST', '/api/import', { path }),
  };
})();
