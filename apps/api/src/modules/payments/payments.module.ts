import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentProviderService } from './payment-provider.service';
import {
  AdminPaymentsController,
  PaymentsController,
} from './payments.controller';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [PaymentProviderService],
  exports: [PaymentProviderService],
})
export class PaymentsModule {}
