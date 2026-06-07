#!/usr/bin/env bash
# tabyAgent — install or update via Docker (Linux / macOS)
set -euo pipefail

INSTALLER_URL_DEFAULT="https://raw.githubusercontent.com/gpdir16/tabyAgent/main/scripts/install.sh"

# curl | bash: stdin is the script pipe (EOF for read). Re-run from a temp file with stdin = terminal.
bootstrap_tty_installer() {
    if [ -n "${TABYAGENT_INSTALL_REEXEC:-}" ]; then
        return 0
    fi
    if [ -t 0 ]; then
        return 0
    fi
    # Piped install with token already set — no interactive stdin needed
    if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] || [ -n "${1:-}" ]; then
        return 0
    fi
    if [ ! -r /dev/tty ] 2>/dev/null; then
        echo "Error: This installer needs an interactive terminal." >&2
        echo "  TELEGRAM_BOT_TOKEN='your-token' curl -fsSL ${INSTALLER_URL_DEFAULT} | bash" >&2
        exit 1
    fi
    local url="${TABYAGENT_INSTALLER_URL:-${INSTALLER_URL_DEFAULT}}"
    local tmp
    tmp="$(mktemp -t tabyagent-install.XXXXXX.sh)"
    chmod 700 "${tmp}"
    if ! curl -fsSL "${url}" -o "${tmp}"; then
        rm -f "${tmp}"
        echo "Error: Could not download installer (${url})" >&2
        exit 1
    fi
    exec env TABYAGENT_INSTALL_REEXEC=1 bash "${tmp}" "$@" 0</dev/tty
}
bootstrap_tty_installer

REPO_OWNER="gpdir16"
IMAGE_DEFAULT="ghcr.io/${REPO_OWNER}/tabyagent:latest"
INSTALL_DIR="${TABYAGENT_HOME:-${HOME}/.tabyagent}"
COMPOSE_FILE="${INSTALL_DIR}/docker-compose.yml"
ENV_FILE="${INSTALL_DIR}/.env"

DOCKER_SHELL="docker"
TABYAGENT_LANG_RESOLVED=""

resolve_lang() {
    if [ -n "${TABYAGENT_LANG_RESOLVED}" ]; then
        return
    fi
    local lang="${TABYAGENT_LANG:-}"
    if [ -z "${lang}" ]; then
        case "${LANG:-${LC_ALL:-}}" in
            ko*|KO*) lang=ko ;;
            *) lang=en ;;
        esac
    fi
    case "${lang}" in
        ko|ko_KR|korean) TABYAGENT_LANG_RESOLVED=ko ;;
        *) TABYAGENT_LANG_RESOLVED=en ;;
    esac
}

is_ko() {
    resolve_lang
    [ "${TABYAGENT_LANG_RESOLVED}" = ko ]
}

usage() {
    cat <<EOF
Install or update tabyAgent.

  curl -fsSL ${INSTALLER_URL_DEFAULT} | bash

Optional:
  TELEGRAM_BOT_TOKEN='...' curl -fsSL ... | bash
  curl -fsSL ... | bash -s -- '1234567890:ABC...'
Language: TABYAGENT_LANG=ko|en  (default: en, or ko if LANG is Korean)
EOF
}

die() {
    if is_ko; then
        echo "오류: $*" >&2
    else
        echo "Error: $*" >&2
    fi
    exit 1
}

can_prompt_user() {
    [ -r /dev/tty ] 2>/dev/null || [ -t 0 ]
}

say_user() {
    if [ -w /dev/tty ] 2>/dev/null; then
        printf '%s\n' "$@" >/dev/tty
    else
        printf '%s\n' "$@"
    fi
}

read_user_line() {
    local __var_name="$1"
    local prompt="${2:-}"
    local line

    if [ -r /dev/tty ] 2>/dev/null; then
        [ -n "${prompt}" ] && printf '%s' "${prompt}" >/dev/tty
        IFS= read -r line </dev/tty
    elif [ -t 0 ]; then
        [ -n "${prompt}" ] && printf '%s' "${prompt}"
        IFS= read -r line
    else
        return 1
    fi
    printf -v "${__var_name}" '%s' "${line}"
}

