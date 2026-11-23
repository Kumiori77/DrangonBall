// 우리 팀 이름
const MY_TEAM_NAME = '예수님과퓨전';

const profileImg = document.getElementById('profileImg');
const myTeamHp = document.getElementById('myTeamHp');
const myTeamMaxHp = document.getElementById('myTeamMaxHp');
const hpBar = document.getElementById('hpBar');
const hpPercent = document.getElementById('hpPercent');
const hpProgress = document.getElementById('hpProgress');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

const statusText = document.getElementById('statusText');
const updatedAt = document.getElementById('updatedAt');
const message = document.getElementById('message');

const rankingTable = document.getElementById('rankingTable');
const rankingBody = document.getElementById('rankingBody');
const emptyMessage = document.getElementById('emptyMessage');

const myDefeatStar = document.getElementById('myDefeatStar');
const mySkillList = document.getElementById('mySkillList');

let statusTimer = null;
let statusPending = false;
let actionPending = false;
let running = false;

// HP 변동 확인
// 이전 크롤링의 현재 HP
let previousCurrentHp = null;

// 이전 크롤링 결과의 갱신 시각
let previousSampleAt = null;

const myTeamStatus = document.querySelector('.my-team-status');

// ------------------------------------
// 1. API 요청 공통 함수
// ------------------------------------
async function request(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
  });

  const result = await response.json();

  if (!response.ok) {
    const errorMessage = Array.isArray(result.message)
      ? result.message.join(', ')
      : result.message || '요청 실패';

    throw new Error(errorMessage);
  }

  return result;
}

// ------------------------------------
// 2. 버튼 상태 갱신
// ------------------------------------
function updateButtons() {
  startBtn.disabled = actionPending || running;
  stopBtn.disabled = actionPending || !running;
}

// ------------------------------------
// 3. 출전 캐릭터 목록 표시
// ------------------------------------
function renderFighters(fighters) {
  const fragment = document.createDocumentFragment();

  const sorted = [...fighters].sort((a, b) => {
    if (a.maxHP == null) return b.maxHP == null ? 0 : 1;
    if (b.maxHP == null) return -1;
    return a.maxHP - b.maxHP;
  });

  sorted.forEach((fighter, index) => {
    const tr = document.createElement('tr');

    // 순위
    const rankTd = document.createElement('td');
    rankTd.textContent = index + 1;

    // 팀 이름
    const teamTd = document.createElement('td');
    teamTd.textContent = fighter.teamName;

    // 우리 팀인 경우
    if (fighter.teamName === MY_TEAM_NAME) {
      teamTd.classList.add('my-team');

      const badge = document.createElement('span');
      badge.className = 'my-team-badge';
      badge.textContent = 'MY TEAM';

      teamTd.appendChild(badge);
    }

    // 캐릭터 이미지 + 이름
    const characterTd = document.createElement('td');

    const characterBox = document.createElement('div');
    characterBox.className = 'character-box';

    if (fighter.imgUrl) {
      const img = document.createElement('img');

      img.src = fighter.imgUrl;
      img.alt = fighter.characterName ?? '캐릭터';
      img.className = 'character-img';
      img.loading = 'lazy';

      img.onerror = () => {
        img.remove();
      };

      characterBox.appendChild(img);
    }

    const name = document.createElement('span');
    name.textContent = fighter.characterName ?? '출전 없음';

    characterBox.appendChild(name);
    characterTd.appendChild(characterBox);

    // 최대 HP
    const hpTd = document.createElement('td');

    hpTd.textContent =
      fighter.maxHP == null ? '미등록' : fighter.maxHP.toLocaleString();

    // 테이블 행 완성
    tr.append(rankTd, teamTd, characterTd, hpTd);

    fragment.appendChild(tr);
  });

  rankingBody.replaceChildren(fragment);

  const hasData = sorted.length > 0;

  rankingTable.hidden = !hasData;
  emptyMessage.hidden = hasData;
}

