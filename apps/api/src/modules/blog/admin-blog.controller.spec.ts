import { Reflector } from '@nestjs/core';
import { BlogStatus } from '@prisma/client';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { AppRole } from '../auth/enums/app-role.enum';
import { AdminBlogController } from './admin-blog.controller';
import { BlogService } from './blog.service';

describe('AdminBlogController (SS-240E)', () => {
  let controller: AdminBlogController;
  let blogService: { getPostByIdForAdmin: jest.Mock; listForAdmin: jest.Mock };

  beforeEach(() => {
    blogService = { getPostByIdForAdmin: jest.fn(), listForAdmin: jest.fn() };
    controller = new AdminBlogController(blogService as unknown as BlogService);
  });

  it('requires OPERATOR or ADMIN at the controller level', () => {
    const reflector = new Reflector();
    const roles = reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      AdminBlogController.prototype.list,
      AdminBlogController,
    ]);
    expect(roles).toEqual([AppRole.OPERATOR, AppRole.ADMIN]);
  });

  it('delegates the queue query with defaults intact', async () => {
    blogService.listForAdmin.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const query = {
      status: undefined,
      page: 1,
      limit: 20,
    };

    const result = await controller.list(query);

    expect(blogService.listForAdmin).toHaveBeenCalledWith({
      status: undefined,
      page: 1,
      limit: 20,
    });
    expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
  });

  it('delegates the detail lookup by id', async () => {
    blogService.getPostByIdForAdmin.mockResolvedValue({
      id: 'post-id',
      status: BlogStatus.DRAFT,
    });
    const id = '9a2f7c3e-1b4d-4e6f-8a0c-2d5f7b9e1a3c';

    const result = await controller.getById(id);

    expect(blogService.getPostByIdForAdmin).toHaveBeenCalledWith(id);
    expect(result).toEqual({ id: 'post-id', status: BlogStatus.DRAFT });
  });
});
