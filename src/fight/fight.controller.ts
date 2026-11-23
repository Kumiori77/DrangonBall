import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  BadRequestException,
} from '@nestjs/common';

import type { Request, Response } from 'express';
import { join } from 'node:path';

import { FightService } from './fight.service';

@Controller('fight')
export class FightController {
  constructor(private readonly fightService: FightService) {}

  // 로그인 페이지
  @Get('admin')
  admin(@Res() res: Response) {
    return res.sendFile(join(process.cwd(), 'views', 'admin.html'));
  }

  // 로그인
  //   @Post('login')
  //   async login(@Body() body: { teamNo: string; password: string }) {
  //     return this.fightService.login(body.teamNo, body.password);
  //   }
  @Post('login')
  async login(@Body() body: { password?: string }) {
    const password = body?.password;

    if (typeof password !== 'string' || !password.trim()) {
      throw new BadRequestException('비밀번호를 입력해주세요.');
    }

    // 팀 번호 고정
    const teamNo = '7';

    // 기존 FightService 로그인 기능 사용
    return this.fightService.login(teamNo, password);
  }

  // HTML 크롤링 1회 실행
  @Get('fighters')
  async getFighters() {
    return this.fightService.getFighters();
  }

  // 정렬
  @Get('ranking')
  async getRanking() {
    return this.fightService.getRankedFighters();
    // return this.fightService.getRankedFighters();
  }

  // 반복 크롤링 시작
  @Post('start')
  start() {
    return this.fightService.startPolling();
  }

  // 반복 크롤링 중지
  @Post('stop')
  stop() {
    return this.fightService.stopPolling();
  }

  // 현재 상태 및 마지막 수집 결과
  @Get('status')
  status() {
    return this.fightService.getStatus();
  }
}
