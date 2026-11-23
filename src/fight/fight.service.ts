import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  OnModuleDestroy,
} from '@nestjs/common';

import axios, { AxiosInstance } from 'axios';
import { CookieJar } from 'tough-cookie';
import { HttpCookieAgent, HttpsCookieAgent } from 'http-cookie-agent/http';
import * as cheerio from 'cheerio';

// 실제 사이트 주소로 수정
const LOGIN_URL_POST = 'https://www.gjyouthgroup.kr/complete26/account.php';
const BATTLE_URL = 'https://www.gjyouthgroup.kr/complete26/user_home.php';

// 실제 로그인 폼의 name 속성으로 수정
// const TEAM_FIELD = 'team';
// const PASSWORD_FIELD = 'code';

// 크롤링 간격: 4초
// const POLL_MS = 4000;

// 최대 실행 시간: 10분
// const MAX_DURATION_MS = 10 * 60 * 1000;

export interface Fighter {
  teamName: string;
  characterName: string | null;
  imgUrl: string;
}

export interface RankedFighter {
  teamName: string;
  characterName: string;
  maxHP: number | null;
  imgUrl: string;
}

export interface BattleSkill {
  slot: number;
  name: string;
  power: string;
  star_cost: number;
  hp_cost: number;
  damage: number;
}

@Injectable()
export class FightService {
  // 데이터
  private readonly character = [
    // S
    { name: '마인 부우', maxHP: 24000 },
    { name: '베지터', maxHP: 16000 },
    { name: '셀', maxHP: 20000 },
    { name: '손오공', maxHP: 18000 },
    { name: '손오반', maxHP: 19000 },
    { name: '오천크스', maxHP: 22000 },
    { name: '프리저', maxHP: 15000 },
    // A
    { name: '손오천', maxHP: 14000 },
    { name: '인조인간 16호', maxHP: 20000 },
    { name: '인조인간 17호', maxHP: 20000 },
    { name: '인조인간 18호', maxHP: 20000 },
    { name: '트랭크스', maxHP: 13000 },
    // B
    { name: '천진반', maxHP: 10000 },
    { name: '크리링', maxHP: 9000 },
    { name: '피콜로', maxHP: 11000 },
    // C
    { name: '무천도사', maxHP: 7000 },
    { name: '미스터 사탄', maxHP: 8000 },
    { name: '야무치', maxHP: 7000 },
    { name: '피콜로 대마왕', maxHP: 6000 },
    // 각성
    { name: '수퍼 부우', maxHP: 27000 },
    { name: '순수악 부우', maxHP: 30000 },
    { name: '베지터 초사이어인 1', maxHP: 22000 },
    { name: '마인 베지터', maxHP: 28000 },
    { name: '셀 제2형태', maxHP: 24000 },
    { name: '셀 제3형태', maxHP: 30000 },
    { name: '손오공 초사이어인 1', maxHP: 21000 },
    { name: '손오공 초사이어인 2', maxHP: 26000 },
    { name: '손오공 초사이어인 3', maxHP: 32000 },
    { name: '손오반 초사이어인 1', maxHP: 23000 },
    { name: '손오반 초사이어인 2', maxHP: 27000 },
    { name: '오천크스 초사이어인 1', maxHP: 27000 },
    { name: '오천크스 초사이어인 최종', maxHP: 31000 },
    { name: '프리저 제2형태', maxHP: 19000 },
    { name: '프리저 제3형태', maxHP: 23000 },
    { name: '프리저 최종 형태', maxHP: 27000 },
    { name: '손오천 초사이어인 1', maxHP: 21000 },
    { name: '트랭크스 초사이어인 1', maxHP: 21000 },
    { name: '천진반 극대화', maxHP: 15000 },
    { name: '크리링 잠재력 해방', maxHP: 12000 },
    { name: '크리링 각성', maxHP: 14000 },
    { name: '나메크 피콜로', maxHP: 14000 },
    { name: '신 피콜로', maxHP: 17000 },
    { name: '무천도사 각성', maxHP: 10000 },
    { name: '야무치 각성', maxHP: 11000 },
  ];

  //   private readonly logger = new Logger(FightService.name);

  // 우리팀 HP
  private myTeamHp: string | null = null;
  // 팀 프사
  private myTeamProfileImg: string;

  // 현재 캐릭터 스킬
  private mySkills: BattleSkill[] = [];
  private myDefeatStar: number | null = null;

  // 쿠키
  private readonly cookieJar = new CookieJar();

  // 로그인된 Axios 인스턴스
  private client: AxiosInstance | null = null;

  private running = false;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  private runId = 0;