// ------------------------------------
// 4. 서버 상태를 화면에 반영
// ------------------------------------
function renderStatus(data) {
  running = data.running;

  // 우리 팀 프로필 이미지 및 HP 표시
  renderMyTeam(data);

  // 신규 스킬 정보
  renderMySkills(data);

  statusText.textContent = running ? '● 크롤링 중' : '● 중지됨';

  if (data.lastUpdated) {
    const date = new Date(data.lastUpdated);

    updatedAt.textContent = '마지막 갱신: ' + date.toLocaleTimeString('ko-KR');
  } else {
    updatedAt.textContent = '마지막 갱신: -';
  }

  renderFighters(data.fighters || []);

  if (data.lastError) {
    message.textContent = data.lastError;
  } else {
    message.textContent = running ? '실시간 데이터를 수집하고 있습니다.' : '';
  }

  updateButtons();

  if (running) {
    startStatusPolling();
  } else {
    stopStatusPolling();
  }
}

// ------------------------------------
// 5. 최신 결과 가져오기
// ------------------------------------
async function loadStatus() {
  // 요청 중복 방지
  if (statusPending) return;

  statusPending = true;

  try {
    const data = await request('/fight/status');

    renderStatus(data);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    statusPending = false;
  }
}

// ------------------------------------
// 6. 프론트엔드 자동 갱신 시작
// ------------------------------------
function startStatusPolling() {
  if (statusTimer !== null) return;

  statusTimer = setInterval(() => {
    void loadStatus();
  }, 1000);
}

// ------------------------------------
// 7. 프론트엔드 자동 갱신 중지
// ------------------------------------
function stopStatusPolling() {
  if (statusTimer !== null) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
}

// ------------------------------------
// 8. 크롤링 시작 버튼
// ------------------------------------
startBtn.addEventListener('click', async () => {
  if (actionPending) return;

  actionPending = true;
  updateButtons();

  try {
    await request('/fight/start', {
      method: 'POST',
    });

    running = true;
    message.textContent = '크롤링을 시작했습니다.';

    startStatusPolling();
    await loadStatus();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    actionPending = false;
    updateButtons();
  }
});

// ------------------------------------
// 9. 크롤링 중지 버튼
// ------------------------------------
stopBtn.addEventListener('click', async () => {
  if (actionPending) return;

  actionPending = true;
  updateButtons();

  try {
    await request('/fight/stop', {
      method: 'POST',
    });

    running = false;
    stopStatusPolling();

    await loadStatus();

    message.textContent = '크롤링이 중지되었습니다.';
  } catch (error) {
    message.textContent = error.message;
  } finally {
    actionPending = false;
    updateButtons();
  }
});

// ------------------------------------
// 10. 처음 페이지 접속 시 상태 조회
// ------------------------------------
void loadStatus();

