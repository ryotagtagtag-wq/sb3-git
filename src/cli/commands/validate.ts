// Validate command: project integrity checking
import { Command } from 'commander'
import { collapseFromFiles } from '../../codec/expand.js'
import { checkIntegrity, printIntegrityReport } from '../../validate/integrity.js'

export const validateCommand = new Command('validate')
  .description('Validate expanded project integrity')
  .argument('<input>', 'Input directory (expanded format)')
  .option('--strict', 'Exit with error code on warnings')
  .action(async (input: string, options: { strict?: boolean }) => {
    console.log(`Validating ${input}...`)
    
    const project = await collapseFromFiles(input)
    const issues = checkIntegrity(project)
    
    printIntegrityReport(issues)
    
    const errors = issues.filter(i => i.severity === 'error')
    const warnings = issues.filter(i => i.severity === 'warning')
    
    if (errors.length > 0) {
      console.log(`✗ Validation failed with ${errors.length} error(s)`)
      process.exit(1)
    }
    
    if (warnings.length > 0 && options.strict) {
      console.log(`✗ Validation failed with ${warnings.length} warning(s) (strict mode)`)
      process.exit(1)
    }
    
    console.log(`✓ Validation passed`)
  })
