#!/bin/bash
set -euo pipefail

# smile:setup-deploy - wire up this experiment's deploy secrets on GitHub.
#
# This is the modern replacement for the old `upload_config`. Run it once per
# experiment repo, after you've pushed the repo to GitHub:
#
#   pnpm smile:setup-deploy
#
# It links the project to Vercel (creating .vercel/project.json) and sets the
# GitHub Actions secrets the deploy workflow needs:
#   VERCEL_PROJECT_ID, VERCEL_ORG_ID          (read from .vercel/project.json)
#   VERCEL_TOKEN                              (from your lab-config file)
#   SLACK_WEBHOOK_URL, MAIL_* (optional)      (from your lab-config file)
#
# Keep the reusable values once in a local, gitignored lab-config file so every
# new experiment reuses them. Default: ~/.smile/deploy.env
# Override with: SMILE_DEPLOY_CONFIG=/path/to/file pnpm smile:setup-deploy
#
# Example ~/.smile/deploy.env (quote any value containing spaces/special chars):
#   VERCEL_TOKEN=xxxxxxxxxxxxxxxx
#   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T000/B000/XXXX
#   MAIL_USERNAME=you@gmail.com
#   MAIL_PASSWORD=app-password
#   MAIL_TO=lab@example.com
#
# If your experiment repos live in a GitHub *organization*, you can instead set
# VERCEL_TOKEN / VERCEL_ORG_ID / SLACK_WEBHOOK_URL / MAIL_* once as *organization*
# secrets and skip the lab-config file - only VERCEL_PROJECT_ID is per-repo.

CONFIG="${SMILE_DEPLOY_CONFIG:-$HOME/.smile/deploy.env}"

command -v gh >/dev/null 2>&1 || { echo "[x] GitHub CLI (gh) not found. Install: https://cli.github.com/"; exit 1; }
command -v vercel >/dev/null 2>&1 || { echo "[x] Vercel CLI not found. Install: pnpm add -g vercel"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "[x] Not logged in to GitHub. Run: gh auth login"; exit 1; }

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)
if [ -z "${REPO}" ]; then
  echo "[x] Couldn't determine the GitHub repo. Push this project to GitHub first, e.g.:"
  echo "      gh repo create <owner>/<name> --private --source . --remote origin --push"
  exit 1
fi
echo "-> Repo: ${REPO}"

# Link to Vercel (creates .vercel/project.json) if not already linked.
if [ ! -f .vercel/project.json ]; then
  echo "-> Linking to Vercel - answer the prompts to create or select the project..."
  vercel link
fi
if [ ! -f .vercel/project.json ]; then
  echo "[x] .vercel/project.json not found - 'vercel link' did not complete."
  exit 1
fi

ORG_ID=$(node -e "console.log(require('./.vercel/project.json').orgId)")
PROJECT_ID=$(node -e "console.log(require('./.vercel/project.json').projectId)")

set_secret() { # name value
  if [ -n "${2:-}" ]; then
    printf '%s' "${2}" | gh secret set "${1}" -R "${REPO}" >/dev/null && echo "    [ok] ${1}"
  fi
}

echo "-> Setting Vercel project identifiers on ${REPO} ..."
set_secret VERCEL_ORG_ID "${ORG_ID}"
set_secret VERCEL_PROJECT_ID "${PROJECT_ID}"

if [ -f "${CONFIG}" ]; then
  echo "-> Reading reusable secrets from ${CONFIG} ..."
  set -a
  # shellcheck disable=SC1090
  . "${CONFIG}"
  set +a
  set_secret VERCEL_TOKEN "${VERCEL_TOKEN:-}"
  set_secret SLACK_WEBHOOK_URL "${SLACK_WEBHOOK_URL:-}"
  set_secret MAIL_USERNAME "${MAIL_USERNAME:-}"
  set_secret MAIL_PASSWORD "${MAIL_PASSWORD:-}"
  set_secret MAIL_TO "${MAIL_TO:-}"
  set_secret MAIL_SERVER "${MAIL_SERVER:-}"
  set_secret MAIL_PORT "${MAIL_PORT:-}"
else
  echo "-> No lab-config file at ${CONFIG} (that's fine)."
  echo "   Set VERCEL_TOKEN yourself, or create that file to reuse it across experiments."
  echo "   Create a token at https://vercel.com/account/tokens then run:"
  echo "      gh secret set VERCEL_TOKEN -R ${REPO}"
fi

echo ""
echo "[done] Secrets now on ${REPO}:"
gh secret list -R "${REPO}"
echo ""
echo "Note: app config (TURSO_*, SMILE_DEV_PASSWORD, ...) lives in Vercel, not GitHub."
echo "Set it per project (vercel env add), or once as Vercel *team* shared env vars."
