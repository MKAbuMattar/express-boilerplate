# @express-boilerplate/service

Business logic. Each service is an abstract class (the contract other packages inject) and a `@Service()` implementation in `impl/`. The contracts are abstract classes, not interfaces, so they exist at runtime and work as dependency injection tokens.

Depends on `@express-boilerplate/persistence` and `@express-boilerplate/common`. Only `@express-boilerplate/api` depends on it.

## Contents

| Contract | Implementation | What it does |
|---|---|---|
| `UserService` | `UserServiceImpl` | Create, read, update, delete and page users; publishes `user.*` events |
| `HealthService` | `HealthServiceImpl` | Liveness and readiness groups, one `HealthIndicator` per dependency, each with a timeout |
| `MailService` | `MailServiceImpl` | Sends mail over SMTP, or logs it when `SMTP_URL` is empty |
| `NetworkService` | `NetworkServiceImpl` | ICMP ping with strict host validation and no shell |
| `ExperimentService` | `ExperimentServiceImpl` | Stable A/B variant per user from `EXPERIMENTS` |

Also here:

- `EventBus`: in-process events that feed SSE and WebSocket.
- `JobRegistry`: wires each queue to its handler and to the events that feed it.
- `dto/CreateUserDto`: validated business input.
- `model/`: `AppEvent` and `Health`.

## Wiring

`config/service.configuration.ts` binds each contract to its implementation:

```ts
@Bean(UserService)
userService(beans: BeanFactory): UserService {
  return beans.getBean(UserServiceImpl);
}
```

## Adding a service

1. `src/service/order.service.ts`: `export abstract class OrderService { abstract ... }`
2. `src/service/impl/order.service.impl.ts`: `@Service() export class OrderServiceImpl extends OrderService`, with dependencies taken through `@inject(Token)`.
3. Add a `@Bean(OrderService)` method to `ServiceConfiguration`.

## Scripts

`build` (to `dist/`), `dev` (watch), `typecheck`. Other packages import the compiled output by path, for example `@express-boilerplate/service/service/user.service.js`.
