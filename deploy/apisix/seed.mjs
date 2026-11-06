// Writes each gateway's routes and certificate through its control plane's
// Admin API, which stores them under that gateway's etcd prefix:
//   public:  the API and the login pages, what end users reach
//   private: the operator tools (dashboards, metrics, secrets, mail)
// Idempotent: PUT by id, so rerunning replaces instead of duplicating.
import {readFileSync} from 'node:fs';

class ApisixSeed {
  /** Read inside the seed container, so not a Turborepo task input. */
  static env(name) {
    return process.env[name];
  }

  /** Each control plane has its own admin key. */
  static KEYS = {
    public: ApisixSeed.env('APISIX_ADMIN_KEY') ?? '',
    private: ApisixSeed.env('APISIX_PRIVATE_ADMIN_KEY') ?? '',
  };
  static DOMAIN = ApisixSeed.env('DEV_DOMAIN') ?? 'express-boilerplate.len';
  static ADMIN = {
    public:
      ApisixSeed.env('APISIX_PUBLIC_ADMIN_URL') ?? 'http://apisix-cp:9180',
    private:
      ApisixSeed.env('APISIX_PRIVATE_ADMIN_URL') ??
      'http://apisix-private-cp:9180',
  };

  static pem(file) {
    return readFileSync(`/certs/${file}`, 'utf8');
  }

  /** An RFC 9457 body, the same shape the app sends. */
  static problem(status, title, detail) {
    return JSON.stringify({type: 'about:blank', title, status, detail});
  }

  /** HTTP-only tools on the internal network, each at <name>.<domain>. */
  static TOOLS = {
    dashboard: 'apisix-private-dashboard:9000',
    'dashboard-public': 'apisix-dashboard:9000',
    // @feature:vault
    vault: 'vault:8200',
    // @end:vault
    // @feature:metrics
    grafana: 'grafana:3000',
    prometheus: 'prometheus:9090',
    // @end:metrics
    // @feature:mail
    mailpit: 'mailpit:8025',
    // @end:mail
  };

  /** Shared by both gateways: the certificate, and a 404 for anything unrouted. */
  static common(snis) {
    return [
      [
        // Every response: no product name. APISIX sets Server after nginx's
        // own header filter, so it is removed here, not in the config.
        'global_rules/no-server-header',
        {plugins: {'response-rewrite': {headers: {remove: ['Server']}}}},
      ],
      [
        'ssls/local',
        {
          snis,
          cert: ApisixSeed.pem('server.crt'),
          key: ApisixSeed.pem('server.key'),
        },
      ],
      [
        // Lowest priority: only what no other route matches lands here, and
        // gets problem details instead of the gateway's own error body.
        'routes/not-found',
        {
          uri: '/*',
          priority: -100,
          plugins: {
            'fault-injection': {
              abort: {
                http_status: 404,
                body: ApisixSeed.problem(
                  404,
                  'Not Found',
                  'Nothing is served at this host and path.',
                ),
                headers: {'content-type': 'application/problem+json'},
              },
            },
          },
        },
      ],
    ];
  }

  static publicResources() {
    const domain = ApisixSeed.DOMAIN;
    return [
      // localhost too, so https://localhost reaches the API without a hosts entry.
      ...ApisixSeed.common([domain, `*.${domain}`, 'localhost']),
      [
        'upstreams/app',
        {
          type: 'roundrobin',
          scheme: 'https',
          nodes: {'app:8443': 1},
          pass_host: 'pass',
          timeout: {connect: 5, send: 30, read: 30},
          // The app requires a client certificate. client.crt is not the
          // trusted proxy identity, so the app never trusts X-Client-Cert
          // arriving through the gateway.
          tls: {
            client_cert: ApisixSeed.pem('client.crt'),
            client_key: ApisixSeed.pem('client.key'),
          },
        },
      ],
      [
        'routes/api',
        {
          hosts: [`api.${domain}`, 'localhost'],
          uri: '/*',
          upstream_id: 'app',
          plugins: {
            // Same header the app uses, so one id spans gateway and app logs.
            'request-id': {
              header_name: 'X-Request-Id',
              include_in_response: true,
            },
            // Coarse per-IP limit at the edge; the app keeps finer limits.
            'limit-count': {
              count: 1200,
              time_window: 60,
              key_type: 'var',
              key: 'remote_addr',
              rejected_code: 429,
            },
            // The limit's own body is the gateway's format; send the app's.
            'response-rewrite': {
              vars: [['status', '==', 429]],
              headers: {
                set: {
                  'content-type': 'application/problem+json',
                  'retry-after': '60',
                },
              },
              body: ApisixSeed.problem(
                429,
                'Too Many Requests',
                'Too many requests from this address. Try again in a minute.',
              ),
            },
            // 1 MB, like the app, rejected before it reaches the app.
            'client-control': {max_body_size: 1048576},
            // @feature:metrics
            prometheus: {},
            // @end:metrics
          },
        },
      ],
      // @feature:idp
      [
        // Public: browsers open the login pages during OIDC sign-in.
        'routes/keycloak',
        {
          host: `keycloak.${domain}`,
          uri: '/*',
          upstream: {
            type: 'roundrobin',
            scheme: 'https',
            nodes: {'keycloak:8543': 1},
            pass_host: 'pass',
          },
        },
      ],
      // @end:idp
    ];
  }

  static privateResources() {
    const domain = ApisixSeed.DOMAIN;
    return [
      ...ApisixSeed.common([`*.${domain}`]),
      ...Object.entries(ApisixSeed.TOOLS).map(([name, node]) => [
        `routes/${name}`,
        {
          host: `${name}.${domain}`,
          uri: '/*',
          upstream: {type: 'roundrobin', nodes: {[node]: 1}, pass_host: 'pass'},
        },
      ]),
    ];
  }

  static async put(gateway, path, body) {
    const response = await fetch(
      `${ApisixSeed.ADMIN[gateway]}/apisix/admin/${path}`,
      {
        method: 'PUT',
        headers: {
          'X-API-KEY': ApisixSeed.KEYS[gateway],
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      throw new Error(`${path}: ${response.status} ${await response.text()}`);
    }
  }

  static async run() {
    const gateways = {
      public: ApisixSeed.publicResources(),
      private: ApisixSeed.privateResources(),
    };
    // The control planes may still be starting; retry for up to a minute.
    for (let attempt = 1; ; attempt++) {
      try {
        for (const [gateway, resources] of Object.entries(gateways)) {
          for (const [path, body] of resources) {
            await ApisixSeed.put(gateway, path, body);
          }
          console.log(
            `Seeded ${resources.length} ${gateway} gateway resources`,
          );
        }
        return;
      } catch (error) {
        if (attempt >= 30) throw error;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
}

await ApisixSeed.run();
