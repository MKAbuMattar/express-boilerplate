// Configs
import {loggerOptions} from '@/configs/logger-options.config';
import {pino} from 'pino';

export const logger = pino(loggerOptions);
