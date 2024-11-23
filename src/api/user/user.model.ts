import type {ServiceResponse} from '@/models/service-response.model';

export interface User {
  id: number;
  name: string;
  email: string;
  age: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserResponse extends ServiceResponse<User | null> {}
export interface IUsersResponse extends ServiceResponse<User[] | null> {}