die_need_token() {
    if is_ko; then
        die "봇 토큰이 필요합니다. 예:
  curl -fsSL ... | bash -s -- 'BotFather토큰'
  TELEGRAM_BOT_TOKEN='BotFather토큰' curl -fsSL ... | bash"
    else
        die "Bot token required. Examples:
  curl -fsSL ... | bash -s -- 'your-bot-token'
  TELEGRAM_BOT_TOKEN='your-bot-token' curl -fsSL ... | bash"
    fi
}

prompt_yes_no() {
    local prompt="$1"
    local default="${2:-y}"
    local hint reply

    if [ "${TABYAGENT_AUTO_INSTALL_DOCKER:-}" = "1" ]; then
        return 0
    fi
    if ! can_prompt_user; then
        return 1
    fi

    if [ "${default}" = y ]; then hint="Y/n"; else hint="y/N"; fi

    while true; do
        if ! read_user_line reply "${prompt} [${hint}] "; then
            return 1
        fi
        reply="$(printf '%s' "${reply}" | tr '[:upper:]' '[:lower:]')"
        [ -z "${reply}" ] && reply="${default}"
        case "${reply}" in
            y|yes) return 0 ;;
            n|no) return 1 ;;
        esac
    done
}

docker_daemon_ok() {
    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        DOCKER_SHELL="docker"
        return 0
    fi
    if command -v docker >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
        DOCKER_SHELL="sudo docker"
        return 0
    fi
    return 1
}

start_docker_daemon() {
    case "$(uname -s)" in
        Darwin)
            [ -d "/Applications/Docker.app" ] && open -a Docker >/dev/null 2>&1 || true
            ;;
        Linux)
            if command -v systemctl >/dev/null 2>&1; then
                if [ "$(id -u)" -eq 0 ]; then
                    systemctl start docker 2>/dev/null || true
                elif command -v sudo >/dev/null 2>&1; then
                    sudo systemctl start docker 2>/dev/null || true
                fi
            fi
            ;;
    esac
}

wait_for_docker() {
    local waited=0 max=180
    if is_ko; then echo "==> Docker가 준비될 때까지 기다리는 중..."; else echo "==> Waiting for Docker..."; fi
    while [ "${waited}" -lt "${max}" ]; do
        docker_daemon_ok && return 0
        sleep 3
        waited=$((waited + 3))
        [ $((waited % 15)) -eq 0 ] && start_docker_daemon
    done
    if is_ko; then
        die "Docker가 준비되지 않았습니다. Docker Desktop을 연 뒤 다시 실행하세요."
    else
        die "Docker is not ready. Start Docker Desktop, then run this installer again."
    fi
}

install_docker_linux() {
    if is_ko; then echo "==> Linux에 Docker 설치 중..."; else echo "==> Installing Docker on Linux..."; fi
    local script
    script="$(mktemp)"
    curl -fsSL https://get.docker.com -o "${script}"
    if [ "$(id -u)" -eq 0 ]; then
        sh "${script}"
    elif command -v sudo >/dev/null 2>&1; then
        sudo sh "${script}"
    else
        rm -f "${script}"
        die "sudo is required to install Docker."
    fi
    rm -f "${script}"
    if command -v systemctl >/dev/null 2>&1; then
        if [ "$(id -u)" -eq 0 ]; then systemctl enable --now docker 2>/dev/null || true
        else sudo systemctl enable --now docker 2>/dev/null || true; fi
    fi
    if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
        if ! id -nG "${USER}" 2>/dev/null | tr ' ' '\n' | grep -qx docker; then
            sudo usermod -aG docker "${USER}" 2>/dev/null || true
        fi
    fi
}

ensure_homebrew() {
    command -v brew >/dev/null 2>&1 && return 0
    if ! prompt_yes_no "$(if is_ko; then echo "Homebrew를 설치할까요?"; else echo "Install Homebrew now?"; fi)" y; then
        die "$(if is_ko; then echo "Docker Desktop을 설치한 뒤 다시 실행하세요."; else echo "Install Docker Desktop, then retry."; fi)"
    fi
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
    if [ -x /usr/local/bin/brew ]; then eval "$(/usr/local/bin/brew shellenv)"; fi
    command -v brew >/dev/null 2>&1 || die "Homebrew not on PATH. Open a new terminal and retry."
}

