import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FightModule } from './fight/fight.module';

@Module({
  imports: [FightModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
