import { Module } from '@nestjs/common';
import { TorobController } from './torob.controller';
import { TorobService } from './torob.service';

@Module({
  controllers: [TorobController],
  providers: [TorobService],
})
export class TorobModule {}
