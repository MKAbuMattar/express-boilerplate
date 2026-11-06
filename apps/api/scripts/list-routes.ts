import 'reflect-metadata';
import {AppConfig} from '@express-boilerplate/common/config/app.config.js';
import {Application} from '../src/application.js';

type Layer = {route?: {path: string; methods: Record<string, boolean>}};

/**
 * Every route the app serves, in registration order. Boots the app on an
 * in-memory database, so it needs no services running. `pnpm routes [--json]`.
 */
export class RouteList {
  static async read(): Promise<{method: string; path: string}[]> {
    const application = new Application(
      new AppConfig({NODE_ENV: 'test', DB_TYPE: 'sqljs'}),
    );
    try {
      const app = (await application.init()) as unknown as {
        router: {stack: Layer[]};
      };
      return app.router.stack.flatMap((layer) =>
        layer.route
          ? Object.keys(layer.route.methods).map((method) => ({
              method: method.toUpperCase(),
              path: layer.route!.path,
            }))
          : [],
      );
    } finally {
      await application.close();
    }
  }
}

if (import.meta.main) {
  const routes = await RouteList.read();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(routes, null, 2));
  } else {
    for (const {method, path} of routes) {
      console.log(`${method.padEnd(8)} ${path}`);
    }
  }
}
