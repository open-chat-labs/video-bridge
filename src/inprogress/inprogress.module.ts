import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InProgressService } from './inprogress.service';
import { InProgressSchema } from './inprogress.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'InProgress', schema: InProgressSchema },
    ]),
  ],
  providers: [InProgressService],
  exports: [InProgressService],
})
export class InProgressModule {}
