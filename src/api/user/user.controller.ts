import {
  Controller,
  Get,
  Path,
  Route,
  SuccessResponse,
  Tags,
} from '@tsoa/runtime';
import {StatusCodes} from 'http-status-codes';
import type {IUserResponse, IUsersResponse} from '@/api/user/user.model';
import {UserService} from '@/api/user/user.service';

@Route('user')
@Tags('User')
export class UserController extends Controller {
  #UserService: UserService;

  constructor() {
    super();
    this.#UserService = new UserService();
  }

  /**
   * Retrieves the list of all users. <br/>
   * Supply no parameters and receive all users.
   */
  @Get()
  @SuccessResponse(StatusCodes.OK, 'Users found')
  public async getUsers(): Promise<IUsersResponse> {
    this.setStatus(200);
    return this.#UserService.findAll();
  }

  /**
   * Retrieves the details of an existing user. <br/>
   * Supply the unique user ID from either and receive corresponding user details.
   * @param {number} user_id The user's identifier
   */
  @Get('{user_id}')
  @SuccessResponse(StatusCodes.OK, 'User found')
  public async getUser(@Path() user_id: number): Promise<IUserResponse> {
    this.setStatus(200);
    return this.#UserService.findById(user_id);
  }
}
