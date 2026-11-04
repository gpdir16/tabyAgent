[English](README.md) | 한국어

# tabyAgent

OpenClaw/Hermes보다 더 자율적이고, 더 끈기 있고, 더 쉬운 대안입니다.

작업을 시키면 몇 시간이 걸리든 문제가 생기든 수행합니다.

메모리, 스킬, 자기개선, 예약 작업, 할 일 목록, 웹 브라우징, GUI 앱 사용, 멀티 에이전트 등의 기능이 기본적으로 작동하며 추가 설정이 필요하지 않습니다.

> [!IMPORTANT]
> **tabyAgent는 더 이상 활발히 개발되지 않습니다.** 앞으로는 유지보수만 가끔 진행할것이며 새로운 기능 추가는 없을 예정입니다.
>
> - **꼭 텔레그램 봇으로 사용해야한다면:** 지금처럼 tabyAgent를 계속 사용하거나, Hermes처럼 활발히 업데이트되는 텔레그램 에이전트를 사용하세요.
> - **그렇지 않고 웹 UI를 사용해도 괜찮은 경우:** tabyBot으로 이주하세요. 봇에 `/migrate`를 보내 생성된 패키지를 tabyBot에 업로드하면 됩니다. 자세한 방법은 [tabyBot으로 이주](#tabybot으로-이주)를 참고하세요.

## 할 수 있는 것

- **일상적인 채팅**: 텔레그램에서 바로 답변을 받습니다. 텍스트와 이미지, 파일 등 거의 모든 형식을 지원합니다.
- **추론 제공자 연결**: OpenAI, OpenRouter, Upstage, OrcaRouter, Synthetic, Ollama(로컬 & Cloud), ZenMux, OpenCode Go, Codex OAuth, Grok OAuth, GitHub Copilot OAuth, Claude OAuth(Pro/Max) 또는 직접 구축한 API 엔드포인트와 연동합니다.
- **Skills, MCP**: 에이전트에게 원하는 다양한 기능과 도구를 추가할 수 있습니다. 직접 설치시키지 않더라도 에이전트가 필요한 것을 알아서 찾아 설치합니다.
- **예약 작업**: 정기적으로 실행이 필요한 작업이 있다면 반복해서 실행되며 완료 후에는 보고하거나, 필요하지 않다면 건너뜁니다.
- **할 일 목록**: 사용자와 에이전트 모두의 할 일 목록을 관리합니다. 사용자는 `/todo` 명령어나 채팅의 버튼으로 일반 Todo 앱처럼 사용하고, 에이전트는 자동으로 목록을 감시하며, 예약하고, 사용자의 할 일을 대신 처리하여 사용자의 일을 돕습니다.
- **여러 에이전트**: 전문 역할별 에이전트를 만들고 협업시킬 수 있습니다. 각 에이전트는 자기 메모리, 페르소나, 텔레그램 토픽을 가집니다.
- **어디서든 실행**: Docker 컨테이너 또는 로컬 Node.js로 실행할 수 있습니다. 네이티브 지원은 macOS와 Linux이며, Windows는 Docker를 통해 작동 가능하지만 보장되지는 않습니다.
- **자기 개선**: tabyAgent는 문제를 해결한 방법과 사용자의 지적을 학습합니다. 또한 평소에 하던 일을 까먹고 하지 않으면 학습해 두었다가 알려주기도 합니다.
- **시크릿 금고**: 비밀번호와 API 키를 암호화된 금고에 보관합니다. 에이전트는 값을 보지 않은 채로 사용하고, 새로 필요하면 채팅으로 요청한 뒤 사용자가 보낸 메시지를 바로 지웁니다.
- **효율적인 운영**: 잠깐 쉬는 동안 이득일 때만 프롬프트 캐시를 유지하고, 날짜·모델별 토큰 사용량과 캐시 적중률을 보여줍니다.

## 차이점

- tabyAgent와 tabyBot의 차이점: (1) tabyAgent는 텔레그램에서 작동하며 [tabyBot](https://github.com/gpdir16/tabyBot)은 자체 웹 UI에서 작동합니다. (2) tabyBot은 활발히 개발되는 반면 tabyAgent는 유지보수 단계로, 업데이트가 거의 없을 예정입니다. (3) 두 프로젝트는 같은 코어를 공유하지만 새 기능과 개선은 tabyBot에 먼저 적용됩니다.

| 기능              | tabyAgent                    | Grok Bot            | OpenClaw     | Hermes       | ChatGPT (Chat) |
| ----------------- | ---------------------------- | ------------------- | ------------ | ------------ | -------------- |
| 일상 채팅         | ✅ 예                        | ✅ 예               | ✅ 예        | ✅ 예        | ✅ 예          |
| 다중 에이전트     | ✅ 예                        | ✅ 예               | ✅ 예        | ✅ 예        | ❌ 아니요      |
| 검색              | ✅ 예                        | ✅ 예               | ✅ 예        | ✅ 예        | ✅ 예          |
| 여러 제공자 지원  | ✅ 예                        | ❌ 아니요           | ✅ 예        | ✅ 예        | ❌ 아니요      |
| 지능적 할 일 목록 | ✅ 사용자, 에이전트          | ❌ 아니요           | ❌ 아니요    | ❌ 아니요    | ❌ 아니요      |
| 원격 컴퓨터 제어  | ✅ 브라우저, 파일, 터미널    | ✅ 브라우저, 터미널 | ❌ 아니요    | ❌ 아니요    | ❌ 아니요      |
| 먼저 말 걸어주기  | ✅ 예                        | ❌ 아니요           | ❌ 아니요    | ❌ 아니요    | ❌ 아니요      |
| 스킬 지원         | ✅ 예                        | ✅ 예               | ✅ 예        | ✅ 예        | ❌ 아니요      |
| MCP 지원          | ✅ 예                        | ✅ 예               | ✅ 예        | ✅ 예        | ✅ 개발자 모드 |
| 예약 작업         | ✅ 예                        | ✅ 예               | ✅ 예        | ✅ 예        | ✅ 예          |
| 자기 개선         | ✅ 예                        | ✅ 예               | ✅ 예        | ✅ 예        | ❌ 아니요      |
| 터미널 사용       | ✅ 예                        | ✅ 예               | ✅ 예        | ✅ 예        | ❌ 샌드박스만  |
| 브라우저 사용     | ✅ 예                        | ✅ 예               | ✅ 예        | ✅ 예        | ❌ 아니요      |
| GUI 앱 제어       | ✅ 예                        | ✅ 예               | ✅ 예        | ✅ 예        | ❌ 아니요      |
| 로컬 실행         | ✅ 예                        | ❌ 아니요           | ✅ 예        | ✅ 예        | ❌ 아니요      |
| NSFW 레벨 설정    | ✅ 허용, 간접적 허용만, 차단 | ❌ 기능 없음        | ❌ 기능 없음 | ❌ 기능 없음 | ❌ 차단        |
| 라이선스          | ✅ AGPL-3.0                  | ❌ 독점             | ✅ MIT       | ✅ MIT       | ❌ 독점        |

> 테스트시 Ollama Cloud 제공자와 Kimi-K2.6 모델을 사용했습니다.

## 사용 예시 프롬프트

- "디지털오션 저번달 청구액 얼마냐"
- "문서 폴더에 파일들 중에서 '보고서'라는 단어가 들어간 파일들 싹다 찾아서 요약해줘"
- "gemma4 e4b랑 e2b 성능 직접 이 컴에서 돌려서 테스트한다음에 비교"
- "다음주 일정들 정리좀"
- "이 엑셀파일에서 매출 행 삭제하고 값 들어간 열에는 색 강조해줘"
- "chatgpt 플러스 구독좀 대신 취소시켜줘"
- "(X/Reddit 등 링크) 이거 진짜 되는거임?"
- "(붙여넣은 긴 글) 요약"
- "나중에 너가 쓸수있게 내 이메일 계정 기억해둬 주소는 ()야"
- "전에 알려준 메일 계정으로 스포티파이 가입좀 해놔줘"
- "(논문 링크) 요거 쉽게 이해 가능하게 시각화해줘"
- "privatestater analytics랑 privatestater captcha 이거 구글 애널리틱스랑 리캡차랑 비교해줘"
- "프라이버시 존중하는 gmail 대안이 뭐가있지?"
- "좀이따 점심 뭐먹을까 통장에 4328원 있는데"
- "매일 아침 8시에 오늘 날씨랑 할 일 정리해서 보내줘"
- "(만화/채널 링크) 새거 올라오면 알려줘"
- "할 일 목록에 넣어둔 것 중에 네가 할 수 있는 건 알아서 처리해줘"
- "나 매일 밤 9시쯤 일본어 공부하는데, 까먹고 안 하면 찔러줘"
- "저번에 얘기했던 그거 뭐였더라"
- "번역 전문 봇 하나 만들어서 이 문서 통째로 번역시켜줘"
- "아까 한 거 틀렸어. 다음부터는 이렇게 해"
- "몇 시간 걸려도 되니까 이 폴더 사진들 전부 날짜별로 정리해줘"
- "퇴근 전에 오늘 한 일 요약해서 알려줘"

## 빠른 시작

### 설치 옵션 A: 자동 스크립트 사용

#### 1. 텔레그램 봇 생성

1. 텔레그램에서 [@BotFather](https://t.me/BotFather)와 대화를 시작하세요.
2. `/newbot`을 입력하고 지시를 따르세요.
3. 봇 토큰을 복사하세요.

#### 2. 설치 (Linux / macOS)

터미널에 아래 한 줄을 붙여넣고 엔터를 누르세요. 설치에 시간이 오래 걸릴 수 있으니 기다려 주세요.

Docker 또는 로컬 실행 방식을 선택할 수 있으며, 보안 및 격리를 위해 Docker를 권장합니다.

**요구사항.** Docker 실행을 선택하면 필요한 것을 모두 자동으로 설치합니다. 로컬 실행을 선택하면 Node.js 22 이상이 설치되어 있어야 합니다.

자동 스크립트는 Windows를 지원하지 않습니다. Windows를 사용 중이라면 메인 OS를 Linux 기반 배포판으로 전환하는 것을 고려해 보세요. 대부분의 경우 더 빠르고 프라이버시 친화적이며 자유가 보장됩니다.

```bash
curl -fsSL https://raw.githubusercontent.com/gpdir16/tabyAgent/main/scripts/install.sh | bash
```

나중에 tabyAgent를 업데이트하려면 위 명령을 다시 실행하세요. 설정과 메모리는 유지된 상태로 업데이트됩니다.

설치 스크립트는 인스턴스 관리용 `tabyagent` 명령어도 추가합니다: `tabyagent start`, `stop`, `restart`, `status`, `logs`, `approve`, `uninstall`.

#### 3. 텔레그램에서 설정

1. 새로 생성된 봇에 `/start`를 보내세요.
2. 설정 마법사가 언어, LLM 제공자, API 키, 모델을 안내합니다.
3. 설정이 끝나면 바로 대화를 시작할 수 있습니다.

언제든 `/config`로 언어, 모델, 사고 수준, 프로바이더 프로필 등을 변경할 수 있습니다. `/todo`로 공유 할 일 목록을, `/agents`로 추가 에이전트를 관리합니다.

### 설치 옵션 B: Docker Compose (권장하지 않음)

```bash
git clone https://github.com/gpdir16/tabyAgent.git
cd tabyAgent
cp .env.example .env # .env를 편집해 TELEGRAM_BOT_TOKEN을 설정하세요
docker compose up -d
```

## tabyBot으로 이주

tabyBot은 tabyAgent를 기반으로 만들어진 Grok Bot과 유사하지만 더 뛰어난 에이전트 프로그램이며 계속 활발히 개발되고 있습니다.

꼭 텔레그램 봇으로 사용해야하는 경우가 아니라면 tabyBot으로 마이그레이션하는것을 권장합니다.

1. [tabyBot](https://github.com/gpdir16/tabybot)을 설치하고 설정합니다.
2. 기존 tabyAgent 봇에 `/migrate`를 보내고, 생성된 마이그레이션 패키지를 내려받습니다.
3. "tabyBot" 에이전트에게 패키지를 첨부하고 마이그레이션을 요청하세요.

설정, 에이전트, 메모리, 할 일 목록 등의 데이터가 패키지에 포함됩니다.

> 주의: 패키지에는 프로바이더 API 키, OAuth 토큰, 대화 기록 등 민감한 정보가 포함될 수 있으니 마이그레이션이 끝나면 즉시 삭제하고 유출되지 않도록 각별히 조심해주세요. 시크릿 금고의 값(`secrets.json`)은 패키지에 포함되지 않으므로 tabyBot에서 다시 등록해야 합니다.

## 제3자 라이선스

| 프로젝트                       | 버전    | 라이선스         | 출처                                                                |
| ------------------------------ | ------- | ---------------- | ------------------------------------------------------------------- |
| grammy                         | 1.46.0  | MIT              | [저장소](https://github.com/grammyjs/grammY)                        |
| @modelcontextprotocol/sdk      | 1.30.0  | MIT              | [저장소](https://github.com/modelcontextprotocol/typescript-sdk)    |
| node-cron                      | 3.0.3   | ISC              | [저장소](https://github.com/node-cron/node-cron)                    |
| openai                         | 4.104.0 | Apache-2.0       | [저장소](https://github.com/openai/openai-node)                     |
| prettier                       | 3.8.3   | MIT              | [저장소](https://github.com/prettier/prettier)                      |
| @biomejs/biome                 | 2.5.15  | MIT / Apache-2.0 | [저장소](https://github.com/biomejs/biome)                          |
| @anthropic-ai/claude-agent-sdk | 0.3.296 | Proprietary      | [저장소](https://github.com/anthropics/claude-agent-sdk-typescript) |
| zod                            | 4.6.7   | MIT              | [저장소](https://github.com/colinhacks/zod)                         |
| camofox-browser                | 2.4.7   | MIT              | [저장소](https://github.com/redf0x1/camofox-browser)                |
| Camoufox                       | —       | MPL-2.0          | [저장소](https://github.com/daijro/camoufox)                        |
| Playwright                     | —       | Apache-2.0       | [저장소](https://github.com/microsoft/playwright)                   |

<details>
<summary>전이 의존성</summary>

- **Apache-2.0:** `@opentelemetry/api`, `openai`
- **BSD-2-Clause:** `json-schema-typed`, `webidl-conversions`
- **BSD-3-Clause:** `fast-uri`, `qs`
- **ISC:** `inherits`, `isexe`, `node-cron`, `once`, `setprototypeof`, `which`, `wrappy`, `zod-to-json-schema`
- **MIT:** `@anthropic-ai/sdk`, `@babel/runtime`, `@grammyjs/types`, `@hono/node-server`, `@modelcontextprotocol/sdk`, `@stablelib/base64`, `@types/node`, `@types/node-fetch`, `abort-controller`, `accepts`, `agentkeepalive`, `ajv`, `ajv-formats`, `asynckit`, `base64-js`, `body-parser`, `bytes`, `call-bind-apply-helpers`, `call-bound`, `combined-stream`, `content-disposition`, `content-type`, `cookie`, `cookie-signature`, `cors`, `cross-spawn`, `debug`, `delayed-stream`, `depd`, `dunder-proto`, `ee-first`, `encodeurl`, `es-define-property`, `es-errors`, `es-object-atoms`, `es-set-tostringtag`, `escape-html`, `etag`, `event-target-shim`, `eventsource`, `eventsource-parser`, `express`, `express-rate-limit`, `fast-deep-equal`, `finalhandler`, `form-data`, `form-data-encoder`, `formdata-node`, `forwarded`, `fresh`, `function-bind`, `get-intrinsic`, `get-proto`, `gopd`, `grammy`, `has-symbols`, `has-tostringtag`, `hasown`, `hono`, `http-errors`, `humanize-ms`, `iconv-lite`, `ip-address`, `ipaddr.js`, `is-promise`, `jose`, `json-schema-to-ts`, `json-schema-traverse`, `math-intrinsics`, `media-typer`, `merge-descriptors`, `mime-db`, `mime-types`, `ms`, `negotiator`, `node-domexception`, `node-fetch`, `object-assign`, `object-inspect`, `on-finished`, `parseurl`, `path-key`, `path-to-regexp`, `pkce-challenge`, `prettier`, `proxy-addr`, `range-parser`, `raw-body`, `require-from-string`, `router`, `safer-buffer`, `send`, `serve-static`, `shebang-command`, `shebang-regex`, `side-channel`, `side-channel-list`, `side-channel-map`, `side-channel-weakmap`, `standardwebhooks`, `statuses`, `toidentifier`, `tr46`, `ts-algebra`, `type-is`, `undici-types`, `unpipe`, `uuid`, `vary`, `web-streams-polyfill`, `whatwg-url`, `zod`
- **MIT / Apache-2.0:** `@biomejs/cli-darwin-arm64`, `@biomejs/cli-darwin-x64`, `@biomejs/cli-linux-arm64`, `@biomejs/cli-linux-arm64-musl`, `@biomejs/cli-linux-x64`, `@biomejs/cli-linux-x64-musl`, `@biomejs/cli-win32-arm64`, `@biomejs/cli-win32-x64`
- **Unlicense:** `fast-sha256`
- **Proprietary (Anthropic):** `@anthropic-ai/claude-agent-sdk-darwin-arm64`, `@anthropic-ai/claude-agent-sdk-darwin-x64`, `@anthropic-ai/claude-agent-sdk-linux-arm64`, `@anthropic-ai/claude-agent-sdk-linux-arm64-musl`, `@anthropic-ai/claude-agent-sdk-linux-x64`, `@anthropic-ai/claude-agent-sdk-linux-x64-musl`, `@anthropic-ai/claude-agent-sdk-win32-arm64`, `@anthropic-ai/claude-agent-sdk-win32-x64`

</details>

## 라이선스

AGPL-3.0
