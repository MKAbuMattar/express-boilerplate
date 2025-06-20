import fs from 'node:fs';
import {dirname, resolve} from 'node:path';
import {generateRoutes, generateSpec} from '@tsoa/cli';
import type {Config, ExtendedRoutesConfig, ExtendedSpecConfig} from 'tsoa';
import ts from 'typescript';
import {logger} from '@/libs/logger.lib';

// Helper function to read a JSON file
const readJsonFile = (filePath: string): any => {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(fileContent);
};

// Parse TypeScript configuration
const parseTsConfig = (configPath: string) => {
  const tsConfigFile = ts.readConfigFile(configPath, ts.sys.readFile);
  return ts.parseJsonConfigFileContent(
    tsConfigFile.config,
    ts.sys,
    dirname(configPath),
  );
};

// Main function to generate TSOA spec and routes
const buildApiSpecAndRoutes = async (): Promise<void> => {
  try {
    const cwd = process.cwd();
    const appRoot = resolve(cwd);

    // Load configurations
    const tsConfig = parseTsConfig(resolve(appRoot, 'tsconfig.json'));
    const tsoaConfig: Config = readJsonFile(resolve(appRoot, 'tsoa.json'));

    // Combine configurations with defaults
    const specOptions = {
      ...tsoaConfig.spec,
      ...tsoaConfig,
    } as ExtendedSpecConfig;
    const routeOptions = {
      ...tsoaConfig.routes,
      ...tsoaConfig,
    } as ExtendedRoutesConfig;

    logger.info('Starting TSOA generation...');

    logger.info('Generating OpenAPI spec...');
    await generateSpec(specOptions, tsConfig.options, tsoaConfig.ignore);
    logger.info('OpenAPI spec generated successfully.');

    logger.info('Generating routes...');
    await generateRoutes(routeOptions, tsConfig.options, tsoaConfig.ignore);
    logger.info('Routes generated successfully.');

    logger.info('TSOA generation complete.');
  } catch (error) {
    logger.error('Error during TSOA generation:', error);
    process.exit(1);
  }
};

// Check if the current script is being run directly
if (import.meta.url.includes(process.argv[1])) {
  buildApiSpecAndRoutes();
}

export default buildApiSpecAndRoutes;
