# Deploy

## Pre-Requisites
1. Postgresql with a master user and password
2. Docker and Docker-compose installed
3. Nginx installed and enabled
3. Domain with several subdomains
    # A Record
    my-site.com
    # CNAME Records
    kc.my-site.com
    lc.my-site.com
    litellm.my-site.com
4. SSL Certificates across root and subdomains
5. Open the following ports
  3000
  4000
  5002


## Copy the env.example file to .env and set your credentials

```
cp env.example .env
vi .env
```
Set the following fields, make sure to replace [youruser] and [yourpassword] with the values from the previous step. 
```
# POSTGRESQL
POSTGRES_USER=[youruser]
POSTGRES_PASSWORD=[yourpassword]
```

## Configure Docker Permissions

```
# Add your user to docker group (to run docker without sudo)
sudo usermod -aG docker $USER

# Apply the new group membership (or logout/login)
newgrp docker

# Verify you can run docker without sudo
docker ps
```

## Databases

```
docker compose up -d --force-recreate pgdb mongodb
```

Run the database installation script
```
source .env
sudo -u postgres env \
  POSTGRES_USER="$POSTGRES_USER" \
  KC_DB_USER="$KC_DB_USER" \
  KC_DB_PASSWORD="$KC_DB_PASSWORD" \
  LITELLM_DB_USER="$LITELLM_DB_USER" \
  LITELLM_DB_PASSWORD="$LITELLM_DB_PASSWORD" \
  bash ./initdb/01-create-databases.sh
```

## Keycloak

* start container
```
docker compose up -d --force-recreate keycloak
```

* Login with admin credentials
* Goto the 'librechat' realm via `Manage Realms`
* Goto `Clients -> librechat-client -> Credentials` and recreate the `Client Secret`
* Insert this `Client Secret` into `.env` for `OPENID_CLIENT_SECRET`
* Goto `Clients -> provisioner-admin -> Credentials` and recreate the `Client Secret`
* Insert this `Client Secret` into `.env` for `PROVISIONER_KEYCLOAK_ADMIN_CLIENT_SECRET`

```
# LIBRECHAT
OPENID_ISSUER=https://kc.[my-site.com]/realms/librechat
OPENID_CLIENT_ID=librechat-client
OPENID_CLIENT_SECRET=**************************
```

* Create a user inside `librechat` realm with password

## Litellm

* start container

```
docker compose up -d --force-recreate litellm
```

* Goto LiteLLM UI and login with `admin / master-key-from-env`
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

* Create new team
* Set the ID of that team as `PROVISIONER_DEFAULT_TEAM_ID` inside `.env`

* start container

## LibreChat

```
docker compose up -d --force-recreate librechat
```

## Provisioner (node.js)

```
docker compose build provisioner
```

```
docker compose up -d --force-recreate provisioner
```

* Login with OpenID via KeyCloak with your previous created user :D


