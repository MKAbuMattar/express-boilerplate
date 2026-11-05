import {inject} from 'inversify';
import {ObjectId} from 'mongodb';
import {DataSource, type Repository as OrmRepository} from 'typeorm';
import {Repository} from '../config/stereotypes.js';
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
    if (EntityIds.isMongo) {
      if (!ObjectId.isValid(id)) return Promise.resolve(null);
      return this.orm.findOneBy({_id: new ObjectId(id)} as object);
    }
    return this.orm.findOneBy({id});
  }

  findByEmail(email: string): Promise<UserEntity | null> {
    return this.orm.findOneBy({email});
  }

  save(user: Pick<UserEntity, 'name' | 'email' | 'age'>): Promise<UserEntity> {
    return this.orm.save(this.orm.create(user));
  }

  async remove(user: UserEntity): Promise<void> {
    await this.orm.remove(user);
  }
}
