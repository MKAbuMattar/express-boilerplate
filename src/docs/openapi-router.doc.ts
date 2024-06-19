import express, {Request, Response, Router} from 'express';
import swaggerUi from 'swagger-ui-express';

// Docs
import {generateOpenAPIDocument} from '@/docs/openapi-document-generator.doc';

export const openAPIRouter: Router = (() => {
  const router = express.Router();
  const openAPIDocument = generateOpenAPIDocument();

  router.get('/swagger.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(openAPIDocument);
  });

  router.use('/', swaggerUi.serve, swaggerUi.setup(openAPIDocument));

  return router;
})();
