// VolleyStats API - Cloudflare Pages Function, catch-all for /api/*.
//
// Every route checks the X-App-Password header against the APP_PASSWORD
// secret first. The password lives in the Worker environment (set via
// `wrangler secret put APP_PASSWORD`) so it's never in the frontend bundle.
//
//   GET    /api/users               - all users
//   POST   /api/users               - create a user
//   GET    /api/sessions?userId=X   - all of a user's sessions, sets attached
//   GET    /api/sessions/:id        - one session with its sets
//   POST   /api/sessions            - create a session + its sets
//   PUT    /api/sessions/:id        - update session, replace sets
//   DELETE /api/sessions/:id        - delete a session (sets cascade)

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function ok(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function err(msg, status) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: JSON_HEADERS });
}

function checkAuth(request, env) {
  return request.headers.get('X-App-Password') === env.APP_PASSWORD;
}

async function handleGetUsers(env) {
  const { results } = await env.DB.prepare('SELECT * FROM users ORDER BY name').all();
  return ok(results);
}

async function handleCreateUser(request, env) {
  const { name } = await request.json();
  if (!name?.trim()) return err('name required', 400);

  // Title-case the name as we write it, same as wordle-wall does.
  const clean = name.trim().replace(/\b\w/g, c => c.toUpperCase());

  try {
    const result = await env.DB.prepare('INSERT INTO users (name) VALUES (?) RETURNING *')
      .bind(clean)
      .first();
    return ok(result, 201);
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return err('user already exists', 409);
    throw e;
  }
}

// Stitch a session's sets array onto the session object before returning it.
function attachSets(session, allSets) {
  return {
    ...session,
    sets: allSets
      .filter(s => s.session_id === session.id)
      .sort((a, b) => a.set_number - b.set_number),
  };
}

async function handleGetSessions(request, env) {
  const url = new URL(request.url);
  const userId = parseInt(url.searchParams.get('userId'));
  if (!userId) return err('userId required', 400);

  const { results: sessions } = await env.DB.prepare(
    'SELECT * FROM sessions WHERE user_id = ? ORDER BY event_date DESC, created_at DESC'
  ).bind(userId).all();

  if (!sessions.length) return ok([]);

  // One IN(...) query for all the sets instead of N round-trips, then stitch
  // them onto their sessions in memory.
  const ids = sessions.map(s => s.id);
  const placeholders = ids.map(() => '?').join(',');
  const { results: sets } = await env.DB.prepare(
    `SELECT * FROM sets WHERE session_id IN (${placeholders})`
  ).bind(...ids).all();

  return ok(sessions.map(s => attachSets(s, sets)));
}

async function handleGetSession(id, env) {
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first();
  if (!session) return err('not found', 404);

  const { results: sets } = await env.DB.prepare(
    'SELECT * FROM sets WHERE session_id = ? ORDER BY set_number'
  ).bind(id).all();

  return ok({ ...session, sets });
}

