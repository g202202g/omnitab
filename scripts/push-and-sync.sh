#!/usr/bin/env bash
set -euo pipefail

WAIT_SECONDS="${WAIT_SECONDS:-25}"
SYNC_ONLY=0
PUSH_ARGS=()

sync_to_remote() {
  echo "同步远端最新内容..."
  git fetch --prune

  local local_sha
  local remote_sha
  local_sha="$(git rev-parse HEAD)"
  remote_sha="$(git rev-parse "${UPSTREAM}")"

  if [[ "${local_sha}" == "${remote_sha}" ]]; then
    echo "已是最新。"
    return 0
  fi

  if git merge-base --is-ancestor "${local_sha}" "${remote_sha}"; then
    echo "远端有更新，将本地切换到远端最新版本。"
    git reset --hard "${UPSTREAM}"
    return 0
  fi

  if git merge-base --is-ancestor "${remote_sha}" "${local_sha}"; then
    echo "本地比远端更新（远端未发生自动更新或尚未完成）。"
    echo "为避免重复处理，已跳过同步。"
    return 0
  fi

  echo "本地与远端发生分叉（两边都有更新）。"
  echo "将以远端为准，并把本地新增的提交补回来。"

  local backup_branch
  backup_branch="backup/sync-$(date +%Y%m%d-%H%M%S)"
  git branch "${backup_branch}"
  echo "已创建备份分支：${backup_branch}"

  # 找出“仅存在于本地”的提交（按补丁内容去重），并按时间正序排列
  local local_only_commits
  local_only_commits="$(
    git rev-list --reverse --no-merges --cherry-pick --right-only "${UPSTREAM}...${local_sha}" || true
  )"

  git reset --hard "${UPSTREAM}"

  if [[ -n "${local_only_commits}" ]]; then
    echo "开始补回本地提交..."
    # 逐个补回：遇到“无需重复应用”的提交自动跳过；遇到冲突则退出让用户处理
    # shellcheck disable=SC2086
    for sha in ${local_only_commits}; do
      if git cherry-pick "${sha}"; then
        continue
      fi

      if [[ -n "$(git diff --name-only --diff-filter=U 2>/dev/null || true)" ]]; then
        echo "补回过程中出现冲突。"
        echo "你可以解决冲突后执行：git cherry-pick --continue"
        echo "或放弃这次补回：git cherry-pick --abort"
        return 1
      fi

      if git rev-parse -q --verify CHERRY_PICK_HEAD >/dev/null 2>&1; then
        echo "该提交无需重复应用，已跳过：${sha}"
        git cherry-pick --skip
        continue
      fi

      echo "补回失败：${sha}"
      return 1
    done
  fi

  return 0
}

usage() {
  cat <<'EOF'
用法：
  bash scripts/push-and-sync.sh [git push 参数...]
  bash scripts/push-and-sync.sh --sync-only

说明：
  - 默认会先执行 git push，然后等待一会儿，再把远端的自动更新同步到本地
  - --sync-only 模式不会执行 git push，只做“等待 + 同步”

环境变量：
  - WAIT_SECONDS：等待秒数（默认 25）
EOF
}

while (( $# )); do
  case "$1" in
    --sync-only)
      SYNC_ONLY=1
      ;;
    --wait)
      shift
      WAIT_SECONDS="${1:-25}"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      PUSH_ARGS+=("$1")
      ;;
  esac
  shift
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "当前目录不是 Git 仓库"
  exit 1
fi

if [[ -n "$(git status --porcelain=v1)" ]]; then
  echo "当前有未提交的改动，为避免丢失，已中止。"
  echo "请先提交/暂存/还原后再执行。"
  exit 1
fi

BRANCH="$(git branch --show-current)"
if [[ -z "${BRANCH}" ]]; then
  echo "未找到当前分支"
  exit 1
fi

UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>/dev/null || true)"
if [[ -z "${UPSTREAM}" ]]; then
  echo "当前分支没有设置上游分支（upstream）。"
  echo "可先执行：git push -u origin ${BRANCH}"
  exit 1
fi

echo "推送分支：${BRANCH} -> ${UPSTREAM}"
if [[ "${SYNC_ONLY}" -eq 0 ]]; then
  # 先同步一次，避免 non-fast-forward 直接推送失败
  sync_to_remote

  if ! git push "${PUSH_ARGS[@]}"; then
    echo "推送失败，尝试同步远端后重试一次..."
    sync_to_remote
    git push "${PUSH_ARGS[@]}"
  fi
fi

echo "等待 ${WAIT_SECONDS}s 让自动流程完成..."
sleep "${WAIT_SECONDS}"

sync_to_remote

echo "完成。"
