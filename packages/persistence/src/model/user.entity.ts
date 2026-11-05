import {randomUUID} from 'node:crypto';
import {DatabaseType} from '@express-boilerplate/common/enumeration/database-type.enum.js';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  ObjectIdColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export class EntityIds {
  // Decorators run at import time, before AppConfig exists, so read env here.
  static readonly isMongo = process.env.DB_TYPE === DatabaseType.Mongodb;

  // SQL ids are UUIDs made by the app: one migration then works on every
  // dialect, with no database-side uuid extension or default.
  static primary(): PropertyDecorator {
    return EntityIds.isMongo
      ? ObjectIdColumn()
      : PrimaryColumn('varchar', {length: 36});
  }
}

// Column types are explicit so no code depends on emitted design:type metadata.
// Schema changes go through a migration in src/repository/migration, never synchronize.
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

  /** Added in migration AddUserPhone; exposed by API v2 only. */
  @Column('varchar', {length: 32, nullable: true})
  phone!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  assignId(): void {
    if (!EntityIds.isMongo && !this.id) this.id = randomUUID();
  }
}