  private latestFighters: RankedFighter[] = [];
  private lastUpdated: string | null = null;
  private lastError: string | null = null;

  // 크롤링 간격: 1초
  private readonly POLL_MS = 1000;

  // 최대 실행 시간: 12분
  private readonly MAX_DURATION_MS = 12 * 60 * 1000;

  // ------------------------------------
  // 1. Axios 및 쿠키 저장소 생성
  // ------------------------------------
  private createClient(): AxiosInstance {
    return axios.create({
      httpAgent: new HttpCookieAgent({
        cookies: { jar: this.cookieJar },
      }),
      httpsAgent: new HttpsCookieAgent({
        cookies: { jar: this.cookieJar },
      }),
      timeout: 10000,
      maxRedirects: 5,
      responseType: 'text',
    });
  }

  // ------------------------------------
  // 2. 사이트 로그인
  // ------------------------------------

  async login(teamNo: string, password: string) {
    if (this.running) {
      throw new ConflictException(
        '크롤링 실행 중에는 다시 로그인할 수 없습니다.',
      );
    }

    // 1. 세션 쿠키를 관리할 Axios 인스턴스 생성
    const client = this.createClient();

    // 2. 로그인 페이지 접속 (초기 세션 쿠키 수신)
    // await client.get(LOGIN_URL_GET);

    // 3. 실제 사이트의 로그인 Payload 구성
    const data = new URLSearchParams();
    data.set('team', teamNo);
    data.set('code', password);

    // 4. 로그인 POST 요청
    const response = await client.post(LOGIN_URL_POST, data.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      validateStatus: () => true,
    });

    // 응답 데이터 확인
    const responseData =
      typeof response.data === 'string'
        ? JSON.parse(response.data)
        : response.data;

    console.log('응답 필드:', Object.keys(responseData));
    console.log(
      '오류 메시지:',
      responseData.error ??
        responseData.message ??
        responseData.msg ??
        '(응답 데이터를 직접 확인하세요)',
    );

    if (response.status >= 400) {
      throw new Error(`로그인 실패: HTTP ${response.status}`);
    }

    // 5. 로그인된 세션으로 대전 페이지 접근
    const response1 = await client.get<string>(BATTLE_URL);

    const $ = cheerio.load(response1.data);

    // 6. 로그인 성공 여부 확인
    if (!$('.arena .fighter[data-team]').length) {
      throw new UnauthorizedException('로그인 실패 또는 대전 페이지 접근 불가');
    }

    // 7. 로그인된 Axios 인스턴스 보관
    this.client = client;

