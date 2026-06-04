#!/usr/bin/env bash
# tabyAgent — install or update via Docker (Linux / macOS)
set -euo pipefail

REPO_OWNER="gpdir16"
IMAGE_DEFAULT="ghcr.io/${REPO_OWNER}/tabyagent:latest"
INSTALL_DIR="${TABYAGENT_HOME:-${HOME}/.tabyagent}"
COMPOSE_FILE="${INSTALL_DIR}/docker-compose.yml"
ENV_FILE="${INSTALL_DIR}/.env"

# docker / sudo docker (set by ensure_docker)
DOCKER_SHELL="docker"

# en (default) | ko — override with TABYAGENT_LANG=ko or TABYAGENT_LANG=en
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
    cat <<'EOF'
Install or update tabyAgent.

Run (recommended — you will be asked for your BotFather token):
  curl -fsSL https://raw.githubusercontent.com/gpdir16/tabyAgent/main/scripts/install.sh | bash

Optional: pass the token on the command line
  bash install.sh '1234567890:ABCdef...'

Language: English by default. Korean if LANG starts with ko, or set TABYAGENT_LANG=ko|en
Docker: if missing, the installer can install Docker for you (Linux / macOS).
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

prompt_yes_no() {
    local prompt="$1"
    local default="${2:-y}"
    local hint reply

    if [ "${TABYAGENT_AUTO_INSTALL_DOCKER:-}" = "1" ]; then
        return 0
    fi
    if [ ! -t 0 ]; then
        return 1
    fi

    if [ "${default}" = y ]; then
        if is_ko; then hint="Y/n"; else hint="Y/n"; fi
    else
        if is_ko; then hint="y/N"; else hint="y/N"; fi
    fi

    while true; do
        printf "%s [%s] " "${prompt}" "${hint}"
        IFS= read -r reply
        reply="$(printf '%s' "${reply}" | tr '[:upper:]' '[:lower:]')"
        if [ -z "${reply}" ]; then
            reply="${default}"
        fi
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
            if [ -d "/Applications/Docker.app" ]; then
                open -a Docker >/dev/null 2>&1 || open /Applications/Docker.app >/dev/null 2>&1 || true
            fi
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
    local waited=0
    local max=180

    if is_ko; then
        echo "==> Docker가 준비될 때까지 기다리는 중..."
    else
        echo "==> Waiting for Docker to be ready..."
    fi

    while [ "${waited}" -lt "${max}" ]; do
        if docker_daemon_ok; then
            return 0
        fi
        sleep 3
        waited=$((waited + 3))
        if [ $((waited % 15)) -eq 0 ]; then
            start_docker_daemon
        fi
    done

    if is_ko; then
        die "Docker가 아직 준비되지 않았습니다. Docker Desktop(맥)이 켜졌는지 확인한 뒤 이 명령을 다시 실행하세요."
    else
        die "Docker is not ready yet. Start Docker Desktop (Mac) or the docker service, then run this installer again."
    fi
}

install_docker_linux() {
    if is_ko; then
        echo "==> Linux에 Docker 설치 중..."
    else
        echo "==> Installing Docker on Linux..."
    fi

    local script
    script="$(mktemp)"
    curl -fsSL https://get.docker.com -o "${script}"

    if [ "$(id -u)" -eq 0 ]; then
        sh "${script}"
    elif command -v sudo >/dev/null 2>&1; then
        if is_ko; then
            echo "    (관리자 비밀번호가 필요할 수 있습니다)"
        else
            echo "    (you may be asked for your password)"
        fi
        sudo sh "${script}"
    else
        rm -f "${script}"
        die "sudo is required to install Docker on Linux."
    fi
    rm -f "${script}"

    if command -v systemctl >/dev/null 2>&1; then
        if [ "$(id -u)" -eq 0 ]; then
            systemctl enable --now docker 2>/dev/null || true
        else
            sudo systemctl enable --now docker 2>/dev/null || true
        fi
    fi

    if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
        if ! id -nG "${USER}" 2>/dev/null | tr ' ' '\n' | grep -qx docker; then
            sudo usermod -aG docker "${USER}" 2>/dev/null || true
        fi
        if is_ko; then
            echo "    (현재 사용자를 docker 그룹에 추가했습니다. 같은 터미널에서는 sudo docker 로 동작할 수 있습니다)"
        else
            echo "    (added ${USER} to the docker group; this shell may use sudo docker)"
        fi
    fi
}

