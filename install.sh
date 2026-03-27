#!/usr/bin/env sh

set -eu

APP_NAME="act-cli"
BIN_NAME="act"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
INSTALL_DIR=${ACT_INSTALL_DIR:-"$HOME/.local/share/$APP_NAME"}
BIN_DIR=${ACT_BIN_DIR:-"$HOME/.local/bin"}
STAGING_DIR=

say() {
  printf "%s\n" "$*"
}

fail() {
  printf "Error: %s\n" "$*" >&2
  exit 1
}

cleanup() {
  if [ -n "${STAGING_DIR}" ] && [ -d "${STAGING_DIR}" ]; then
    rm -rf "${STAGING_DIR}"
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

check_node_version() {
  major_version=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)

  [ -n "${major_version}" ] || fail "Unable to determine your Node.js version."

  if [ "${major_version}" -lt 18 ] 2>/dev/null; then
    fail "Node.js 18 or newer is required."
  fi
}

copy_if_exists() {
  if [ -e "$1" ]; then
    cp -R "$1" "$2"
  fi
}

install_dependencies() {
  if [ -f "${STAGING_DIR}/package-lock.json" ]; then
    npm ci --no-fund --no-audit
  else
    npm install --no-fund --no-audit
  fi
}

install_runtime_dependencies() {
  if [ -f "${STAGING_DIR}/package-lock.json" ]; then
    npm ci --omit=dev --no-fund --no-audit
  else
    npm install --omit=dev --no-fund --no-audit
  fi
}

print_path_hint() {
  case ":$PATH:" in
    *":${BIN_DIR}:"*) return ;;
  esac

  shell_name=$(basename "${SHELL:-sh}")

  case "${shell_name}" in
    zsh)
      profile="$HOME/.zshrc"
      ;;
    bash)
      profile="$HOME/.bashrc"
      ;;
    fish)
      profile="$HOME/.config/fish/config.fish"
      ;;
    *)
      profile="your shell profile"
      ;;
  esac

  say ""
  say "Add ${BIN_DIR} to your PATH to use ${BIN_NAME} from new terminals:"
  if [ "${shell_name}" = "fish" ]; then
    say "  set -U fish_user_paths ${BIN_DIR} \$fish_user_paths"
  else
    say "  echo 'export PATH=\"${BIN_DIR}:\$PATH\"' >> ${profile}"
  fi
}

trap cleanup EXIT INT TERM

require_command node
require_command npm
check_node_version

[ -f "${SCRIPT_DIR}/package.json" ] || fail "package.json not found next to install.sh"

STAGING_DIR=$(mktemp -d "${TMPDIR:-/tmp}/${APP_NAME}.XXXXXX")

mkdir -p "${STAGING_DIR}"
cp "${SCRIPT_DIR}/package.json" "${STAGING_DIR}/package.json"
copy_if_exists "${SCRIPT_DIR}/package-lock.json" "${STAGING_DIR}/"

if [ -f "${SCRIPT_DIR}/dist/index.js" ]; then
  say "Using bundled build from ${SCRIPT_DIR}/dist"
  cp -R "${SCRIPT_DIR}/dist" "${STAGING_DIR}/dist"
  (
    cd "${STAGING_DIR}"
    install_runtime_dependencies
  )
else
  [ -d "${SCRIPT_DIR}/src" ] || fail "src directory not found and no bundled dist build is available."
  [ -f "${SCRIPT_DIR}/tsconfig.json" ] || fail "tsconfig.json not found for source build."

  say "Building ${BIN_NAME} from source"
  cp -R "${SCRIPT_DIR}/src" "${STAGING_DIR}/src"
  cp "${SCRIPT_DIR}/tsconfig.json" "${STAGING_DIR}/tsconfig.json"

  (
    cd "${STAGING_DIR}"
    install_dependencies
    npm run build
    npm prune --omit=dev --no-fund --no-audit
    rm -rf src tsconfig.json
  )
fi

mkdir -p "$(dirname "${INSTALL_DIR}")" "${BIN_DIR}"
rm -rf "${INSTALL_DIR}"
mv "${STAGING_DIR}" "${INSTALL_DIR}"
STAGING_DIR=

cat > "${BIN_DIR}/${BIN_NAME}" <<EOF
#!/usr/bin/env sh
exec node "${INSTALL_DIR}/dist/index.js" "\$@"
EOF

chmod +x "${BIN_DIR}/${BIN_NAME}"

say ""
say "${BIN_NAME} installed to ${INSTALL_DIR}"
say "Launcher created at ${BIN_DIR}/${BIN_NAME}"
say ""
say "Run:"
say "  ${BIN_NAME} --help"

print_path_hint
