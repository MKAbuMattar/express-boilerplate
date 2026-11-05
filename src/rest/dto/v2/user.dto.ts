/** v2 public shape of a user: v1 plus phone. */
export class UserV2Dto {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly email: string,
    readonly age: number,
    readonly phone: string | null,
    readonly createdAt: string,
    readonly updatedAt: string,
  ) {}
}
