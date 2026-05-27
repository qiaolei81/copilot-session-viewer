// API client for registered custom directories.
// Endpoints:
//   GET    /api/dirs            -> [{id,label,path,addedAt}]
//   POST   /api/dirs {path,label?} -> 201 {id,label,path,addedAt}
//   DELETE /api/dirs/:id        -> 204
// All 4xx responses throw an Error whose message is the server's `error` field.

async function _parseError(resp) {
  let msg = `Request failed: ${resp.status} ${resp.statusText}`;
  try {
    const data = await resp.json();
    if (data && data.error) msg = data.error;
  } catch (_e) { /* not json */ }
  return new Error(msg);
}

export async function listDirs() {
  const resp = await fetch('/api/dirs');
  if (!resp.ok) throw await _parseError(resp);
  return resp.json();
}

export async function registerDir(dirPath, label) {
  const body = { path: dirPath };
  if (label) body.label = label;
  const resp = await fetch('/api/dirs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw await _parseError(resp);
  return resp.json();
}

export async function removeDir(id) {
  const resp = await fetch(`/api/dirs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (resp.status === 204) return true;
  if (resp.status === 404) return false;
  if (!resp.ok) throw await _parseError(resp);
  return true;
}
