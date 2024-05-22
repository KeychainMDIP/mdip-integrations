# Custodial MDIP Keymaster Configuration Guide

This document provides guidelines and sample scripts to enable hosting of multiple custodial MDIP Keymaster processes connected to a common MDIP Gatekeeper server. This approach uses a traditional OAuth2 proxy for user authentication. MDIP authentication is also possible and demo code is available in our repository.

## Deployment Summary

### Pre-requisites: 
- MDIP Gatekeeper operating and available
- MDIP Keymaster configured to operate using docker compose
- nginx reverse-proxy operational
- systemd server process management

### Components:

```mermaid
graph TD;
web-user<-->nginx:oauth2-proxy;
nginx:oauth2-proxy-->google-oauth-api;
google-oauth2-api-->nginx:auth-token;
nginx:auth-token<-->keymaster:4240;
nginx:auth-token<-->keymaster:4241;
nginx:auth-token<-->keymaster:4242;
nginx:auth-token<-->keymaster:...;
keymaster:4240<-->gatekeeper:4224;
keymaster:4241<-->gatekeeper:4224;
keymaster:4242<-->gatekeeper:4224;
keymaster:...<-->gatekeeper:4224;
gatekeeper:4224<-->MDIP Registries;
```

### Links: 
- MDIP Reference Implementation: (https://keychain.org)
- OAuth2 Proxy: (https://oauth2-proxy.github.io/oauth2-proxy/)

## Configuration Steps

The steps below assume `$kc_home` to be the directory from which the MDIP Keymaster docker component is configured and operational. If you do not have an operational Keymaster (default port 4226), the custodial Keymasters will only replicate the same issues. 

### Step 1: Directories Setup
In the setup below, the MDIP 'kc' repository is cloned and configured in the host uid home located in /home/mdiphost.
1. Create `/home/mdiphost/custodials` directory
2. Create `/home/mdiphost/custodials/account1` directory

### Step2: Docker Compose Setup
Create `/home/mdiphost/custodials/account1/docker-compose.yml` file with the following content: 

```
version: "3"
services:

  keymaster-account1:
    build:
      context: ../..
      dockerfile: Dockerfile.keymaster
    image: keychainmdip/keymaster
    environment:
      - KC_GATEKEEPER_URL=http://172.17.0.1
      - KC_GATEKEEPER_PORT=4224
      - KC_KEYMASTER_PORT=${KC_KEYMASTER_PORT}
    volumes:
      - ./data:/app/data
    ports:
      - ${KC_KEYMASTER_PORT}:${KC_KEYMASTER_PORT}
```

### Step 3: Configure nginx proxy and router
This is a sample nginx configuration file. This configuration routes authenticated OAuth2 users to their assigned MDIP Keymaster ports.

```
# MDIP host configuration file for nginx

#########################################################
#
# Authenticated Users to Keymaster Port Mapping
#
map $email $port {
    "account1@yourdomain.dev" 4240;
    "account2@yourdomain.dev" 4241;
    # unpriviledged catch-all port, this could be more elegant
    default 4224; 
}

#########################################################
#
# Keymaster server protected by OAuth2 proxy gateway
#
server {
    server_name keymaster.yourdomain.dev
    listen 80; # need to run 'certbot' to generate 443 ssl certificates and listen block

    location /oauth2 {
        proxy_pass http://127.0.0.1:4180; #this is the oauth_proxy listening port
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Scheme $scheme;
        proxy_set_header X-Auth-Request-Redirect $request_uri;
    }
    location / {
	# authenticate user
	auth_request /oauth2/auth;
        error_page 401 = /oauth2/sign_in;

	# pass information via X-User and X-Email headers to backend
        # requires running with --set-xauthrequest flag
	auth_request_set $user $upstream_http_x_auth_request_user;
        auth_request_set $email $upstream_http_x_auth_request_email;

	# pass standard set of X headers
	proxy_set_header Host $host;
	proxy_set_header X-User $user;
        proxy_set_header X-Email $email;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
	proxy_set_header X-Forwarded-Proto $scheme;
	proxy_connect_timeout 3s;
        proxy_read_timeout 10s;

        # This allows WebSocket connections
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

	# if you enabled --cookie-refresh, this is needed for it to work with auth_request
	auth_request_set $auth_cookie $upstream_http_set_cookie;
	add_header Set-Cookie $auth_cookie;

	# route authenticated user to their assigned Keymaster
        proxy_pass http://127.0.0.1:$port;
    }
}

#########################################################
#
# Local Proxy: redirects to user-specific Keymaster port
#
# oauth providers expect a single call-back URL.
# this router will be used as the "upstream" URL in the oauth-proxy configuration
# this router is internal and only used by the oauth-proxy
#
server {
   listen 127.0.0.1:4181;
   location / {
        auth_request /oauth2/auth;
        error_page 401 = /oauth2/sign_in;
        # pass information via X-User and X-Email headers to backend
        # requires running with --set-xauthrequest flag
        auth_request_set $user $upstream_http_x_auth_request_user;
        auth_request_set $email $upstream_http_x_auth_request_email;

        proxy_set_header Host $host;
        proxy_set_header X-User $user;
        proxy_set_header X-Email $email;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 3s;
        proxy_read_timeout 10s;

	# This allows WebSocket connections
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # if you enabled --cookie-refresh, this is needed for it to work with auth_request
        auth_request_set $auth_cookie $upstream_http_set_cookie;

	add_header Set-Cookie $auth_cookie;
	proxy_pass http://127.0.0.1:$port;
   }
}

```

### Step 4: Configure the oauth proxy server
source:  (https://github.com/oauth2-proxy/oauth2-proxy)

Any oauth proxy could be used in this step. The oauth-proxy server must run on the port defined in the nginx file (4080).

```
upstreams = [ "http://127.0.0.1:4181/" ]

# Email Domains to allow authentication for (this authorizes any email on this domain). To authorize any email addresses use "*"

email_domains = [ "yourdomain.dev" ]

# The OAuth Client ID, Secret
client_secret = "***************"
client_id = "***************"

#Cookie Settings
cookie_secret = "*******************"
# cookie_domain = ""
# cookie_expire = "168h" #<<< set this for automated sign-out
# cookie_refresh = ""
# cookie_secure = true
# cookie_httponly = true
reverse_proxy = true
set_xauthrequest = true
pass_basic_auth = true
pass_user_headers = true
set_authorization_header = true
```

### Step 5: Configure systemd custodial keymaster startup
This is a sample systemd configuration file. This configuration file is duplicated for each custodial Keymaster account. This file must set the `KC_KEYMASTER_PORT` environment variable to the same value as the user-to-port mapping at the top of the nginx configuration file (above). 
```
[Unit]
Description=Keymaster Custodial Daemon Service
After=mdip.service

[Service]
WorkingDirectory=/home/mdiphost/kc/custodials/account1
Environment=KC_KEYMASTER_PORT=4240
Type=simple
ExecStart=/usr/bin/docker compose up
User=mdiphost

[Install]
WantedBy=multi-user.target
```
