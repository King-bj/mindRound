/**
 * 文件系统人格仓储
 * @description 基于本地 personae 目录的人格加载实现
 */
import type { IPersonaRepository } from '../../repositories/IPersonaRepository';
import type { Persona } from '../../domain/Persona';
import { createPersonaFromSkill } from '../../domain/Persona';
import type { IPlatformAdapter } from '../platforms/IPlatformAdapter';

export class FilePersonaRepository implements IPersonaRepository {
  constructor(private platform: IPlatformAdapter) {}

  private async getPersonasDir(): Promise<string> {
    return `${await this.platform.getDataDir()}/personae`;
  }

  async scan(): Promise<Persona[]> {
    try {
      const personasDir = await this.getPersonasDir();
      const entries = await this.platform.listDir(personasDir);
      const personas: Persona[] = [];

      for (const entry of entries) {
        const persona = await this.findById(entry);
        if (persona) {
          personas.push(persona);
        }
      }

      return personas;
    } catch (err) {
      console.error('[FilePersonaRepository] scan() error:', err);
      return [];
    }
  }

  async findById(id: string): Promise<Persona | null> {
    try {
      const personasDir = await this.getPersonasDir();
      const skillPath = `${personasDir}/${id}/SKILL.md`;
      const skillContent = await this.platform.readFile(skillPath);

      const avatarPath = `${personasDir}/${id}/avatar.png`;
      let avatar: string | null = null;
      if (await this.platform.exists(avatarPath)) {
        avatar = avatarPath;
      }

      return createPersonaFromSkill(id, skillContent, avatar);
    } catch {
      return null;
    }
  }

  async findAll(): Promise<Persona[]> {
    return this.scan();
  }

  async getSkillContent(personaId: string): Promise<string> {
    const personasDir = await this.getPersonasDir();
    const skillPath = `${personasDir}/${personaId}/SKILL.md`;
    return this.platform.readFile(skillPath);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async delete(_id: string): Promise<void> {
    throw new Error('Delete not implemented in MVP');
  }

  onChange?: (personas: Persona[]) => void;
}