async function handleCreateSession(request, env) {
  const { userId, eventName, eventDate, notes, mode, sets } = await request.json();
  if (!userId || !eventName || !eventDate || !mode) return err('missing required fields', 400);

  const createdAt = new Date().toISOString();

  // D1's batch() runs statements atomically - if one fails, none commit.
  const insertSession = env.DB.prepare(
    'INSERT INTO sessions (user_id, event_name, event_date, notes, mode, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
  ).bind(userId, eventName.trim(), eventDate, notes || '', mode, createdAt);

  const [sessionResult] = await env.DB.batch([insertSession]);
  const session = sessionResult.results[0];

  if (sets?.length) {
    const setStmts = sets.map((s, i) =>
      env.DB.prepare(
        `INSERT INTO sets (session_id, set_number, kills, errors,
          continued_plus, continued_minus,
          block_kills, block_plus, block_minus, block_errors,
          dig_plus, digs, dig_errors,
          pass_4, pass_3, pass_2, pass_1, pass_0)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        session.id, i + 1,
        s.kills || 0, s.errors || 0,
        s.continuedPlus || 0, s.continuedMinus || 0,
        s.blockKills || 0, s.blockPlus || 0, s.blockMinus || 0, s.blockErrors || 0,
        s.digPlus || 0, s.digs || 0, s.digErrors || 0,
        s.pass4 || 0, s.pass3 || 0, s.pass2 || 0, s.pass1 || 0, s.pass0 || 0
      )
    );
    await env.DB.batch(setStmts);
  }

  const { results: insertedSets } = await env.DB.prepare(
    'SELECT * FROM sets WHERE session_id = ? ORDER BY set_number'
  ).bind(session.id).all();

  return ok({ ...session, sets: insertedSets }, 201);
}

async function handleUpdateSession(id, request, env) {
  const { eventName, eventDate, notes, mode, sets } = await request.json();

  const existing = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first();
  if (!existing) return err('not found', 404);

  await env.DB.prepare(
    'UPDATE sessions SET event_name=?, event_date=?, notes=?, mode=? WHERE id=?'
  ).bind(
    eventName?.trim() ?? existing.event_name,
    eventDate ?? existing.event_date,
    notes ?? existing.notes,
    mode ?? existing.mode,
    id
  ).run();

  // Replace-the-lot approach for sets - easier than diffing which ones
  // changed, and we're never dealing with more than a handful per session.
  if (sets) {
    await env.DB.prepare('DELETE FROM sets WHERE session_id = ?').bind(id).run();
    if (sets.length) {
      const setStmts = sets.map((s, i) =>
        env.DB.prepare(
          `INSERT INTO sets (session_id, set_number, kills, errors,
            continued_plus, continued_minus,
            block_kills, block_plus, block_minus, block_errors,
            dig_plus, digs, dig_errors,
            pass_4, pass_3, pass_2, pass_1, pass_0)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          id, i + 1,
          s.kills || 0, s.errors || 0,
          s.continuedPlus || 0, s.continuedMinus || 0,
          s.blockKills || 0, s.blockPlus || 0, s.blockMinus || 0, s.blockErrors || 0,
          s.digPlus || 0, s.digs || 0, s.digErrors || 0,
          s.pass4 || 0, s.pass3 || 0, s.pass2 || 0, s.pass1 || 0, s.pass0 || 0
        )
      );
      await env.DB.batch(setStmts);
    }
  }

  const updated = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first();
  const { results: updatedSets } = await env.DB.prepare(
    'SELECT * FROM sets WHERE session_id = ? ORDER BY set_number'
  ).bind(id).all();

  return ok({ ...updated, sets: updatedSets });
}

async function handleDeleteSession(id, env) {
  const existing = await env.DB.prepare('SELECT id FROM sessions WHERE id = ?').bind(id).first();
  if (!existing) return err('not found', 404);

  // ON DELETE CASCADE on the FK clears the sets automatically.
  await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
  return new Response(null, { status: 204 });
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (!checkAuth(request, env)) return err('Unauthorized', 401);

  const route = params.route || [];
  const method = request.method;

  try {
    if (route[0] === 'users' && !route[1]) {
      if (method === 'GET')  return handleGetUsers(env);
      if (method === 'POST') return handleCreateUser(request, env);
    }

    if (route[0] === 'sessions') {
      if (!route[1]) {
        if (method === 'GET')  return handleGetSessions(request, env);
        if (method === 'POST') return handleCreateSession(request, env);
      } else {
        const id = parseInt(route[1]);
        if (isNaN(id)) return err('invalid id', 400);
        if (method === 'GET')    return handleGetSession(id, env);
        if (method === 'PUT')    return handleUpdateSession(id, request, env);
        if (method === 'DELETE') return handleDeleteSession(id, env);
      }
    }

    return err('not found', 404);
  } catch (e) {
    console.error(e);
    return err('internal error', 500);
  }
}
