# APISIX on Kubernetes

Two gateways, as in production: **public** (what end users reach: the API,
the login pages) and **private** (operator tools: dashboards, metrics,
secrets). Each is its own release with its own control plane, data plane,
etcd and ingress controller, so one can never serve the other's routes.

```sh
helm repo add apisix https://apache.github.io/apisix-helm-chart
helm upgrade --install apisix apisix/apisix --version 2.17.0 -n apisix \
  --create-namespace -f values.yaml -f public.values.yaml --wait
helm upgrade --install apisix-private apisix/apisix --version 2.17.0 \
  -n apisix-private --create-namespace -f values.yaml -f private.values.yaml --wait
kubectl apply -f defaults.yaml
```

| File                  | What it sets                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `values.yaml`         | Both: HTTPS on 443 only, no server tokens, problem+json for every error the gateway produces, `http://` on 443 redirected to `https://` |
| `public.values.yaml`  | IngressClass `apisix`, its controller and admin key                                                                                     |
| `private.values.yaml` | IngressClass `apisix-private`, a second controller name, its admin key                                                                  |
| `defaults.yaml`       | Per gateway: a catch-all 404 in problem+json, and no `Server` header                                                                    |

The app chart uses the public one: `ingress.className: apisix`, which also
renders a BackendTrafficPolicy (HTTPS to the pods, Host passed through).
Replace the `change-me-*` admin keys, run etcd with 3 replicas and
persistence, and put the private LoadBalancer on an internal network.