install_docker_macos() {
    ensure_homebrew
    if is_ko; then echo "==> Docker Desktop 설치 중..."; else echo "==> Installing Docker Desktop..."; fi
    brew install --cask docker
    open -a Docker >/dev/null 2>&1 || true
}

install_docker() {
    case "$(uname -s)" in
        Linux) install_docker_linux ;;
        Darwin) install_docker_macos ;;
        *) die "$(if is_ko; then echo "Linux/macOS만 지원합니다."; else echo "Linux and macOS only."; fi)" ;;
    esac
}

ensure_docker() {
    docker_daemon_ok && return 0
    if command -v docker >/dev/null 2>&1; then
        if is_ko; then echo "Docker가 꺼져 있습니다. 켜는 중..."; else echo "Docker is installed but not running. Starting..."; fi
        start_docker_daemon
        wait_for_docker && return 0
    fi
    if is_ko; then
        echo "Docker가 없습니다."
        prompt_text="지금 Docker를 설치할까요?"
    else
        echo "Docker is not installed."
        prompt_text="Install Docker now?"
    fi
    prompt_yes_no "${prompt_text}" y || die "$(if is_ko; then echo "Docker가 필요합니다."; else echo "Docker is required."; fi)"
    install_docker
    wait_for_docker
}

compose_cmd() {
    if ${DOCKER_SHELL} compose version >/dev/null 2>&1; then
        echo "${DOCKER_SHELL} compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        [ "${DOCKER_SHELL}" = "sudo docker" ] && echo "sudo docker-compose" || echo "docker-compose"
    else
        die "$(if is_ko; then echo "Docker Compose를 찾을 수 없습니다."; else echo "Docker Compose not found."; fi)"
    fi
}

is_installed() {
    [ -f "${COMPOSE_FILE}" ]
}

trim_token() {
    printf '%s' "$1" | tr -d '[:space:]'
}

trim_path() {
    local p="$1"
    p="${p#"${p%%[![:space:]]*}"}"
    p="${p%"${p##*[![:space:]]}"}"
    printf '%s' "${p}"
}

expand_user_path() {
    local p
    p="$(trim_path "$1")"
    case "${p}" in
        "~") printf '%s' "${HOME}" ;;
        "~/"*) printf '%s' "${HOME}/${p#~/}" ;;
        *) printf '%s' "${p}" ;;
    esac
}

