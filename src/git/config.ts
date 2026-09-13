/**
 * Git Configuration and Hooks
 * Sets up .gitattributes, diff drivers, and GitHub Actions workflow
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export const GITATTRIBUTES_CONTENT = `# sb3-git: Git configuration for Scratch .sb3 files

# Treat .sb3 as binary for storage, but use textconv for diff
*.sb3 binary
*.sb3 diff=sb3
*.sb3 merge=sb3

# Diff driver configuration (set via git config)
# [diff "sb3"]
#   textconv = sb3-git diff --textconv %s
#   binary = true

# Merge driver configuration
# [merge "sb3"]
#   name = sb3-git three-way merge
#   driver = sb3-git merge %O %A %B
`;

export const PRE_COMMIT_HOOK = `#!/bin/sh
# sb3-git pre-commit hook
# Auto-expands .sb3 files to intermediate format for diffing

# Check if sb3-git is available
if ! command -v sb3-git >/dev/null 2>&1; then
  echo "sb3-git not found, skipping .sb3 expansion"
  exit 0
fi

# Find staged .sb3 files
STAGED_SB3=$(git diff --cached --name-only -- '*.sb3')

if [ -z "$STAGED_SB3" ]; then
  exit 0
fi

echo "sb3-git: Expanding staged .sb3 files..."

for file in $STAGED_SB3; do
  if [ -f "$file" ]; then
    # Expand to intermediate format in .sb3-git/ directory
    EXPAND_DIR=".sb3-git/$(dirname "$file")/$(basename "$file" .sb3)"
    mkdir -p "$EXPAND_DIR"
    sb3-git import "$file" "$EXPAND_DIR"
    
    # Stage the expanded files
    git add "$EXPAND_DIR"
  fi
done

echo "sb3-git: Expansion complete"
`;

export const GITHUB_ACTION_WORKFLOW = `name: sb3-git CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  validate:
    name: Validate SB3 Projects
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build sb3-git
        run: npm run build
      
      - name: Validate all .sb3 files
        run: |
          find . -name "*.sb3" -not -path "./node_modules/*" -not -path "./.git/*" | while read sb3; do
            echo "Validating $sb3..."
            ./dist/cli/index.js validate "$sb3" || exit 1
          done
      
      - name: Check for merge conflicts in PR
        if: github.event_name == 'pull_request'
        run: |
          BASE=\$(git merge-base origin/\${{ github.base_ref }} HEAD)
          HEAD=HEAD
          
          CHANGED_SB3=\$(git diff --name-only \$BASE \$HEAD -- '*.sb3')
          
          if [ -n "\$CHANGED_SB3" ]; then
            echo "Checking .sb3 files for merge conflicts..."
            for sb3 in \$CHANGED_SB3; do
              if [ -f "\$sb3" ]; then
                ./dist/cli/index.js check-conflicts "\$sb3" --base \$BASE --head \$HEAD || exit 1
              fi
            done
          fi
      
      - name: Generate diff report for PR
        if: github.event_name == 'pull_request'
        run: |
          BASE=\$(git merge-base origin/\${{ github.base_ref }} HEAD)
          HEAD=HEAD
          
          CHANGED_SB3=\$(git diff --name-only \$BASE \$HEAD -- '*.sb3')
          
          if [ -n "\$CHANGED_SB3" ]; then
            echo "Generating diff reports..."
            for sb3 in \$CHANGED_SB3; do
              if [ -f "\$sb3" ]; then
                REPORT_DIR="diff-reports/\$(dirname "\$sb3")/\$(basename "\$sb3" .sb3)"
                mkdir -p "\$REPORT_DIR"
                ./dist/cli/index.js diff "\$sb3" --base \$BASE --head \$HEAD --output "\$REPORT_DIR"
              fi
            done
      
      - name: Upload diff reports
        if: github.event_name == 'pull_request'
        uses: actions/upload-artifact@v4
        with:
          name: sb3-diff-reports
          path: diff-reports/
          retention-days: 7

  test:
    name: Run Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test
`;

export async function writeGitConfig(projectDir: string): Promise<void> {
  // Write .gitattributes
  await writeFile(join(projectDir, '.gitattributes'), GITATTRIBUTES_CONTENT);
  
  // Write pre-commit hook
  const hooksDir = join(projectDir, '.git', 'hooks');
  await mkdir(hooksDir, { recursive: true });
  await writeFile(join(hooksDir, 'pre-commit'), PRE_COMMIT_HOOK, { mode: 0o755 });
  
  // Write GitHub Actions workflow
  const workflowDir = join(projectDir, '.github', 'workflows');
  await mkdir(workflowDir, { recursive: true });
  await writeFile(join(workflowDir, 'sb3-git.yml'), GITHUB_ACTION_WORKFLOW);
}

export function getGitConfigCommands(): string[] {
  return [
    'git config diff.sb3.textconv "sb3-git diff --textconv %s"',
    'git config diff.sb3.binary true',
    'git config merge.sb3.name "sb3-git three-way merge"',
    'git config merge.sb3.driver "sb3-git merge %O %A %B"',
  ];
}
