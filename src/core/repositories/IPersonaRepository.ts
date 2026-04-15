/**
 * 人格仓储接口
 * @description 定义人格数据的加载和扫描操作
 */
import type { Persona } from '../domain/Persona';

export interface IPersonaRepository {
  /**
   * 扫描并加载所有人格
   * @returns 人格列表
   */
  scan(): Promise<Persona[]>;

  /**
   * 根据 ID 查询人格
   * @param id - 人格 ID
   * @returns 人格对象，不存在返回 null
   */
  findById(id: string): Promise<Persona | null>;

  /**
   * 获取所有人格
   * @returns 人格列表
   */
  findAll(): Promise<Persona[]>;

  /**
   * 获取人格的 SKILL.md 内容
   * @param personaId - 人格 ID
   * @returns SKILL.md 完整内容
   */
  getSkillContent(personaId: string): Promise<string>;

  /**
   * 删除人格（预留）
   * @param id - 人格 ID
   */
  delete(id: string): Promise<void>;

  /** 变更事件回调 */
  onChange?: (personas: Persona[]) => void;
}
