#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
target_home="${HOME}"
dry_run=0

usage() {
  cat <<'EOF'
Usage: scripts/install-agent-skills.sh [--dry-run] [--home PATH]

Installs every canonical skill under agent-skills/ through symlinks.
The same portable SKILL.md packages are exposed to each supported agent.
EOF
}

while (($#)); do
  case "$1" in
    --dry-run)
      dry_run=1
      shift
      ;;
    --home)
      if (($# < 2)); then
        echo "Error: --home requires a path" >&2
        exit 2
      fi
      target_home="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

skills_dir="${repo_root}/agent-skills"

if [[ ! -d "${skills_dir}" ]]; then
  echo "Error: canonical skills directory not found at ${skills_dir}" >&2
  exit 1
fi

install_link() {
  local label="$1"
  local skills_root="$2"
  local skill_name="$3"
  local source_dir="${skills_dir}/${skill_name}"
  local target="${skills_root}/${skill_name}"

  if [[ -L "${target}" ]]; then
    local current
    current="$(readlink "${target}")"
    if [[ "${current}" == "${source_dir}" ]]; then
      echo "OK ${label}: ${target}"
      return
    fi
    echo "Error: ${label} already has a different symlink at ${target}" >&2
    return 1
  fi

  if [[ -e "${target}" ]]; then
    echo "Error: ${label} already has a file or directory at ${target}" >&2
    return 1
  fi

  if ((dry_run)); then
    echo "WOULD INSTALL ${label}: ${target} -> ${source_dir}"
    return
  fi

  mkdir -p "${skills_root}"
  ln -s "${source_dir}" "${target}"
  echo "INSTALLED ${label}: ${target}"
}

skill_names=()
while IFS= read -r skill_file; do
  skill_names+=("$(basename "$(dirname "${skill_file}")")")
done < <(find "${skills_dir}" -mindepth 2 -maxdepth 2 -name SKILL.md -print | sort)

if ((${#skill_names[@]} == 0)); then
  echo "Error: no canonical skills found under ${skills_dir}" >&2
  exit 1
fi

client_roots=(
  "Agent Skills standard|${target_home}/.agents/skills"
  "Claude Code|${target_home}/.claude/skills"
  "Codex|${target_home}/.codex/skills"
  "Cursor|${target_home}/.cursor/skills"
  "Hermes|${target_home}/.hermes/skills"
  "Gemini CLI / Antigravity|${target_home}/.gemini/skills"
)

for client_root in "${client_roots[@]}"; do
  label="${client_root%%|*}"
  skills_root="${client_root#*|}"
  for skill_name in "${skill_names[@]}"; do
    install_link "${label}" "${skills_root}" "${skill_name}"
  done
done

echo "Installed ${#skill_names[@]} skills for ${#client_roots[@]} agent locations."
echo "Restart clients that do not support live skill reload."