ensure_homebrew() {
    if command -v brew >/dev/null 2>&1; then
        return 0
    fi

    if is_ko; then
        echo "Homebrew가 없습니다. macOS에서 Docker를 자동 설치하려면 Homebrew가 필요합니다."
    else
        echo "Homebrew is not installed. It is needed to install Docker automatically on macOS."
    fi

    if ! prompt_yes_no "$(if is_ko; then echo "Homebrew를 설치할까요?"; else echo "Install Homebrew now?"; fi)" y; then
        if is_ko; then
            die "https://docs.docker.com/desktop/setup/install/mac-install/ 에서 Docker Desktop을 설치한 뒤 다시 실행하세요."
        else
            die "Install Docker Desktop from https://docs.docker.com/desktop/setup/install/mac-install/ then run this again."
        fi
    fi

    if is_ko; then
        echo "==> Homebrew 설치 중..."
    else
        echo "==> Installing Homebrew..."
    fi
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    if [ -x /opt/homebrew/bin/brew ]; then
        # shellcheck disable=SC1091
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x /usr/local/bin/brew ]; then
        # shellcheck disable=SC1091
        eval "$(/usr/local/bin/brew shellenv)"
    fi

    command -v brew >/dev/null 2>&1 || die "Homebrew install finished but brew is not on PATH. Open a new terminal and retry."
}

install_docker_macos() {
    ensure_homebrew

    if is_ko; then
        echo "==> macOS에 Docker Desktop 설치 중... (시간이 걸릴 수 있습니다)"
    else
        echo "==> Installing Docker Desktop on macOS (this may take a few minutes)..."
    fi

    brew install --cask docker
    open -a Docker >/dev/null 2>&1 || true
}

install_docker() {
    case "$(uname -s)" in
        Linux) install_docker_linux ;;
        Darwin) install_docker_macos ;;
        *)
            if is_ko; then
                die "이 설치 프로그램은 Linux와 macOS만 지원합니다."
            else
                die "This installer supports Linux and macOS only."
            fi
            ;;
    esac
}

ensure_docker() {
    if docker_daemon_ok; then
        return 0
    fi

    if command -v docker >/dev/null 2>&1; then
        if is_ko; then
            echo "Docker는 설치되어 있지만 실행 중이 아닙니다."
        else
            echo "Docker is installed but not running."
        fi
        start_docker_daemon
        if wait_for_docker; then
            return 0
        fi
    fi

    if is_ko; then
        echo "이 PC에 Docker가 없습니다. tabyAgent는 Docker가 필요합니다."
        prompt_text="지금 Docker를 자동으로 설치할까요?"
        decline_msg="Docker 없이는 설치를 계속할 수 없습니다."
    else
        echo "Docker is not installed. tabyAgent needs Docker to run."
        prompt_text="Install Docker automatically now?"
        decline_msg="Cannot continue without Docker."
    fi

    if ! prompt_yes_no "${prompt_text}" y; then
        die "${decline_msg}"
    fi

    install_docker
    wait_for_docker
}

compose_cmd() {
    if ${DOCKER_SHELL} compose version >/dev/null 2>&1; then
        echo "${DOCKER_SHELL} compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        if [ "${DOCKER_SHELL}" = "sudo docker" ]; then
            echo "sudo docker-compose"
        else
            echo "docker-compose"
        fi
    elif is_ko; then
        die "Docker Compose를 찾을 수 없습니다. Docker Desktop을 다시 시작한 뒤 재시도하세요."
    else
        die "Docker Compose not found. Restart Docker Desktop and try again."
    fi
}

is_installed() {
    [ -f "${COMPOSE_FILE}" ]
}

trim_token() {
    printf '%s' "$1" | tr -d '[:space:]'
}

validate_token() {
    local token="$1"
    if [ -z "${token}" ]; then
        if is_ko; then
            die "봇 토큰이 필요합니다."
        else
            die "Telegram bot token is required."
        fi
    fi
    case "${token}" in
        *:*) ;;
        *)
            if is_ko; then
                die "토큰 형식이 맞지 않습니다. BotFather가 준 전체 문자열(숫자:영문)을 그대로 붙여넣으세요."
            else
                die "Invalid token. Paste the full BotFather token (digits:letters)."
            fi
            ;;
    esac
}

