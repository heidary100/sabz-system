import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { AddressesService } from './addresses.service';
import { CreateAddressDto, UpdateAddressDto } from './dto';

/**
 * Customer address-book endpoints (SS-233). All routes are authenticated
 * (`JwtAuthGuard`, no roles — self-owned customer state) and scoped to the
 * caller's userId; there is no public or cross-user access.
 */
@ApiTags('addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'List the authenticated user\u2019s addresses' })
  @ApiResponse({ status: 200, description: 'Addresses returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async list(@CurrentUser() user: AuthUser) {
    return this.addressesService.list(user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Add an address to the address book' })
  @ApiResponse({ status: 201, description: 'Address created.' })
  @ApiResponse({ status: 400, description: 'Invalid address fields.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(user.userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update one of the user\u2019s addresses' })
  @ApiParam({ name: 'id', description: 'Address id' })
  @ApiResponse({ status: 200, description: 'Address updated.' })
  @ApiResponse({ status: 400, description: 'Invalid address id or fields.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Address not found.' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove one of the user\u2019s addresses' })
  @ApiParam({ name: 'id', description: 'Address id' })
  @ApiResponse({ status: 200, description: 'Removal result returned.' })
  @ApiResponse({ status: 400, description: 'Invalid address id.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.addressesService.remove(user.userId, id);
  }
}
