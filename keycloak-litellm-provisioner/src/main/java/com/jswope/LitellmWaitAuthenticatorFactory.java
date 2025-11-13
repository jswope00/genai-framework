package com.jswope;

import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.authentication.ConfigurableAuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel.Requirement;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

import java.util.Collections;
import java.util.List;

public class LitellmWaitAuthenticatorFactory implements AuthenticatorFactory, ConfigurableAuthenticatorFactory {
    public static final String PROVIDER_ID = "litellm-wait-authenticator";
    private static final LitellmWaitAuthenticator SINGLETON = new LitellmWaitAuthenticator();

    private static final Requirement[] REQUIREMENT_CHOICES = new Requirement[] {
            Requirement.REQUIRED,
            Requirement.DISABLED
    };

    @Override public String getId() { return PROVIDER_ID; }
    @Override public String getDisplayType() { return "Wait for LiteLLM Key"; }
    @Override public String getHelpText() { return "Blocks login until the user's litellm_api_key attribute exists."; }

    // ---- ConfigurableAuthenticatorFactory bits ----
    @Override public boolean isConfigurable() { return false; }
    @Override public List<ProviderConfigProperty> getConfigProperties() { return Collections.emptyList(); }
    @Override public boolean isUserSetupAllowed() { return false; }
    @Override public Requirement[] getRequirementChoices() { return REQUIREMENT_CHOICES; }
    @Override public String getReferenceCategory() { return null; }

    // ---- Factory lifecycle ----
    @Override public Authenticator create(KeycloakSession session) { return SINGLETON; }
    @Override public void init(Config.Scope config) {}
    @Override public void postInit(KeycloakSessionFactory factory) {}
    @Override public void close() {}
}