prompt_token() {
    echo ""
    if is_ko; then
        echo "① Telegram에서 @BotFather 를 열고 /newbot 으로 봇을 만드세요."
        echo "② BotFather가 보내준 'HTTP API' 토큰 전체를 복사하세요."
        echo "   (예: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz)"
        echo ""
        printf "아래에 토큰을 붙여넣고 Enter: "
    else
        echo "1) Open @BotFather in Telegram and send /newbot to create a bot."
        echo "2) Copy the full HTTP API token BotFather sends you."
        echo "   (e.g. 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz)"
        echo ""
        printf "Paste token here and press Enter: "
    fi
    local token
    IFS= read -r token
    token="$(trim_token "${token}")"
    validate_token "${token}"
    printf '%s' "${token}"
}

write_compose() {
    local image="$1"
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
        volumes:
            - tabyagent-user:/app/user
        restart: unless-stopped

volumes:
    tabyagent-user:
EOF
}

write_env() {
    local token="$1"
    umask 077
    printf 'TELEGRAM_BOT_TOKEN=%s\n' "${token}" >"${ENV_FILE}"
    chmod 600 "${ENV_FILE}"
}

read_env_token() {
    if [ -f "${ENV_FILE}" ]; then
        # shellcheck disable=SC1090
        . "${ENV_FILE}"
        printf '%s' "${TELEGRAM_BOT_TOKEN:-}"
    fi
}

main() {
    resolve_lang
    local token="${TELEGRAM_BOT_TOKEN:-}"
    local image="${TABYAGENT_IMAGE:-${IMAGE_DEFAULT}}"

    if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
        usage
        exit 0
    fi

    if [ -n "${1:-}" ]; then
        token="$(trim_token "$1")"
    fi

    ensure_docker
    local compose
    compose="$(compose_cmd)"

    local updating=false
    if is_installed; then
        updating=true
        if is_ko; then
            echo "==> tabyAgent 업데이트 중... (설정·메모리는 그대로 둡니다)"
        else
            echo "==> Updating tabyAgent (your settings and memory are kept)..."
        fi
        if [ -z "${token}" ]; then
            token="$(read_env_token)"
            if [ -z "${token}" ]; then
                if is_ko; then
                    die "저장된 토큰이 없습니다. 설치 명령을 다시 실행한 뒤 토큰을 입력하세요."
                else
                    die "No saved token. Run the install command again and enter your token."
                fi
            fi
        fi
    else
        if is_ko; then
            echo "==> tabyAgent 설치 중..."
        else
            echo "==> Installing tabyAgent..."
        fi
        if [ -z "${token}" ]; then
            token="$(prompt_token)"
        fi
    fi

    validate_token "${token}"

    write_compose "${image}"
    write_env "${token}"

    cd "${INSTALL_DIR}"
    if is_ko; then
        echo "==> 이미지 받는 중..."
    else
        echo "==> Pulling image..."
    fi
    if ! ${compose} -f "${COMPOSE_FILE}" pull; then
        if ${DOCKER_SHELL} image inspect "${image}" >/dev/null 2>&1; then
            if is_ko; then
                echo "    (원격에서 받지 못해 로컬 이미지를 사용합니다)"
            else
                echo "    (using local image; remote pull failed)"
            fi
        else
            if is_ko; then
                die "이미지를 받지 못했습니다 (${image}). 네트워크·Docker 로그인을 확인하거나, GitHub Release 후 GHCR 패키지가 Public인지 확인하세요."
            else
                die "Could not pull image (${image}). Check network/Docker login, or publish the GHCR package after a GitHub Release."
            fi
        fi
    fi
    if is_ko; then
        echo "==> 실행 중..."
    else
        echo "==> Starting..."
    fi
    ${compose} -f "${COMPOSE_FILE}" up -d

    echo ""
    if ${updating}; then
        if is_ko; then
            echo "업데이트가 끝났습니다. tabyAgent가 실행 중입니다."
        else
            echo "Update complete. tabyAgent is running."
        fi
    else
        if is_ko; then
            echo "설치가 끝났습니다. tabyAgent가 실행 중입니다."
            echo "Telegram에서 만든 봇을 열고 /start 를 보내 설정을 마치세요."
        else
            echo "Install complete. tabyAgent is running."
            echo "Open your bot in Telegram and send /start to finish setup."
        fi
    fi
    echo ""
    if is_ko; then
        echo "다시 업데이트할 때는 같은 설치 명령을 한 번 더 실행하면 됩니다."
    else
        echo "To update later, run the same install command again."
    fi
}

main "$@"
