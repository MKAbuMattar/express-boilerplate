import type {Request, RequestHandler, Response} from 'express';

import {findAll, findById} from '@/api/user/user.service';
import {handleServiceResponse} from '@/utils/http-handlers.util';

export const getUsers: RequestHandler = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const serviceResponse = await findAll();
  handleServiceResponse(serviceResponse, res);
};

export const getUser: RequestHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const id = Number.parseInt(req.params.id as string, 10);
  const serviceResponse = await findById(id);
  handleServiceResponse(serviceResponse, res);
};
