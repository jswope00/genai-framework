// Main code of the webhook provisioner service is at the end of this file.
import express from "express";
import crypto from "crypto";
import { fetch } from "undici";

const app = express();
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);


const SECRET = process.env.WEBHOOK_SHARED_SECRET || "dev-secret";
const LITELLM_URL = process.env.LITELLM_URL || "http://litellm:4000";
const LITELLM_ADMIN_KEY = process.env.LITELLM_ADMIN_KEY || "sk-admin";
const EXPECTED_REALM = process.env.KEYCLOAK_REALM || "librechat";

async function kcAdminToken() {
  const url = `${process.env.KEYCLOAK_BASE_URL || "http://keycloak:8080"}/realms/${encodeURIComponent(process.env.KEYCLOAK_ADMIN_REALM || "master")}/protocol/openid-connect/token`;
  const form = new URLSearchParams();
  form.set("grant_type", "client_credentials");
  form.set("client_id", process.env.KEYCLOAK_ADMIN_CLIENT_ID);
  form.set("client_secret", process.env.KEYCLOAK_ADMIN_CLIENT_SECRET);

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form
  });
  if (!r.ok) throw new Error(`kc token -> ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.access_token;
}

/**
 * Sets a single user attribute: attributes[attrName] = [value]
 * (Keycloak attributes are arrays of strings)
 */
async function kcSetUserAttribute(realm, userId, attrName, value) {
  const token = await kcAdminToken();
  const url = `${process.env.KEYCLOAK_BASE_URL || "http://keycloak:8080"}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}`;
  const body = {
    // Partial update; Keycloak merges attributes by key
    attributes: {
      [attrName]: [String(value)]
    }
  };
  const r = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`kc set attr -> ${r.status} ${await r.text()}`);
}

// --- Verify HMAC from Keycloak ---
function verified(req) {
  return true;
  const sigHeader = req.header("X-Keycloak-Signature");
  console.log("Verifying signature:", sigHeader);
  if (!sigHeader) return false;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(req.rawBody)
    .digest("hex");
  const a = Buffer.from(sigHeader, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- LiteLLM REST helpers ---
async function llmGET(path) {
  const r = await fetch(`${LITELLM_URL}${path}`, {
    headers: { Authorization: `Bearer ${LITELLM_ADMIN_KEY}` },
  });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}

async function llmPOST(path, body) {
  const r = await fetch(`${LITELLM_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LITELLM_ADMIN_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function ensureTeamFromAlias(teamAlias) {
  try {
    const info = await llmGET(`/team/info?team_alias=${encodeURIComponent(teamAlias)}`);
    return { team_id: info.team_id, team_alias: teamAlias };
  } catch {
    const created = await llmPOST(`/team/new`, { team_alias: teamAlias });
    return { team_id: created.team_id, team_alias: teamAlias };
  }
}

async function ensureTeamFromId(team_id) {
  const info = await llmGET(`/team/info?team_id=${encodeURIComponent(team_id)}`);
  return { team_id: info.team_id, team_alias: info.team_alias };
}

async function ensureTeam() {
  const teamId = process.env.DEFAULT_TEAM_ID && process.env.DEFAULT_TEAM_ID.trim();
  const teamAlias = process.env.DEFAULT_TEAM_ALIAS && process.env.DEFAULT_TEAM_ALIAS.trim();
  console.log(`[team] DEFAULT_TEAM_ID=${teamId} DEFAULT_TEAM_ALIAS=${teamAlias}`);
  if (teamId) {
    try {
      const t = await ensureTeamFromId(teamId);
      console.log(`[team] resolved by id`, t);
      return t;
    } catch (e) {
      // If an explicit ID is wrong, don't silently create a new team.
      throw new Error(`Team not found by id=${teamId}: ${e.message || e}`);
    }
  }

  if (teamAlias) {
    const t = await ensureTeamFromAlias(teamAlias);
    console.log(`[team] resolved by alias`, t);
    return t;
  }

  throw new Error(`No DEFAULT_TEAM_ID or DEFAULT_TEAM_ALIAS set`);
}

async function ensureUser(user_id, email, user_alias) {
  try {
    const info = await llmGET(`/user/info?user_id=${encodeURIComponent(user_id)}`);
    return { user_id: info.user_id || user_id };
  } catch {
    const payload = { user_id };
    
    if (email) { payload.user_email = email; payload.email = email; }


    if (user_alias) payload.user_alias = user_alias;
    const created = await llmPOST(`/user/new`, payload);
    return { user_id: created.user_id || user_id };
  }
}

async function ensureMembership(team_id, user_id) {
  await llmPOST(`/team/member_add`, {
    team_id,
    member: { role: "user", user_id },
  });
}

async function ensureUserKey(user_id, team_id) {
  try {
    const list = await llmGET(`/key/list?user_id=${encodeURIComponent(user_id)}`);
    if (Array.isArray(list?.data)) {
      const existing = list.data.find(
        (k) => k.user_id === user_id
      );
      if (existing?.key) return existing.key;
    }
  } catch {}
  // const body = { user_id };
  const body = { user_id, team_id };
  const gen = await llmPOST(`/key/generate`, body);
  return gen.key;
}

// --- Main webhook ---
app.post("/keycloak/events", (req, res) => {
  if (!verified(req)) return res.sendStatus(401);
  const ev = req.body || {};
  if (ev.realmName && ev.realmName !== EXPECTED_REALM) return res.sendStatus(204);

  res.sendStatus(204); // ack fast

  if (ev.type === "access.REGISTER") {
    const kcUserId = ev.authDetails?.userId || ev.details?.userId;
    const username = ev.details?.username || ev.authDetails?.username;
    const email = ev.details?.email;
    if (!kcUserId) return console.warn("REGISTER without userId", ev);

    (async () => {
      try {
        const { user_id } = await ensureUser(kcUserId, email, username);
        const { team_id } = await ensureTeam();
        await ensureMembership(team_id, user_id);
        const key = await ensureUserKey(user_id, team_id);
        console.log(`✅ Provisioned LiteLLM user=${user_id} team=${team_id} key=${key.slice(0, 8)}…`);
        await kcSetUserAttribute(EXPECTED_REALM, kcUserId, "litellm_api_key", key);
        console.log(`🔐 Saved litellm_api_key on KC user ${kcUserId}`);
    } catch (e) {
        console.error("❌ Provisioning failed:", e.message || e);
      }
    })();
  }
});

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.listen(process.env.PORT || 8081, () =>
  console.log("Provisioner listening on", process.env.PORT || 8081)
);
