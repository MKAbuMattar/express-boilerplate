# Kubernetes

![Kubernetes deployment](diagrams/kubernetes.svg)

A production cluster runs three releases:

| Release          | Chart                                       | Values in this repo                                     |
| ---------------- | ------------------------------------------- | ------------------------------------------------------- |
| `apisix`         | `apisix/apisix` 2.17.0: the public gateway  | `deploy/k8s/apisix/values.yaml` + `public.values.yaml`  |
| `apisix-private` | `apisix/apisix` 2.17.0: the private gateway | `deploy/k8s/apisix/values.yaml` + `private.values.yaml` |
| the app          | `deploy/helm/express-boilerplate`           | `values.yaml` + `environments/<env>.yaml`               |

Argo CD can sync the app per environment (see [Argo CD](#argo-cd)).

Try it on [kind](#1-try-it-on-kind) first. The same steps, with real values, are the [production checklist](#2-production).

## 1. Try it on kind

You need Docker, `kind`, `kubectl` and `helm`. Use a kubeconfig of its own, so no command can reach another cluster:

```sh
export KUBECONFIG=$PWD/.kind.kubeconfig
kind create cluster --name eb
```

### Load balancer, certificates

```sh
# MetalLB gives LoadBalancer Services an address on the kind Docker network.
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.15.2/config/manifests/metallb-native.yaml
kubectl -n metallb-system wait --for=condition=Available deploy --all --timeout=180s
NET=$(docker network inspect kind -f '{{(index .IPAM.Config 0).Subnet}}' | cut -d. -f1-2)   # e.g. 172.19
kubectl apply -f - <<EOF
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata: {name: kind, namespace: metallb-system}
spec: {addresses: ["$NET.255.200-$NET.255.250"]}
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata: {name: kind, namespace: metallb-system}
EOF

# cert-manager issues the pods' TLS certificates from a CA: here, your local one.
helm upgrade --install cert-manager oci://quay.io/jetstack/charts/cert-manager \
  -n cert-manager --create-namespace --set crds.enabled=true --wait
pnpm certs   # if apps/api/certs does not exist yet
kubectl -n cert-manager create secret tls local-ca \
  --cert=apps/api/certs/ca.crt --key=apps/api/certs/ca.key
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata: {name: internal-ca}
spec: {ca: {secretName: local-ca}}
EOF
```

The chart defaults to a ClusterIssuer named `internal-ca`, which is why the issuer above uses that name.

### The two gateways

```sh
cd deploy/k8s/apisix
helm repo add apisix https://apache.github.io/apisix-helm-chart
helm upgrade --install apisix apisix/apisix --version 2.17.0 -n apisix \
  --create-namespace -f values.yaml -f public.values.yaml --wait
helm upgrade --install apisix-private apisix/apisix --version 2.17.0 -n apisix-private \
  --create-namespace -f values.yaml -f private.values.yaml --wait
kubectl apply -f defaults.yaml          # catch-all 404 + no Server header, per gateway
cd -
```

| File                  | What it sets                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `values.yaml`         | both: LoadBalancer on 443 only (no HTTP port), no server tokens, problem+json for every error the gateway produces, `http://` on 443 redirected to `https://` |
| `public.values.yaml`  | IngressClass `apisix`, its controller, its admin key                                                                                                          |
| `private.values.yaml` | IngressClass `apisix-private`, a second controller name, its admin key                                                                                        |
| `defaults.yaml`       | the catch-all 404 route and the no-`Server` rule for each class                                                                                               |

Each gateway has its own etcd, control plane and ingress controller. An Ingress with `ingressClassName: apisix` can only ever appear on the public address. Operator tools use `apisix-private`.

### A database with TLS

The chart runs the app with `NODE_ENV=production`. In that mode `AppConfig` refuses an unencrypted database. For kind, run Postgres with a cert-manager certificate. The manifest is in the [appendix](#appendix-postgres-with-tls-on-kind).

```sh
kubectl create namespace eb
kubectl apply -f postgres.yaml                     # from the appendix
kubectl -n eb rollout status statefulset/postgres
```

### Secrets and the edge certificate

```sh
kubectl -n eb create secret generic eb-secrets \
  --from-literal=DB_URL='postgres://app:app@postgres.eb.svc:5432/app' \
  --from-literal=SESSION_SECRET="$(openssl rand -hex 32)" \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)"

# The certificate the public gateway shows for api.<domain>
kubectl -n eb create secret tls edge-tls \
  --cert=apps/api/certs/server.crt --key=apps/api/certs/server.key
```

### The app

```sh
docker build -t express-boilerplate:dev .
kind load docker-image express-boilerplate:dev --name eb

helm upgrade --install eb deploy/helm/express-boilerplate -n eb -f - --wait <<EOF
image: {repository: express-boilerplate, tag: dev, pullPolicy: Never}
config:
  PUBLIC_URL: https://api.express-boilerplate.len
  DB_TYPE: postgres
  CACHE_TYPE: memory
  QUEUE_TYPE: memory
secrets: {existingSecret: eb-secrets}
database: {caSecret: postgres-tls}      # cert-manager put ca.crt in it
ingress:
  enabled: true
  className: apisix
  annotations: {}
  hosts: [api.express-boilerplate.len]
  tls: [{hosts: [api.express-boilerplate.len], secretName: edge-tls}]
networkPolicy: {enabled: true, ingressNamespaces: [apisix]}
EOF
helm test eb -n eb
```

What happens on install:

1. A `pre-install,pre-upgrade` hook creates a ServiceAccount, then a Job runs the migrations with the same image and secrets. If they fail, the rollout stops.
2. cert-manager issues `<release>-tls` for the Service DNS names. The pods serve HTTPS on 443 with it.
3. The Deployment rolls out. Probes hit `/livez` and `/readyz` over HTTPS.
4. `className: apisix` also renders a BackendTrafficPolicy. With it, APISIX speaks HTTPS to the pods and passes the Host header through.
5. The NetworkPolicy lets only the `apisix` namespace (and the `helm test` pod) reach the pods.

### Check it

```sh
LB=$(kubectl -n apisix get svc apisix-gateway -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
H=api.express-boilerplate.len
curl --resolve $H:443:$LB --cacert apps/api/certs/ca.crt https://$H/livez        # 200
curl --resolve $H:443:$LB --cacert apps/api/certs/ca.crt https://$H/docs/        # 404: no Swagger in production
curl -i http://$LB:443/                                                          # 308 problem details
kubectl -n default run probe --rm -i --restart=Never --image=curlimages/curl -- \
  curl -sk -m 5 https://eb-express-boilerplate.eb.svc/livez                      # times out: NetworkPolicy
```

Clean up with `kind delete cluster --name eb`.

## 2. Production

The chart's defaults are already production-shaped. These are the values to set:

| Value                                             | Set it to                                                                                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `image.digest`                                    | an immutable `sha256:` from your release pipeline. It wins over `image.tag`                                                            |
| `config.*`                                        | non-secret settings (`PUBLIC_URL`, `CORS_ORIGINS`, `DB_TYPE`...); see `apps/api/.env.example`                                          |
| `externalSecret.*` or `secrets.existingSecret`    | where `DB_URL`, `CACHE_URL`, `SESSION_SECRET`, `JWT_SECRET`... come from. Vault via External Secrets is the default in `environments/` |
| `database.caSecret`                               | a Secret with `ca.crt` when the database CA is not public (an in-cluster Postgres, the AWS RDS bundle)                                 |
| `tls.certManager.issuerRef`                       | your internal ClusterIssuer, or `tls.secretName` for a certificate you manage                                                          |
| `ingress.className`                               | `apisix` for the public gateway. The files in `environments/` say `nginx`; switch them if you run the APISIX gateways                  |
| `ingress.hosts`, `ingress.tls`                    | your public host and its certificate (`cert-manager.io/cluster-issuer` annotation for ACME)                                            |
| `ingress.apisix.timeout`                          | upstream timeouts, e.g. `{connect: 5s, send: 30s, read: 30s}`                                                                          |
| `httpRoute.*`                                     | the Gateway API instead of Ingress. It adds a BackendTLSPolicy                                                                         |
| `networkPolicy.ingressNamespaces`                 | the gateway's namespace and your monitoring namespace                                                                                  |
| `autoscaling`, `podDisruptionBudget`, `resources` | sized for your traffic. Production defaults: 3 to 20 replicas, PDB `maxUnavailable: 1`                                                 |
| `serviceMonitor.enabled`                          | `true` with the Prometheus Operator                                                                                                    |

Already enforced by the chart, nothing to set:

- non-root, read-only root filesystem, all capabilities dropped, seccomp `RuntimeDefault`
- binds 443 through a namespaced sysctl, without root
- TLS on every hop
- pods spread across zones
- no CPU limit, a memory limit

For the gateways in production:

- replace the `change-me-*` admin keys
- run etcd with 3 replicas and persistence
- put the private gateway's LoadBalancer on an internal network only (an internal load balancer annotation, or a private subnet)

## Argo CD

`deploy/argocd` is an app of apps:

```sh
kubectl apply -n argocd -f deploy/argocd/root.yaml     # once, by hand
```

| File                   | What it creates                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `root.yaml`            | the root Application. It syncs `deploy/argocd/apps` from Git                                              |
| `apps/project.yaml`    | the AppProject: allowed repo, namespaces, sync windows                                                    |
| `apps/staging.yaml`    | the chart with `environments/staging.yaml`. Synced automatically                                          |
| `apps/production.yaml` | the chart with `environments/production.yaml`. Synced by a person, sync-wave 1, Pod Security `restricted` |

To add an environment, add a values file in `environments/` and an Application in `apps/`. To promote a release, change `targetRevision` to its tag and set `image.digest`.

## Appendix: Postgres with TLS on kind

```yaml
# postgres.yaml: kind only. Use a managed database or an operator in production.
apiVersion: cert-manager.io/v1
kind: Certificate
metadata: { name: postgres-tls, namespace: eb }
spec:
  secretName: postgres-tls
  issuerRef: { kind: ClusterIssuer, name: internal-ca }
  dnsNames:
    [postgres, postgres.eb, postgres.eb.svc, postgres.eb.svc.cluster.local]
---
apiVersion: v1
kind: Service
metadata: { name: postgres, namespace: eb }
spec:
  selector: { app: postgres }
  ports: [{ name: postgres, port: 5432 }]
---
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: postgres, namespace: eb }
spec:
  serviceName: postgres
  replicas: 1
  selector: { matchLabels: { app: postgres } }
  template:
    metadata: { labels: { app: postgres } }
    spec:
      initContainers:
        # Postgres refuses a key others can read; secrets mount 0644.
        - name: key
          image: postgres:18-alpine
          command:
            [
              sh,
              -c,
              "cp /tls/tls.crt /tls/tls.key /certs/ && chown 70:70 /certs/* && chmod 600 /certs/tls.key",
            ]
          volumeMounts:
            [{ name: tls, mountPath: /tls }, { name: certs, mountPath: /certs }]
      containers:
        - name: postgres
          image: postgres:18-alpine
          args:
            [
              "-c",
              "ssl=on",
              "-c",
              "ssl_cert_file=/certs/tls.crt",
              "-c",
              "ssl_key_file=/certs/tls.key",
            ]
          env:
            - { name: POSTGRES_USER, value: app }
            - { name: POSTGRES_PASSWORD, value: app }
            - { name: POSTGRES_DB, value: app }
          ports: [{ containerPort: 5432 }]
          readinessProbe:
            exec: { command: [sh, -c, "pg_isready -h 127.0.0.1 -U app -d app"] }
            periodSeconds: 3
          volumeMounts: [{ name: certs, mountPath: /certs }]
      volumes:
        - { name: tls, secret: { secretName: postgres-tls } }
        - { name: certs, emptyDir: {} }
```
