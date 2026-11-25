import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AppRole } from '../auth/enums/app-role.enum';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PaymentProviderService } from './payment-provider.service';

class InitiatePaymentDto {
  @IsString({ message: 'شناسه سفارش الزامی است.' })
  @MaxLength(64)
  orderId!: string;
}

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentProviderService) {}

  @Get('providers')
  @ApiOperation({ summary: 'Configured online providers (fail-closed readiness)' })
  providers() {
    return this.payments.status();
  }

  @Post('providers/:code/initiate')
  @ApiOperation({
    summary: 'Attempt online payment initiation (returns initialized:false while unconfigured)',
  })
  @ApiParam({ name: 'code', enum: ['SNAPPAY', 'DIGIPAY'] })
  initiate(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.payments.initiate(user.userId, dto.orderId, code);
  }
}

@ApiTags('admin-payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentProviderService) {}

  @Get('providers')
  @ApiOperation({ summary: 'Provider readiness with missing configuration keys' })
  providers() {
    return this.payments.status();
  }
}
