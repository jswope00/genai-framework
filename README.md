# Deploy

## Databases

```
docker-compose up -d --force-recreate p2-pgdb p2-mongodb
```

## Keycloak

* start container
```
docker-compose up -d --force-recreate p2-keycloak
```

* Login with admin credentials, change to realm `librechat` and create any user.
* Goto `Clinets -> librechat-client -> Creadentials` and recreate the `Client Secret`
* Insert this `Client Secret` into `.env` for `OPENID_CLIENT_SECRET`

```
# LIBRECHAT
OPENID_ISSUER=https://p2-kc.nintec.de/realms/librechat
OPENID_CLIENT_ID=librechat-client
OPENID_CLIENT_SECRET=**************************
```

* Create a user inside `libreachat` realm with password

## Litellm

* start container

```
docker-compose up -d --force-recreate p2-litellm
```

* Goto LiteLLM UI nad login with `admin / master-key-from-env`
* Generate new Virtual Key
* Set this key as `apiKey` inside `librechat/librechat.yaml`

```
endpoints:
  custom:
    - name: "Lite LLM"
      # LibreChat requires an apiKey field. If LiteLLM doesn’t enforce one,
      # set "user_provided" or any placeholder.
      apiKey: "*****************"

```

* start container

## Librechat

```
docker-compose up -d --force-recreate p2-librechat
```

* Login with OpenID via KeyCloak with your previous created user :D


