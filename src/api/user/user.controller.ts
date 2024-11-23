import {UserService} from '@/api/user/user.service';
import {Controller, Get, Route, SuccessResponse, Tags} from '@tsoa/runtime';
import {StatusCodes} from 'http-status-codes';

@Route('user')
@Tags('User')
export class UserController extends Controller {
  #UserService: UserService;

  constructor() {
    super();
    this.#UserService = new UserService();
  }

  @Get()
  @SuccessResponse(StatusCodes.OK, 'Users found')
  public async getUsers() {
    return this.#UserService.findAll();
  }

  @Get('{user_id}')
  @SuccessResponse(StatusCodes.OK, 'User found')
  public async getUser(user_id: number) {
    return this.#UserService.findById(user_id);
  }
}
