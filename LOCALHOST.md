# Runnign on localhost

## Librechat Adjustments

### error : HTTP now allowed

There’s no way to disable HTTPS via an environment variable, so we need to patch the `openidStrategy.js` file.

```
openidConfig = await client.discovery(
      new URL(process.env.OPENID_ISSUER),
      process.env.OPENID_CLIENT_ID,
      clientMetadata,
      undefined,
      {
        [client.customFetch]: customFetch,
        execute: [client.allowInsecureRequests],
      },
    );
```

### Start form custom image

Patching this file means we can no longer use the standard image, so we’ll need to create our own custom image with:

```
# Dockerfile.librechat
FROM ghcr.io/danny-avila/librechat:latest
COPY ./librechat/openidStrategy.js /app/api/strategies/openidStrategy.js
```

### Accessing Keycloak from Librechat

We need to access Keycloak on localhost. To use localhost:4000 from inside the LibreChat container, we need extra host rules in docker-compose. We also need to keep the same host port in the port mapping, because Keycloak currently sees the internal container port.

```
# changed librechat part
librechat:
    #image: ghcr.io/danny-avila/librechat:latest
    build:
      context: .
      dockerfile: Dockerfile.librechat
    container_name: librechat
    env_file:
      - .env
    ports:
      - "3000:3000"
    volumes:
      - type: bind
        source: ./librechat/librechat.yaml
        target: /app/librechat.yaml

    extra_hosts:
      - "localhost:host-gateway"


```