    return {
      success: true,
      message: '로그인 성공',
    };
  }

  // ------------------------------------
  // 3. HTML에서 캐릭터 정보 추출
  // ------------------------------------
  async getFighters(): Promise<Fighter[]> {
    if (!this.client) {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }

    // 로그인된 세션으로 HTML 요청
    const response = await this.client.get<string>(BATTLE_URL, {
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    const $ = cheerio.load(response.data);

    const cardsJson = $('#homeApp').attr('data-cards');

    // if (cardsJson) {
    //   const cards = JSON.parse(cardsJson) as Array<{
    //     deployed: boolean;
    //     hp: number;
    //     max_hp: number;
    //     card_img: string;
    //   }>;

    //   const myCard = cards.find((card) => card.deployed);

    //   this.myTeamHp = myCard ? `${myCard.hp} / ${myCard.max_hp}` : null;

    //   // 프로필 이미지
    //   // 우리 팀 출전 캐릭터 얼굴 이미지
    //   this.myTeamProfileImg = myCard?.card_img
    //     ? new URL(`img/face/${encodeURIComponent(myCard.card_img)}`, BATTLE_URL)
    //         .href
    //     : null;
    // }

    if (cardsJson) {
      const cards = JSON.parse(cardsJson) as Array<{
        deployed: boolean;
        hp: number;
        max_hp: number;
        card_img: string;
        defeat_star: number;
        skills: BattleSkill[];
      }>;

      // 우리 팀에서 출전 중인 카드
      const myCard = cards.find((card) => card.deployed === true);

      // 기존 HP 저장
      this.myTeamHp = myCard ? `${myCard.hp} / ${myCard.max_hp}` : null;

      // 프로필 이미지
      // 우리 팀 출전 캐릭터 얼굴 이미지
      this.myTeamProfileImg = myCard?.card_img
        ? new URL(`img/face/${encodeURIComponent(myCard.card_img)}`, BATTLE_URL)
            .href
        : null;

      // 처치 시 상대가 획득하는 별
      this.myDefeatStar = myCard?.defeat_star ?? null;

      // 출전 캐릭터의 스킬 목록
      this.mySkills = myCard?.skills
        ? [...myCard.skills].sort((a, b) => a.slot - b.slot)
        : [];
    } else {
      this.myTeamHp = null;
      this.myTeamProfileImg = null;
      this.myDefeatStar = null;
      this.mySkills = [];
    }

    const elements = $('.arena .fighter[data-team]');

    if (!elements.length) {
      throw new UnauthorizedException('세션 만료 또는 대전 HTML 확인 실패');
    }

    const fighters: Fighter[] = [];

    elements.each((_, element) => {
      const fighter = $(element);

      const img = fighter.find('.fighter-img');

      const imgUrl =
        'https://www.gjyouthgroup.kr/complete26/' + img.attr('src');

      const teamName = fighter.find('.fighter-name').text().trim();

      const characterName = img.attr('data-name') ?? null;

      fighters.push({
        teamName,
        characterName,
        imgUrl,
      });
    });

    return fighters;
  }

  async getRankedFighters(): Promise<RankedFighter[]> {
    // 크롤링한 출전 캐릭터 정보
    const fighters = await this.getFighters();

    // 캐릭터 이름으로 HP 조회
    const result = fighters.map((f) => {
      const characters = this.character.find((c) => c.name === f.characterName);

      return {
        teamName: f.teamName,
        characterName: f.characterName,
        maxHP: characters?.maxHP ?? null,
        imgUrl: f.imgUrl,
      };
    });

    // HP가 낮은 순으로 정렬
    result.sort((a, b) => {
      if (a.maxHP === null) return 1;
      if (b.maxHP === null) return -1;

      return a.maxHP - b.maxHP;
    });

    return result;
  }

  // ------------------------------------
  // 1. 크롤링 시작
  // ------------------------------------
  startPolling() {
    if (!this.client) {
      throw new UnauthorizedException('먼저 /admin에서 로그인해야 합니다.');
    }

    if (this.running) {
      return {
        running: true,
        message: '이미 크롤링 중입니다.',
      };
    }

    this.running = true;

    this.latestFighters = [];
    this.lastUpdated = null;
    this.lastError = null;

    const currentRun = ++this.runId;

    // 10분 후 자동 중지
    this.stopTimer = setTimeout(() => {
      this.stopPolling();
    }, this.MAX_DURATION_MS);

    // 첫 크롤링 즉시 실행
    void this.poll(currentRun);

    return {
      running: true,
      message: '크롤링 시작',
    };
  }

  // ------------------------------------
  // 2. 1초 간격 크롤링
  // ------------------------------------
  private async poll(runId: number): Promise<void> {
    if (!this.running || runId !== this.runId) {
      return;
    }

    try {
      // 기존 HTML 크롤링 + HP 매칭 메서드
      const fighters = await this.getRankedFighters();

      // 요청 중 중지되었다면 결과를 반영하지 않음
      if (!this.running || runId !== this.runId) {
        return;
      }

      // 최신 결과 저장
      this.latestFighters = fighters;
      this.lastUpdated = new Date().toISOString();
      this.lastError = null;
    } catch (error) {
      if (this.running && runId === this.runId) {
        if (axios.isAxiosError(error)) {
          console.error('요청 URL:', error.config?.url);
          console.error('HTTP 상태:', error.response?.status);
          console.error('응답 데이터:', error.response?.data);
          console.error('오류 메시지:', error.message);
        } else {
          console.error('크롤링 오류:', error);
        }

        this.lastError = '크롤링 요청에 실패했습니다.';
      }
    } finally {
      if (this.running && runId === this.runId) {
        // 이전 요청 완료 후 1초 뒤 재실행
        this.timer = setTimeout(() => {
          void this.poll(runId);
        }, this.POLL_MS);
      }
    }
  }

  // ------------------------------------
  // 3. 크롤링 중지
  // ------------------------------------
  stopPolling() {
    this.running = false;
    this.runId++;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
    }

    this.timer = null;
    this.stopTimer = null;

    // 중요!
    // this.client = null; 을 실행하지 않습니다.
    // 로그인 세션을 유지해야 다시 시작할 수 있습니다.

    return {
      running: false,
      message: '크롤링 중지',
    };
  }

  // ------------------------------------
  // 4. 크롤링 상태 및 결과 조회
  // ------------------------------------
  getStatus() {
    return {
      running: this.running,
      lastUpdated: this.lastUpdated,
      lastError: this.lastError,
      fighters: this.latestFighters,
      myTeamHp: this.myTeamHp,
      profileImg: this.myTeamProfileImg,
      myDefeatStar: this.myDefeatStar,
      mySkills: this.mySkills,
    };
  }
}
