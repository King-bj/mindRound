/**
 * 人格服务
 * @description 封装人格数据的加载和查询逻辑
 */
import type { Persona } from '../domain/Persona';
import type { IPersonaRepository } from '../repositories/IPersonaRepository';

/**
 * 人格服务接口
 */
export interface IPersonaService {
  /**
   * 扫描并加载所有人格
   * @returns 人格列表
   */
  scanPersonas(): Promise<Persona[]>;

  /**
   * 根据 ID 获取人格
   * @param id - 人格 ID
   * @returns 人格对象，不存在返回 null
   */
  getPersona(id: string): Promise<Persona | null>;

  /**
   * 获取人格的 SKILL.md 内容
   * @param personaId - 人格 ID
   * @returns SKILL.md 完整内容
   */
  getSkillContent(personaId: string): Promise<string>;
}

/**
 * 人格服务实现
 */
export class PersonaService implements IPersonaService {
  constructor(private personaRepo: IPersonaRepository) {}

  async scanPersonas(): Promise<Persona[]> {
    return this.personaRepo.scan();
  }

  async getPersona(id: string): Promise<Persona | null> {
    return this.personaRepo.findById(id);
  }

  async getSkillContent(personaId: string): Promise<string> {
    return this.personaRepo.getSkillContent(personaId);
  }
}
