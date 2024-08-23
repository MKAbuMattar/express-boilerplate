import type {Request, RequestHandler, Response} from 'express';

// User API
import {findAll, findById} from '@/api/user/user.service';
// utils
import {handleServiceResponse} from '@/utils/http-handlers.util';

export const getUsers: RequestHandler = async (
  _req: Request,
  res: Response,
) => {
  const serviceResponse = await findAll();
  return handleServiceResponse(serviceResponse, res);
};

export const getUser: RequestHandler = async (req: Request, res: Response) => {
  const id = Number.parseInt(req.params.id as string, 10);
  const serviceResponse = await findById(id);
  return handleServiceResponse(serviceResponse, res);
};
