import {randomUUID} from 'node:crypto';
import {DatabaseType} from '@express-boilerplate/common/enumeration/database-type.enum.js';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ObjectIdColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export class EntityIds {
  // @feature:db-mongodb
  // Decorators run at import time, before AppConfig exists, so read env here.
  static readonly isMongo = process.env.DB_TYPE === DatabaseType.Mongodb;
  // @end:db-mongodb

  // SQL ids are UUIDs made by the app: one migration then works on every
  // dialect, with no database-side uuid extension or default.
  static primary(): PropertyDecorator {
    // @feature:db-mongodb
    if (EntityIds.isMongo) return ObjectIdColumn();
    // @end:db-mongodb
    return PrimaryColumn('varchar', {length: 36});
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

  // A named unique index, not unique: true, so every dialect (and the
  // migration) agrees on one name instead of generating UQ_/IDX_ hashes.
  @Index('UQ_users_email', {unique: true})
  @Column('varchar', {length: 254})
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
    // @feature:db-mongodb
    if (EntityIds.isMongo) return; // MongoDB assigns the ObjectId
    // @end:db-mongodb
    if (!this.id) this.id = randomUUID();
  }
}
