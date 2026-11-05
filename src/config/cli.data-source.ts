import 'reflect-metadata';
import {AppConfig} from './app.config.js';
import {DatabaseConfig} from './database.config.js';

// Entry point for the TypeORM CLI (pnpm migration:*). The app itself never
// imports this file.
export default DatabaseConfig.createDataSource(new AppConfig());