function renderMyTeam(data) {
  // 1. 프로필 이미지
  if (data.profileImg) {
    if (profileImg.getAttribute('src') !== data.profileImg) {
      profileImg.src = data.profileImg;
    }

    profileImg.hidden = false;
  } else {
    profileImg.removeAttribute('src');
    profileImg.hidden = true;
  }

  // 2. "75/100" 형식의 HP 문자열 분리
  const hpText = data.myTeamHp;

  const match =
    typeof hpText === 'string'
      ? hpText.match(/^\s*([\d,]+)\s*\/\s*([\d,]+)\s*$/)
      : null;

  if (!match) {
    myTeamHp.textContent = '-';
    myTeamMaxHp.textContent = '-';
    hpBar.style.width = '0%';
    hpPercent.textContent = '-';

    hpProgress.removeAttribute('aria-valuenow');
    hpProgress.removeAttribute('aria-valuemax');

    // HP 변동 확인
    myTeamStatus.classList.remove('hp-warning');
    previousCurrentHp = null;
    previousSampleAt = null;

    return;
  }

  const currentHP = Number(match[1].replace(/,/g, ''));
  const maxHP = Number(match[2].replace(/,/g, ''));

  // HP 변동 확인
  if (!data.lastUpdated) {
    // 크롤링 시작 전 또는 데이터 초기화
    previousCurrentHp = null;
    previousSampleAt = null;

    myTeamStatus.classList.remove('hp-warning');
  } else if (data.lastUpdated !== previousSampleAt) {
    // 이전 HP보다 현재 HP가 감소했는지 확인
    const hpDecreased =
      previousCurrentHp !== null && currentHP < previousCurrentHp;

    // 감소했을 때만 경고색 적용
    myTeamStatus.classList.toggle('hp-warning', hpDecreased);

    // 현재 HP를 다음 비교를 위해 저장
    previousCurrentHp = currentHP;
    previousSampleAt = data.lastUpdated;
  }

  // 3. 현재 HP / 최대 HP 표시
  myTeamHp.textContent = currentHP.toLocaleString();
  myTeamMaxHp.textContent = maxHP.toLocaleString();

  // 4. HP 비율 계산
  const percent =
    maxHP > 0 ? Math.max(0, Math.min(100, (currentHP / maxHP) * 100)) : 0;

  // 5. 게이지 반영
  hpBar.style.width = `${percent}%`;
  hpPercent.textContent = `${Math.round(percent)}%`;

  hpProgress.setAttribute('aria-valuenow', String(currentHP));
  hpProgress.setAttribute('aria-valuemax', String(maxHP));

  // 6. HP 비율에 따른 색상 변경
  let color;

  if (percent <= 25) {
    color = '#ef4444'; // 빨강
  } else if (percent <= 50) {
    color = '#f59e0b'; // 주황
  } else {
    color = '#22c55e'; // 초록
  }

  hpBar.style.backgroundColor = color;
  myTeamHp.style.color = color;
}

// skills 조회 함수

let previousSkillsJson = null;

function renderMySkills(data) {
  const skills = Array.isArray(data.mySkills) ? data.mySkills : [];

  const defeatStar = data.myDefeatStar;

  // 이전 데이터와 동일하면 다시 렌더링하지 않음
  const json = JSON.stringify({ skills, defeatStar });

  if (json === previousSkillsJson) return;
  previousSkillsJson = json;

  // 처치 시 상대 획득 별
  myDefeatStar.textContent =
    defeatStar == null ? '-' : Number(defeatStar).toLocaleString();

  const fragment = document.createDocumentFragment();

  if (skills.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'skill-empty';
    empty.textContent = '출전 스킬 정보가 없습니다.';

    mySkillList.replaceChildren(empty);
    return;
  }

  const sorted = [...skills].sort((a, b) => a.slot - b.slot);

  sorted.forEach((skill) => {
    const row = document.createElement('div');
    row.className = 'skill-row';

    // 상 / 중 / 하
    const tier = document.createElement('span');
    tier.className = 'skill-tier';

    if (skill.power === '상') {
      tier.classList.add('tier-high');
    } else if (skill.power === '중') {
      tier.classList.add('tier-middle');
    } else {
      tier.classList.add('tier-low');
    }

    tier.textContent = skill.power;

    // 스킬 이름 및 소모량
    const info = document.createElement('div');
    info.className = 'skill-info';

    const name = document.createElement('strong');
    name.className = 'skill-name';
    name.textContent = skill.name;

    const cost = document.createElement('div');
    cost.className = 'skill-cost';

    cost.textContent =
      `★ 별 ${Number(skill.star_cost).toLocaleString()} · ` +
      `HP ${Number(skill.hp_cost).toLocaleString()}`;

    info.append(name, cost);

    // 데미지
    const damage = document.createElement('div');
    damage.className = 'skill-damage';

    const damageLabel = document.createElement('span');
    damageLabel.textContent = '데미지';

    const damageValue = document.createElement('strong');
    damageValue.textContent = Number(skill.damage).toLocaleString();

    damage.append(damageLabel, damageValue);

    row.append(tier, info, damage);
    fragment.appendChild(row);
  });

  mySkillList.replaceChildren(fragment);
}
