#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
skills_dir="${repo_root}/agent-skills"
categories_file="${skills_dir}/categories.txt"
checked=0
seen_categories="|"

if [[ ! -f "${categories_file}" ]]; then
  echo "Error: skill category enum not found at ${categories_file}" >&2
  exit 1
fi

read_frontmatter_value() {
  local skill_file="$1"
  local key="$2"

  awk -v key="${key}" '
    NR == 1 && $0 != "---" { exit 2 }
    NR > 1 && $0 == "---" { exit }
    NR > 1 {
      line=$0
      sub(/^[[:space:]]*/, "", line)
      prefix=key ":"
      if (index(line, prefix) == 1) {
        sub("^" prefix "[[:space:]]*", "", line)
        print line
        found=1
        exit
      }
    }
    END { if (!found) exit 3 }
  ' "${skill_file}"
}

while IFS= read -r skill_file; do
  skill_dir="$(dirname "${skill_file}")"
  directory_name="$(basename "${skill_dir}")"
  declared_name="$(read_frontmatter_value "${skill_file}" "name")" || {
    echo "Error: invalid or missing frontmatter name in ${skill_file}" >&2
    exit 1
  }

  if [[ "${declared_name}" != "${directory_name}" ]]; then
    echo "Error: ${skill_file} declares '${declared_name}', expected '${directory_name}'" >&2
    exit 1
  fi

  if ! read_frontmatter_value "${skill_file}" "description" >/dev/null; then
    echo "Error: missing frontmatter description in ${skill_file}" >&2
    exit 1
  fi

  category="$(read_frontmatter_value "${skill_file}" "category")" || {
    echo "Error: missing metadata category in ${skill_file}" >&2
    exit 1
  }

  if ! grep -Fxq "${category}" "${categories_file}"; then
    echo "Error: unknown skill category '${category}' in ${skill_file}" >&2
    exit 1
  fi

  if [[ "${seen_categories}" == *"|${category}|"* ]]; then
    echo "Error: more than one global fallback declares category '${category}'" >&2
    exit 1
  fi
  seen_categories="${seen_categories}${category}|"

  scope="$(read_frontmatter_value "${skill_file}" "scope")" || {
    echo "Error: missing metadata scope in ${skill_file}" >&2
    exit 1
  }

  resolution="$(read_frontmatter_value "${skill_file}" "resolution")" || {
    echo "Error: missing metadata resolution in ${skill_file}" >&2
    exit 1
  }

  if [[ "${scope}" != "global" || "${resolution}" != "fallback" ]]; then
    echo "Error: canonical skill ${skill_file} must use scope 'global' and resolution 'fallback'" >&2
    exit 1
  fi

  checked=$((checked + 1))
done < <(find "${skills_dir}" -mindepth 2 -maxdepth 2 -name SKILL.md -print | sort)

if ((checked == 0)); then
  echo "Error: no skills found under ${skills_dir}" >&2
  exit 1
fi

echo "Validated ${checked} global agent skills and their category tags."
