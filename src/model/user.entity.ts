import {
  Column,
  CreateDateColumn,
  Entity,
  ObjectIdColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {DatabaseType} from '../enumeration/database-type.enum.js';

export class EntityIds {
  // Decorators run at import time, before AppConfig exists, so read env here.
  static readonly isMongo = process.env.DB_TYPE === DatabaseType.Mongodb;

  static primary(): PropertyDecorator {
    return EntityIds.isMongo
      ? ObjectIdColumn()
      : PrimaryGeneratedColumn('uuid');
  }
}

// Column types are explicit so no code depends on emitted design:type metadata.
@Entity('users')
export class UserEntity {
  @EntityIds.primary()
  id!: string;

  @Column('varchar', {length: 120})
  name!: string;

  @Column('varchar', {length: 254, unique: true})
  email!: string;

  @Column('int')
  age!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
