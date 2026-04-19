/**
 * 人格仓储接口
 * @description 定义 Skill（人格）数据的加载、扫描与 Level 3 资源访问操作。
 * 三层加载语义见 docs/SKILL_PROTOCOL.md：
 * - Level 1：scan/findAll/findById 返回的 Persona（discovery card）
 * - Level 2：getSkillContent 返回的 SKILL.md 全文
 * - Level 3：listSkillResources / readSkillResource 暴露的 references|examples
 */
import type { Persona, SkillResource } from '../domain/Persona';

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
   * 获取人格的 SKILL.md 内容（Level 2）
   * @param personaId - 人格 ID
   * @returns SKILL.md 完整内容
   */
  getSkillContent(personaId: string): Promise<string>;

  /**
   * 列出 Skill 的 Level 3 资源（references/** + examples/**）
   * @description 仅返回元数据（路径 + 字节数）；不读取正文。
   * @param skillId - Skill / Persona ID
   * @returns 资源条目列表，按 relPath 升序
   */
  listSkillResources(skillId: string): Promise<SkillResource[]>;

  /**
   * 读取单个 Skill Level 3 资源
   * @description 路径必须落在 skill 目录下的 references/** 或 examples/**，
   * 由 assertSafeSkillResourcePath 校验，越界即抛错。
   * @param skillId - Skill / Persona ID
   * @param relPath - 相对 skill 目录的路径
   * @returns 文件文本内容
   */
  readSkillResource(skillId: string, relPath: string): Promise<string>;

  /**
   * 删除人格（预留）
   * @param id - 人格 ID
   */
  delete(id: string): Promise<void>;

  /** 变更事件回调 */
  onChange?: (personas: Persona[]) => void;
}
