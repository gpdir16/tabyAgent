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

### 2. Docker로 실행

```bash
# 저장소 클론
git clone https://github.com/gpdir16/tabyAgent.git
cd tabyAgent

# .env 파일 생성
cp .env.example .env
# .env 파일을 열어 봇 토큰을 붙여넣으세요:
# TELEGRAM_BOT_TOKEN=your_bot_token_here

# 컨테이너 시작
docker compose up -d
```

### 3. Telegram에서 설정

1. Telegram에서 만든 봇을 열고 `/start`를 보내세요. 처음 메시지를 보낸 사람은 자동으로 승인됩니다.
2. 설정 마법사가 다음을 안내합니다:
    - 언어 선택 (한국어, 영어, 일본어)
    - LLM 제공자 선택
    - API 키 입력
    - 모델 선택
3. 설정이 끝나면 바로 대화를 시작할 수 있습니다.

언제든 `/config`를 보내 설정을 변경할 수 있습니다.

## 봇 명령어

| 명령어            | 설명                                                               |
| ----------------- | ------------------------------------------------------------------ |
| `/start`          | 봇 시작 또는 첫 실행인 경우 설정 마법사 열기                       |
| `/config`         | 설정 마법사 열기                                                   |
| `/reload`         | MCP 도구 다시 불러오기 (Skills은 reload 필요 없음)                 |
| `/approve <코드>` | 승인된 사용자가 다른 사람의 접근 코드 승인 (기존 사용자 연결 해제) |

## 요구사항

- Docker
- Telegram 봇 토큰 (BotFather)
- 추론 제공자 API 키

## 라이선스

AGPL-3.0
