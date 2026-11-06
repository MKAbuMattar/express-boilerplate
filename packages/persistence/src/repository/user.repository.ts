import {Repository} from '@express-boilerplate/common/config/stereotypes.js';
import {inject} from 'inversify';
import {ObjectId} from 'mongodb';
import {
  DataSource,
  type FindOptionsWhere,
  type Repository as OrmRepository,
  Raw,
} from 'typeorm';
import {EntityIds, UserEntity} from '../model/user.entity.js';

@Repository()
export class UserRepository {
  private readonly orm: OrmRepository<UserEntity>;

  constructor(@inject(DataSource) dataSource: DataSource) {
    this.orm = dataSource.getRepository(UserEntity);
  }

  findAll(): Promise<UserEntity[]> {
    return this.orm.find({order: {createdAt: 'ASC'}});
  }

  findById(id: string): Promise<UserEntity | null> {
    // @feature:db-mongodb
    if (EntityIds.isMongo) {
      if (!ObjectId.isValid(id)) return Promise.resolve(null);
      return this.orm.findOneBy({_id: new ObjectId(id)} as object);
    }
    // @end:db-mongodb
    return this.orm.findOneBy({id});
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.orm.findOneBy({email});
  }

  /**
   * One page, optionally filtered by a case-insensitive substring of name or
   * email. The search term is always a bound parameter, never SQL text, and
   * its LIKE wildcards are escaped, so `%` matches a literal percent sign.
   */
  async findPage(
    page: number,
    size: number,
    search: string | null,
  ): Promise<{items: UserEntity[]; total: number}> {
    const [items, total] = await this.orm.findAndCount({
      where: search ? this.searchWhere(search) : {},
      order: {createdAt: 'ASC', id: 'ASC'},
      skip: (page - 1) * size,
      take: size,
    });
    return {items, total};
  }

  private searchWhere(search: string): FindOptionsWhere<UserEntity>[] {
    // @feature:db-mongodb
    if (EntityIds.isMongo) {
      const pattern = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return [
        {name: {$regex: pattern, $options: 'i'}},
        {email: {$regex: pattern, $options: 'i'}},
      ] as never;
    }
    // @end:db-mongodb
    // '!' as the LIKE escape char: unlike '', it means the same in every dialect.
    const term = `%${search.toLowerCase().replace(/[!%_]/g, '!$&')}%`;
    const like = Raw((column) => `LOWER(${column}) LIKE :term ESCAPE '!'`, {
      term,
    });
    return [{name: like}, {email: like}];
  }

  save(
    user: Pick<UserEntity, 'name' | 'email' | 'age'> & {phone?: string | null},
  ): Promise<UserEntity> {
    return this.orm.save(this.orm.create(user));
  }

  /** True when the id has the shape this database uses. */
  isValidId(id: string): boolean {
    // @feature:db-mongodb
    if (EntityIds.isMongo) return ObjectId.isValid(id);
    // @end:db-mongodb
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id,
    );
  }

  /** Insert with a client-chosen id (PUT on a missing resource). */
  saveWithId(
    id: string,
    user: Pick<UserEntity, 'name' | 'email' | 'age' | 'phone'>,
  ): Promise<UserEntity> {
    const entity = this.orm.create(user);
    (entity as {id: unknown}).id = id;
    // @feature:db-mongodb
    if (EntityIds.isMongo) (entity as {id: unknown}).id = new ObjectId(id);
    // @end:db-mongodb
    return this.orm.save(entity);
  }

  update(user: UserEntity, changes: Partial<UserEntity>): Promise<UserEntity> {
    return this.orm.save(Object.assign(user, changes));
  }

  async remove(user: UserEntity): Promise<void> {
    await this.orm.remove(user);
  }
}
