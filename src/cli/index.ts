#!/usr/bin/env node

import { Command } from 'commander';
import { serveCommand } from './commands/serve.js';
import { reposCommand } from './commands/repos.js';
import { statusCommand } from './commands/status.js';
import { checkCommand } from './commands/check.js';
import { hooksCommand } from './commands/hooks.js';

const program = new Command();

program
  .name('dev-intel')
  .description('Developer Intelligence Layer — local-first knowledge base for AI coding agents')
  .version('0.1.0');

program.addCommand(serveCommand());
program.addCommand(reposCommand());
program.addCommand(statusCommand());
program.addCommand(checkCommand());
program.addCommand(hooksCommand());

program.parse();
