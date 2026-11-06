/** v1 public shape of a user. Keeps the API stable when the entity changes. */
export class UserV1Dto {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly email: string,
    readonly age: number,
    readonly createdAt: string,
    readonly updatedAt: string,
  ) {}
}
