import {
  Body,
  Controller,
  Get,
  Header,
  Ip,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AppRole } from '../auth/enums/app-role.enum';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { UpdateFooterSettingsDto } from './dto/footer.dto';
import { SettingsService } from './settings.service';

@ApiTags('catalog-settings')
@Controller('catalog/settings')
export class PublicSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('footer')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({ summary: 'Public footer content (null = storefront defaults)' })
  async footer() {
    return this.settings.getFooter();
  }
}

@ApiTags('admin-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.ADMIN)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('footer')
  @ApiOperation({ summary: 'Read editorial footer settings' })
  async getFooter() {
    return this.settings.getFooter();
  }

  @Put('footer')
  @ApiOperation({ summary: 'Update footer settings with optimistic version check' })
  async updateFooter(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateFooterSettingsDto,
    @Ip() ipAddress?: string,
  ) {
    return this.settings.updateFooter(dto, user.userId, ipAddress);
  }
}