validate_host_workspace_path() {
    local path="$1"
    [ -n "${path}" ] || return 1
    case "${path}" in
        /*) ;;
        *)
            if is_ko; then die "절대 경로를 입력하세요 (예: ${HOME}/my-project)."
            else die "Enter an absolute path (e.g. ${HOME}/my-project)."; fi
            ;;
    esac
    if [ ! -d "${path}" ]; then
        if is_ko; then die "폴더가 없습니다: ${path}"
        else die "Folder does not exist: ${path}"; fi
    fi
}

# Interactive host bind mount (first install). Default: no connection.
prompt_host_workspace() {
    local path reply

    if ! can_prompt_user; then
        return 0
    fi

    say_user ""
    if is_ko; then
        say_user "호스트 폴더 연결 (선택)"
        say_user "  기본 작업은 컨테이너 안 /app/user 에서 합니다."
        say_user "  연결하면 PC 폴더가 /workspace 로 마운트됩니다 (필요할 때만 사용)."
        prompt_yes_no "호스트 폴더를 연결할까요?" n || return 0
        say_user ""
        say_user "⚠ 경고: 에이전트가 연결된 폴더의 파일을 수정할 수 있는 권한을 갖습니다."
        say_user "  이 설정이 활성화되면 더 이상 tabyAgent가 격리 상태가 아니게 됩니다."
        say_user "  연결된 폴더의 파일을 파괴, 유출할 가능성이 존재합니다."
        prompt_yes_no "그래도 연결하시겠습니까?" n || return 0
        while true; do
            read_user_line reply "절대 경로 (예: ${HOME}/my-project): " || return 0
            path="$(expand_user_path "${reply}")"
            [ -n "${path}" ] || continue
            case "${path}" in
                /*) ;;
                *)
                    say_user "절대 경로를 입력하세요."
                    continue
                    ;;
            esac
            if [ ! -d "${path}" ]; then
                say_user "폴더가 없습니다: ${path}"
                continue
            fi
            break
        done
    else
        say_user ""
        say_user "Host folder mount (optional)"
        say_user "  Default work stays in /app/user inside the container."
        say_user "  If enabled, a PC folder is mounted at /workspace (use only when needed)."
        prompt_yes_no "Connect a host folder?" n || return 0
        say_user ""
        say_user "⚠ Warning: The agent will be able to modify files in the mounted folder."
        say_user "  Enabling this ends tabyAgent's isolation from your host."
        say_user "  Connected files may be destroyed or leaked."
        prompt_yes_no "Continue anyway?" n || return 0
        while true; do
            read_user_line reply "Absolute path (e.g. ${HOME}/my-project): " || return 0
            path="$(expand_user_path "${reply}")"
            [ -n "${path}" ] || continue
            case "${path}" in
                /*) ;;
                *)
                    say_user "Enter an absolute path."
                    continue
                    ;;
            esac
            if [ ! -d "${path}" ]; then
                say_user "Folder does not exist: ${path}"
                continue
            fi
            break
        done
    fi

    HOST_WORKSPACE="${path}"
    export HOST_WORKSPACE
}

resolve_host_workspace() {
    local updating="$1"

    if [ "${updating}" = true ]; then
        HOST_WORKSPACE="$(read_env_host_workspace)"
        if [ -n "${HOST_WORKSPACE:-}" ]; then
            validate_host_workspace_path "$(expand_user_path "${HOST_WORKSPACE}")"
            HOST_WORKSPACE="$(expand_user_path "${HOST_WORKSPACE}")"
        fi
        export HOST_WORKSPACE
        return 0
    fi

    # First install: interactive prompt (default no). Ignore stray HOST_WORKSPACE in the shell.
    if can_prompt_user; then
        HOST_WORKSPACE=""
        export HOST_WORKSPACE
        prompt_host_workspace
        return 0
    fi

    # Non-interactive first install (piped curl | bash with token only).
    if [ -n "${HOST_WORKSPACE:-}" ]; then
        validate_host_workspace_path "$(expand_user_path "${HOST_WORKSPACE}")"
        HOST_WORKSPACE="$(expand_user_path "${HOST_WORKSPACE}")"
        export HOST_WORKSPACE
    fi
}

validate_token() {
    local token="$1"
    [ -n "${token}" ] || die_need_token
    case "${token}" in
        *:*) ;;
        *)
            if is_ko; then die "BotFather 토큰 전체(숫자:영문)를 붙여넣으세요."
            else die "Paste the full BotFather token (digits:letters)."; fi
            ;;
    esac
}

prompt_token() {
    local token prompt_line
    say_user ""
    if is_ko; then
        say_user "① Telegram @BotFather → /newbot"
        say_user "② HTTP API 토큰 전체 복사 (예: 1234567890:ABCdef...)"
        prompt_line="토큰 붙여넣기: "
    else
        say_user "1) Telegram @BotFather → /newbot"
        say_user "2) Copy the full HTTP API token (e.g. 1234567890:ABCdef...)"
        prompt_line="Paste token: "
    fi
    read_user_line token "${prompt_line}" || die_need_token
    token="$(trim_token "${token}")"
    [ -n "${token}" ] || die_need_token
    validate_token "${token}"
    printf '%s' "${token}"
}

write_compose() {
    local image="$1"
    local workspace_volumes="" workspace_env=""
    if [ -n "${HOST_WORKSPACE:-}" ]; then
        workspace_env=$'            WORKSPACE_ENABLED: "1"\n            WORKSPACE_DIR: /workspace\n            HOST_WORKSPACE: '"${HOST_WORKSPACE}"$'\n'
        workspace_volumes=$'            - '"${HOST_WORKSPACE}"':/workspace\n'
    fi
    mkdir -p "${INSTALL_DIR}"
    cat >"${COMPOSE_FILE}" <<EOF
services:
    tabyagent:
        image: ${image}
        container_name: tabyagent
        env_file:
            - .env
        environment:
            TELEGRAM_BOT_TOKEN: \${TELEGRAM_BOT_TOKEN:-}
${workspace_env}        volumes:
            - tabyagent-user:/app/user
${workspace_volumes}        restart: unless-stopped

volumes:
    tabyagent-user:
EOF
}

write_env() {
    local token="$1"
    local workspace="${HOST_WORKSPACE:-}"
    umask 077
    {
        printf 'TELEGRAM_BOT_TOKEN=%s\n' "${token}"
        if [ -n "${workspace}" ]; then
            printf 'HOST_WORKSPACE=%s\n' "${workspace}"
        fi
    } >"${ENV_FILE}"
    chmod 600 "${ENV_FILE}"
}

read_env_token() {
    [ -f "${ENV_FILE}" ] || return 0
    # shellcheck disable=SC1090
    . "${ENV_FILE}"
    printf '%s' "${TELEGRAM_BOT_TOKEN:-}"
}

read_env_host_workspace() {
    [ -f "${ENV_FILE}" ] || return 0
    # shellcheck disable=SC1090
    . "${ENV_FILE}"
    printf '%s' "${HOST_WORKSPACE:-}"
}

pull_image() {
    local compose="$1" image="$2"
    local attempt=1 max_attempts=3

    if is_ko; then echo "==> 설치 파일 받는 중..."; else echo "==> Downloading tabyAgent..."; fi

    while [ "${attempt}" -le "${max_attempts}" ]; do
        if ${compose} -f "${COMPOSE_FILE}" pull 2>/dev/null; then
            return 0
        fi
        if [ "${attempt}" -lt "${max_attempts}" ]; then
            if is_ko; then echo "    다시 시도 중 (${attempt}/${max_attempts})..."; else echo "    Retrying (${attempt}/${max_attempts})..."; fi
            sleep 5
        fi
        attempt=$((attempt + 1))
    done

    if ${DOCKER_SHELL} image inspect "${image}" >/dev/null 2>&1; then
        if is_ko; then echo "    (이미 받아 둔 파일 사용)"; else echo "    (using cached copy)"; fi
        return 0
    fi

    if is_ko; then
        die "설치 파일을 받지 못했습니다.
· Wi‑Fi/인터넷 연결을 확인하세요.
· Docker Desktop이 켜져 있는지 확인하세요.
· 1~2분 뒤 같은 설치 명령을 다시 실행해 보세요.
· 계속 안 되면: https://github.com/gpdir16/tabyAgent/issues"
    else
        die "Could not download tabyAgent.
· Check your internet connection.
· Make sure Docker Desktop is running.
· Run the same install command again in a minute or two.
· Still stuck? https://github.com/gpdir16/tabyAgent/issues"
    fi
}

main() {
    resolve_lang
    local token="${TELEGRAM_BOT_TOKEN:-}" image="${TABYAGENT_IMAGE:-${IMAGE_DEFAULT}}"

    if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
        usage
        exit 0
    fi

    if [ -n "${1:-}" ]; then
        token="$(trim_token "$1")"
    fi

    local updating=false
    if is_installed; then
        updating=true
        if is_ko; then echo "==> tabyAgent 업데이트 중..."; else echo "==> Updating tabyAgent..."; fi
        [ -n "${token}" ] || token="$(read_env_token)"
        [ -n "${token}" ] || die_need_token
    else
        if is_ko; then echo "==> tabyAgent 설치 중..."; else echo "==> Installing tabyAgent..."; fi
        if [ -z "${token}" ]; then
            token="$(prompt_token)"
        fi
    fi

    validate_token "${token}"
    ensure_docker
    local compose
    compose="$(compose_cmd)"

    resolve_host_workspace "${updating}"

    write_compose "${image}"
    write_env "${token}"
    cd "${INSTALL_DIR}"

    pull_image "${compose}" "${image}"

    if is_ko; then echo "==> 실행 중..."; else echo "==> Starting..."; fi
    ${compose} -f "${COMPOSE_FILE}" up -d

    echo ""
    if ${updating}; then
        if is_ko; then echo "완료. tabyAgent 실행 중."; else echo "Done. tabyAgent is running."; fi
    else
        if is_ko; then
            echo "설치 완료. Telegram에서 봇에게 /start 를 보내세요."
        else
            echo "Install complete. Open your bot in Telegram and send /start."
        fi
    fi
}

main "$@"
