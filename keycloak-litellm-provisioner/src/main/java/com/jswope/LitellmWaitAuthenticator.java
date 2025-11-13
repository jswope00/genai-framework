package com.jswope;

import org.jboss.logging.Logger;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.Authenticator;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class LitellmWaitAuthenticator implements Authenticator {

    private static final Logger log = Logger.getLogger(LitellmWaitAuthenticator.class);
    private static final String ATTR = "litellm_api_key";

    private static final String LITELLM_URL = System.getenv().getOrDefault("LITELLM_URL", "http://litellm:4000");
    private static final String LITELLM_ADMIN_KEY = System.getenv().getOrDefault("LITELLM_ADMIN_KEY", "sk-admin");
    private static final String KEYCLOAK_BASE_URL = System.getenv().getOrDefault("KEYCLOAK_BASE_URL", "http://keycloak:8080");
    private static final String KEYCLOAK_ADMIN_REALM = System.getenv().getOrDefault("KEYCLOAK_ADMIN_REALM", "master");
    private static final String KEYCLOAK_ADMIN_CLIENT_ID = System.getenv().get("KEYCLOAK_ADMIN_CLIENT_ID");
    private static final String KEYCLOAK_ADMIN_CLIENT_SECRET = System.getenv().get("KEYCLOAK_ADMIN_CLIENT_SECRET");
    private static final String DEFAULT_TEAM_ID = System.getenv().get("DEFAULT_TEAM_ID");
    private static final String DEFAULT_TEAM_ALIAS = System.getenv().get("DEFAULT_TEAM_ALIAS");

    @Override
    public void authenticate(AuthenticationFlowContext context) {
        UserModel user = context.getUser();
        if (user == null) { context.attempted(); return; }

        String existing = user.getFirstAttribute(ATTR);
        if (existing != null && !existing.isBlank()) {
            log.infof("[LitellmWait] User already has key: %s", existing.substring(0, Math.min(existing.length(), 6)));
            context.success();
            return;
        }

        try {
            log.infof("[LitellmWait] Provisioning LiteLLM key for user=%s", user.getUsername());
            String key = provisionUserAndKey(user);
            if (key != null && !key.isBlank()) {
                setUserAttribute(user, ATTR, key);
                log.infof("🔐 Saved litellm_api_key on KC user %s", user.getUsername());
                context.success();
            } else {
                log.warnf("[LitellmWait] Provisioner returned null key for user=%s", user.getUsername());
                context.failure(org.keycloak.authentication.AuthenticationFlowError.INTERNAL_ERROR);
            }
        } catch (Exception e) {
            log.errorf(e, "[LitellmWait] Provisioning failed for user=%s", user.getUsername());
            context.failure(org.keycloak.authentication.AuthenticationFlowError.INTERNAL_ERROR);
        }
    }

    private String provisionUserAndKey(UserModel user) throws Exception {
        // In the Node version, ensureUser → ensureTeam → ensureMembership → ensureUserKey.
        // We'll simplify: assume default team already exists and just ensure user+key.
        String userId = user.getId();
        String email = user.getEmail();
        String username = user.getUsername();

        // 1) Ensure LiteLLM user
        httpPOST(LITELLM_URL + "/user/new",
                "{\"user_id\":\"" + escape(userId) + "\",\"user_email\":\"" + escape(email) + "\",\"user_alias\":\"" + escape(username) + "\"}");

        // 2) Ensure membership in team (if configured)
        String teamId = DEFAULT_TEAM_ID;
        if (teamId != null && !teamId.isBlank()) {
            httpPOST(LITELLM_URL + "/team/member_add",
                    "{\"team_id\":\"" + escape(teamId) + "\",\"member\":{\"role\":\"user\",\"user_id\":\"" + escape(userId) + "\"}}");
        }

        // 3) Generate key
        String body = "{\"user_id\":\"" + escape(userId) + "\"" +
                (teamId != null ? ",\"team_id\":\"" + escape(teamId) + "\"" : "") +
                "}";
        String json = httpPOST(LITELLM_URL + "/key/generate", body);
        // extract key from JSON (very naive)
        int idx = json.indexOf("\"key\"");
        if (idx == -1) return null;
        int start = json.indexOf('"', idx + 5) + 1;
        int end = json.indexOf('"', start);
        return json.substring(start, end);
    }

    private void setUserAttribute(UserModel user, String name, String value) {
        user.setSingleAttribute(name, value);
    }

    private static String escape(String s) {
        return s == null ? "" : s.replace("\"", "\\\"");
    }

    private String httpPOST(String url, String body) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(4000);
        conn.setReadTimeout(6000);
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Authorization", "Bearer " + LITELLM_ADMIN_KEY);
        conn.setDoOutput(true);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(body.getBytes(StandardCharsets.UTF_8));
        }
        int code = conn.getResponseCode();
        if (code / 100 != 2) {
            throw new RuntimeException("POST " + url + " -> HTTP " + code);
        }
        return new String(conn.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
    }

    @Override public void action(AuthenticationFlowContext context) { authenticate(context); }
    @Override public boolean requiresUser() { return true; }
    @Override public boolean configuredFor(KeycloakSession s, RealmModel r, UserModel u) { return true; }
    @Override public void setRequiredActions(KeycloakSession s, RealmModel r, UserModel u) {}
    @Override public void close() {}
}
