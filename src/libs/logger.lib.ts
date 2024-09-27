import {pino} from 'pino';

// Configs
import {loggerOptions} from '@/configs/logger-options.config';

export const logger = pino(loggerOptions);
