import {pino} from 'pino';

import {loggerOptions} from '@/configs/logger-options.config';

export const logger = pino(loggerOptions);
