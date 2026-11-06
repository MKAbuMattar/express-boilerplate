# Local setup

Every local server answers at `https://<name>.express-boilerplate.len` on port 443 and nowhere else. This page gets your machine to that point once; after that `pnpm dev` and `docker compose up` just work.

In a generated project the domain is `<project-name>.len` instead (for example `https://api.my-api.len`). Replace it in every command below.

## 1. Tools

| Tool                | Why                                                  |
| ------------------- | ---------------------------------------------------- |
| Node 26+, pnpm 12   | the workspace                                        |
| openssl             | `pnpm certs` signs the local certificates with it    |
| Docker (optional)   | `docker compose`, and the container tests            |
| kind, kubectl, helm | only for the [Kubernetes](kubernetes.md) walkthrough |

```sh
pnpm install
pnpm eb doctor      # checks Node, pnpm, certificates, hosts entries, port 443, Docker
```

## 2. Certificates

```sh
pnpm certs          # writes apps/api/certs/
```

That creates a local certificate authority and the certificates it signs:

| File                          | Used by                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `ca.crt`, `ca.key`            | the local CA. You trust `ca.crt`. `ca.key` never leaves your machine                               |
| `server.crt`                  | every HTTPS server: `localhost`, `express-boilerplate.len`, `*.express-boilerplate.len`, 127.0.0.1 |
| `client.crt`                  | mTLS clients, including the public gateway when it calls the app                                   |
| `edge-proxy.crt`              | a proxy the app trusts to forward client certificates (`MTLS_TRUSTED_PROXY_CN`)                    |
| `etcd.crt`, `etcd-client.crt` | etcd and the APISIX control and data planes (compose)                                              |

Safety and lifetime:

- **The CA is name-constrained.** It can only vouch for the local domain, `localhost`, `etcd` and loopback addresses. Trusting it in your browser does not let anyone who copies `ca.key` impersonate any other site.
- **It is ECDSA.** The CA uses P-384 and is valid for 10 years. The leaf certificates use P-256 and are valid for 397 days, the most browsers accept.
- **Reruns are safe.** `pnpm certs` keeps what exists, so a CA you already trust stays trusted. When the certificate format changes, it replaces the whole set and tells you to trust the new CA. `pnpm certs --force` regenerates everything.

Docker compose generates its own set in `./certs` with the same script (the `certs` service). Trust that `ca.crt` too if you use compose.

## 3. Host names

Hosts files have no wildcards, so each name is listed. The public gateway is on `127.0.0.1` and the private one on `127.0.0.2`. `pnpm certs` prints the lines for whatever does not resolve yet:

```sh
printf '127.0.0.1 api.express-boilerplate.len keycloak.express-boilerplate.len
127.0.0.2 dashboard.express-boilerplate.len dashboard-public.express-boilerplate.len vault.express-boilerplate.len grafana.express-boilerplate.len prometheus.express-boilerplate.len mailpit.express-boilerplate.len
' | sudo tee -a /etc/hosts
```

- **macOS:** `127.0.0.2` is not up by default. Run `sudo ifconfig lo0 alias 127.0.0.2` once per boot.
- **Linux:** the whole `127.0.0.0/8` range is loopback already.
- **A local DNS** covers every name at once. For example dnsmasq with `address=/.express-boilerplate.len/127.0.0.1`. Point the private names at `127.0.0.2` separately.
- **No hosts entry at all:** `https://localhost` reaches the API too.

Check it:

```sh
getent hosts api.express-boilerplate.len     # 127.0.0.1
```

## 4. Trust the CA

Do this once per CA. When `pnpm certs` says it replaced the CA, do it again and remove the old one.

| Where                      | Command                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Arch, Fedora (p11-kit)     | `sudo trust anchor --store apps/api/certs/ca.crt`                                                                          |
| Debian, Ubuntu             | `sudo cp apps/api/certs/ca.crt /usr/local/share/ca-certificates/express-boilerplate.crt && sudo update-ca-certificates`    |
| macOS                      | `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain apps/api/certs/ca.crt`               |
| Windows                    | `certutil -addstore -f ROOT apps\api\certs\ca.crt` (admin shell)                                                           |
| Chrome / Chromium on Linux | `certutil -d sql:$HOME/.pki/nssdb -A -t C,, -n express-boilerplate -i apps/api/certs/ca.crt`                               |
| Firefox                    | Settings → Privacy & Security → Certificates → View Certificates → Authorities → Import, tick "trust to identify websites" |

The CA's name includes who made it, for example `Express Boilerplate Local CA (you@laptop)`. That keeps it easy to find in a trust store with several CAs. With compose the name ends in `(compose)`.

For `curl` without touching the OS store, use `--cacert apps/api/certs/ca.crt` (or `certs/ca.crt` for compose).

## 5. Port 443

On Linux a non-root process cannot bind ports under 1024. Allow 443 once:

```sh
sudo sysctl -w net.ipv4.ip_unprivileged_port_start=443
echo 'net.ipv4.ip_unprivileged_port_start=443' | sudo tee /etc/sysctl.d/50-unprivileged-443.conf   # keep it after reboot
```

`pnpm dev` prints that line if the bind fails. macOS and Docker Desktop allow it already.

## 6. Run

```sh
pnpm dev                  # https://api.express-boilerplate.len/docs
```

`pnpm dev` loads env files in this order:

1. `apps/api/.env.development`: development mode, the local domain, an in-memory database.
2. `apps/api/.env`, if you created one from `.env.example`. Values here override the first file.

It runs every workspace package from source, so a change anywhere reloads without a build.

| Try                             | Command                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------- |
| Health                          | `curl --cacert apps/api/certs/ca.crt https://api.express-boilerplate.len/livez` |
| A token for Swagger's Authorize | `pnpm jwt` (all scopes), `pnpm jwt alice 1h users:read`                         |
| mTLS                            | add `--cert apps/api/certs/client.crt --key apps/api/certs/client.key`          |
| Every route and its guard       | `pnpm eb routes`                                                                |

`pnpm dev` runs only the app. If both it and compose are running, they compete for 127.0.0.1:443, so stop one first.

## Troubleshooting

| Symptom                                                  | Cause and fix                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Could not resolve host: api.express-boilerplate.len`    | Step 3: no hosts entry                                                                   |
| Browser warning, or `curl: (60) SSL certificate problem` | Step 4: the CA is not trusted, or it was regenerated and the old one is still trusted    |
| `EACCES` binding 443                                     | Step 5                                                                                   |
| `EADDRINUSE` on 443                                      | Compose or another `pnpm dev` holds it: `docker compose down`, or stop the other process |
| `http://localhost:443` answers `308`                     | Expected: 443 is HTTPS only, the gateway redirects to `https://`                         |
| `404` problem details for a host you expected to work    | The name is on the other gateway (public on .1, private on .2): check `/etc/hosts`       |
