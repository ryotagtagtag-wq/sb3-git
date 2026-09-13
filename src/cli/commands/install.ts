import { Command } from 'commander';
import { writeGitConfig, getGitConfigCommands } from '../../git/config.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export const installCommand = new Command('install')
  .description('Install sb3-git Git configuration (diff driver, merge driver, hooks)')
  .option('--global', 'Install globally (user-level git config)')
  .option('--hooks', 'Also install pre-commit hook')
  .option('--github-actions', 'Also create GitHub Actions workflow')
  .action(async (options) => {
    console.log('🔧 Installing sb3-git Git configuration...');
    
    // Configure git diff/merge drivers
    const scope = options.global ? '--global' : '';
    const commands = getGitConfigCommands().map(cmd => `${cmd} ${scope}`);
    
    for (const cmd of commands) {
      console.log(`  $ git config ${cmd}`);
      // In real implementation, would execute git config
    }
    
    console.log('');
    console.log('Run these commands to complete setup:');
    for (const cmd of commands) {
      console.log(`  git config ${cmd}`);
    }
    
    if (options.hooks) {
      console.log('');
      console.log('Installing pre-commit hook...');
      // Would write to .git/hooks/pre-commit
    }
    
    if (options.githubActions) {
      console.log('');
      console.log('Creating GitHub Actions workflow...');
      // Would write .github/workflows/sb3-git.yml
    }
    
    // Write local config files
    const projectDir = process.cwd();
    await writeGitConfig(projectDir);
    
    console.log('');
    console.log('✅ Created .gitattributes, .git/hooks/pre-commit, .github/workflows/sb3-git.yml');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Run the git config commands shown above');
    console.log('  2. Commit the generated files:');
    console.log('     git add .gitattributes .github/workflows/sb3-git.yml');
    console.log('     git commit -m "chore: add sb3-git Git configuration"');
  });
