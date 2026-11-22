import domain from './public/domain.js';

const maxBody = 8192;
const maxAttempts = 5;
const encoder = new TextEncoder();
const fail = domain.fail;
const hardening = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Cache-Control': 'no-store',
};

function json(data, status = 200) {
  return Response.json(data, {status, headers: hardening});
}

function token(bytes) {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
const id = () => token(12);
const secret = () => token(24);
const now = () => new Date().toISOString();

async function digest(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function sameHash(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function requireOwner(request, row) {
  const bearer = /^Bearer ([A-Za-z0-9_-]{32})$/.exec(request.headers.get('Authorization') ?? '');
  if (!bearer || !sameHash(await digest(bearer[1]), row.secret)) {
    fail('Use your private manager link.', 403);
  }
}

async function readInput(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) fail('Send JSON.', 415);
  if (Number(request.headers.get('Content-Length')) > maxBody) fail('Request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) fail('Invalid request.', 400);
  const bytes = new Uint8Array(maxBody);
  let length = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    if (length + value.byteLength > maxBody) {
      await reader.cancel().catch(() => {});
      fail('Request is too large.', 413);
    }
    bytes.set(value, length);
    length += value.byteLength;
  }
  try {
    const input = JSON.parse(new TextDecoder().decode(bytes.subarray(0, length)));
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
    return input;
  } catch {
    fail('Invalid request.', 400);
  }
}

async function get(db, boardId) {
  const row = await db.prepare('SELECT secret, data, revision FROM boards WHERE id = ?').bind(boardId).first();
  if (!row) fail('This page could not be found.', 404);
  return row;
}

async function mutate(db, boardId, apply) {
  for (let i = 0; i < maxAttempts; i++) {
    const row = await get(db, boardId);
    const {data, result} = await apply(row, JSON.parse(row.data));
    const statement = data === null
      ? db.prepare('DELETE FROM boards WHERE id = ? AND revision = ?').bind(boardId, row.revision)
      : db.prepare('UPDATE boards SET data = ?, revision = revision + 1 WHERE id = ? AND revision = ?')
        .bind(JSON.stringify(data), boardId, row.revision);
    if ((await statement.run()).meta.changes === 1) return result;
  }
  fail('The board is busy. Try again in a moment.', 409);
}

async function serve(request, env) {
  const url = new URL(request.url);
  const {pathname} = url;
  const method = request.method;
  if ((method === 'GET' || method === 'HEAD') && (pathname === '/' || pathname === '/index.html')) {
    const response = await env.ASSETS.fetch(new URL('/', url));
    if (!response.ok) return response;
    const body = (await response.text())
      .replace('name="field-kit-mode" content="preview"', 'name="field-kit-mode" content="shared"')
      .replace('name="field-kit-access" content="open"', 'name="field-kit-access" content="invite"');
    return new Response(method === 'HEAD' ? null : body, {
      headers: {...hardening, 'Content-Type': 'text/html; charset=utf-8'},
    });
  }
  if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (method === 'GET' && pathname === '/api/status') return json({shared: true});

  const origin = request.headers.get('Origin');
  if (method !== 'GET' && origin && origin !== url.origin) fail('Use the same site to submit.', 403);

  // The primary reads here keep availability and receipts consistent after writes.
  const db = env.DB.withSession('first-primary');
  if (method === 'POST' && pathname === '/api/boards') {
    if (!env.PILOT_ACCESS_CODE) fail('Workspace signup is temporarily unavailable. Existing public links still work.', 503);
    const input = await readInput(request);
    if (typeof input.accessCode !== 'string' || !sameHash(await digest(input.accessCode), await digest(env.PILOT_ACCESS_CODE))) {
      fail('Enter the pilot access code to publish a new page.', 403);
    }
    const access = secret(), t = now(), board = domain.create(input, t, id);
    await db.prepare('INSERT INTO boards (id, secret, data) VALUES (?, ?, ?)')
      .bind(board.id, await digest(access), JSON.stringify(board)).run();
    return json({board: domain.present(board, t, true), secret: access}, 201);
  }

  const match = /^\/api\/boards\/([A-Za-z0-9_-]{16})(\/act)?$/.exec(pathname);
  if (!match) fail('Page not found.', 404);
  const [, boardId, action] = match;
  if (method === 'GET' && !action) {
    const row = await get(db, boardId);
    const isOwner = request.headers.has('Authorization');
    if (isOwner) await requireOwner(request, row);
    const receipt = request.headers.get('X-Receipt');
    return json({board: domain.present(JSON.parse(row.data), now(), isOwner, receipt, url.searchParams.get('listing'))});
  }
  if (method === 'POST' && action) {
    const input = await readInput(request);
    const result = await mutate(db, boardId, (_row, board) => {
      const t = now(), receipt = domain.action(board, input, t, id, secret);
      return {data: board, result: {board: domain.present(board, t, false, receipt, input.listing), receipt}};
    });
    return json(result, 201);
  }
  if (method === 'PATCH' && !action) {
    const input = await readInput(request);
    const result = await mutate(db, boardId, async (row, board) => {
      await requireOwner(request, row);
      if (input.action === 'delete' && !input.listing) return {data: null, result: null};
      const t = now();
      domain.modify(board, input, t, id);
      return {data: board, result: domain.present(board, t, true, undefined, input.action === 'delete-listing' ? undefined : input.listing)};
    });
    return json({board: result});
  }
  fail('Method not allowed.', 405);
}

export default {
  async fetch(request, env) {
    try {
      return await serve(request, env);
    } catch (error) {
      if (!error.status) console.error('Field Kit request failed:', error.name);
      return json({error: error.status ? error.message : 'Something went wrong. Try again.'}, error.status || 500);
    }
  },
};
