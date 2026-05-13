// The only file in the app that touches the network. Everything goes through
// the two helpers up top (req + headers). If I ever moved off Cloudflare,
// this is the only file that would change - app.js just calls getUsers(),
// getSessions(), etc. and doesn't care how the data gets there.
//
// Password sits in sessionStorage after the gate accepts it. sessionStorage
// (not local) so it clears when the tab closes - no persistent login needed.

const BASE = '/api';

// Sticks the password header on every request.
function headers() {
  return {
    'Content-Type': 'application/json',
    'X-App-Password': sessionStorage.getItem('vs_pw') || '',
  };
}

// Tiny fetch wrapper. Throws 'UNAUTHORIZED' on 401 so app.js can bounce
// you back to the gate.
async function req(method, path, body) {
  const opts = { method, headers: headers() };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(BASE + path, opts);

  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (res.status === 204) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  return res.json();
}

export const getUsers    = ()     => req('GET',  '/users');
export const createUser  = name   => req('POST', '/users', { name });

export const getSessions   = userId => req('GET',    `/sessions?userId=${userId}`);
export const getSession    = id     => req('GET',    `/sessions/${id}`);
export const createSession = data   => req('POST',   '/sessions', data);
export const updateSession = (id, data) => req('PUT', `/sessions/${id}`, data);
export const deleteSession = id     => req('DELETE', `/sessions/${id}`);
