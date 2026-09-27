// src/engines/SkillLoader.ts
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../logger';

export interface SkillRule {
  skillName: string;
  version: string;
  allowedRoles: string[];
  maxDailyUsage?: number;
  rateLimitPerMin?: number;
  [key: string]: unknown;
}

export class SkillLoader {
  private static readonly rules = new Map<string, SkillRule>();

  public static registerRule(rule: SkillRule): void {
    this.rules.set(rule.skillName, rule);
    logger.info(`[SkillLoader] Registered skill rule: ${rule.skillName} (v${rule.version})`);
  }

  public static async loadSkill(skillFileName: string): Promise<SkillRule | null> {
    try {
      const filePath = path.resolve(process.cwd(), 'src/skills', skillFileName);
      const content = await fs.readFile(filePath, 'utf-8');
      
      const skillNameMatch = content.match(/skillName:\s*([^\n\r]+)/);
      const versionMatch = content.match(/version:\s*["']?([^"'\n\r]+)["']?/);
      
      const skillName = skillNameMatch ? skillNameMatch[1].trim() : path.basename(skillFileName, path.extname(skillFileName));
      const version = versionMatch ? versionMatch[1].trim() : '1.0.0';

      const rule: SkillRule = {
        skillName,
        version,
        allowedRoles: ['*']
      };

      this.registerRule(rule);
      return rule;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[SkillLoader] Error loading skill file ${skillFileName}: ${msg}`);
      return null;
    }
  }

  public static evaluateConstraint(skillName: string, userRole: string): boolean {
    const rule = this.rules.get(skillName);
    if (!rule) {
      return true; // по умолчанию разрешено
    }
    const isAllowed = rule.allowedRoles.includes('*') || rule.allowedRoles.includes(userRole);
    if (!isAllowed) {
      logger.warn(`[SkillLoader] Execution denied for skill ${skillName} by role ${userRole}`);
    }
    return isAllowed;
  }

  // Alias for backward compatibility
  public static canExecuteSkill(skillName: string, userRole: string): boolean {
    return this.evaluateConstraint(skillName, userRole);
  }
}
