#!/bin/sh
set -e
brew install node@22
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm install --no-audit --no-fund
npx cap sync ios
