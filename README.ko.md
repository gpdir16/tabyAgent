[English](README.md) | 한국어

# tabyAgent

TabyAgent는 OpenClaw/Hermes의 더 가볍고 쉬운 대안입니다.

Docker 안에서 자율적으로 작동하며, Telegram으로 대화할 수 있습니다.

## 할 수 있는 것

- **일상적인 채팅**: 메시지를 보내면 텔레그램에서 바로 답변을 받습니다. 텍스트, 이미지, 파일 모두 지원합니다.
- **추론 제공자 연결**: OpenAI, OpenRouter, 또는 직접 구축한 API 엔드포인트와 연동합니다.
- **Skills, MCP**: 웹 브라우징, 예약 작업 등 다양한 기능을 추가할 수 있습니다.
- **예약 작업**: 정기적으로 실행할 작업을 설정하면 자동으로 실행 결과를 보고합니다.
- **어디서든 실행**: 가벼운 단일 Docker 컨테이너로 어떤 기기든 실행할 수 있습니다.

## 빠른 시작

### 1. Telegram 봇 만들기

1. Telegram에서 [@BotFather](https://t.me/botfather)를 검색하세요.
2. `/newbot`을 보내고 안내에 따라 진행하세요.
3. 받은 봇 토큰을 복사해두세요.

### 2. 설치 (Linux / macOS)

터미널에 아래 한 줄을 붙여넣고 Enter를 누르세요. 설치가 진행된 후 1단계에서 복사한 **BotFather가 보내준 토큰**을 붙여넣으라고 안내가 나옵니다. 이어서 PC 폴더를 연결할지 묻습니다. 기본값은 **아니오**입니다.

설치 중에 Docker를 설치하라는 안내가 나오면 y를 눌러 설치하세요. tabyAgent가 작동하려면 Docker가 필요합니다. 자동 설치는 macOS와 Linux에서만 지원됩니다.

```bash
curl -fsSL https://raw.githubusercontent.com/gpdir16/tabyAgent/main/scripts/install.sh | bash
```

설치가 끝나면 Telegram에서 봇에게 `/start`를 보내면 됩니다. 나중에 tabyAgent를 업데이트하려면 **같은 명령을 다시** 실행하세요. 설정과 메모리는 지워지지 않습니다.

### 3. Telegram에서 설정

1. Telegram에서 만든 봇을 열고 `/start`를 보내세요. 처음 메시지를 보낸 사람은 자동으로 승인됩니다.
2. 설정 마법사가 언어, LLM 제공자, API 키, 모델을 안내합니다.
3. 설정이 끝나면 바로 대화를 시작할 수 있습니다.

언제든 `/config`를 보내 설정을 변경할 수 있습니다.

## 소스에서 실행 (Docker Compose)

```bash
git clone https://github.com/gpdir16/tabyAgent.git
cd tabyAgent
cp .env.example .env   # TELEGRAM_BOT_TOKEN 설정
docker compose up -d
```

PC 폴더를 연결하려면 (선택, 기본 없음):

```bash
echo 'HOST_WORKSPACE=/absolute/path/to/your/project' >> .env
docker compose -f docker-compose.yml -f docker-compose.workspace.yml up -d
```

연결 시 컨테이너 `/workspace`에 마운트됩니다. 기본 작업은 `/app/user`이고, PC에서 보이는 파일을 다룰 때만 `/workspace`를 씁니다.

코드를 받은 뒤 이미지를 다시 빌드할 때:

```bash
docker compose up -d --build
```

## 봇 명령어

| 명령어            | 설명                                                               |
| ----------------- | ------------------------------------------------------------------ |
| `/start`          | 봇 시작 또는 첫 실행인 경우 설정 마법사 열기                       |
| `/config`         | 설정 마법사 열기                                                   |
| `/new`            | 새 대화 시작 (5턴 이상이면 memory.md에 요약 저장 후 기록 삭제)     |
| `/stop`           | 진행 중인 작업 중지 (진행 중 보낸 메시지는 현재 작업에 반영)       |
| `/reload`         | MCP 도구 다시 불러오기 (Skills은 reload 필요 없음)                 |
| `/approve <코드>` | 승인된 사용자가 다른 사람의 접근 코드 승인 (기존 사용자 연결 해제) |

## 요구사항

- Docker
- Telegram 봇 토큰 (BotFather)
- 추론 제공자 API 키

## 라이선스

AGPL-3.0
