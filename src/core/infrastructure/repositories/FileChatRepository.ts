/**
 * 文件系统会话仓储
 * @description 基于本地文件的会话持久化实现
 */
import type { IChatRepository } from '../../repositories/IChatRepository';
import type { Chat, ChatMeta, MessageDTO } from '../../domain/Chat';
import { createChatFromMeta, chatToMeta } from '../../domain/Chat';
import type { IPlatformAdapter } from '../platforms/IPlatformAdapter';
import { generateChatId, timestamp } from '../../utils';
import { DEFAULT_MEMORY_CONTENT } from '../../utils/constants';

export class FileChatRepository implements IChatRepository {
  constructor(private platform: IPlatformAdapter) {}

  private async getChatsDir(): Promise<string> {
    return `${await this.platform.getDataDir()}/chats`;
  }

  async create(chatData: Omit<Chat, 'id'>): Promise<Chat> {
    const chat: Chat = {
      ...chatData,
      id: generateChatId(),
    };

    const chatsDir = await this.getChatsDir();
    const chatDir = `${chatsDir}/${chat.id}`;
    await this.platform.mkdir(chatDir);

    // 并行写入三个文件
    await Promise.all([
      this.platform.writeFile(
        `${chatDir}/meta.json`,
        JSON.stringify(chatToMeta(chat), null, 2)
      ),
      this.platform.writeFile(
        `${chatDir}/messages.json`,
        JSON.stringify({ messages: [] }, null, 2)
      ),
      this.platform.writeFile(`${chatDir}/memory.md`, DEFAULT_MEMORY_CONTENT),
    ]);

    return chat;
  }

  async findById(id: string): Promise<Chat | null> {
    try {
      const chatsDir = await this.getChatsDir();
      const metaPath = `${chatsDir}/${id}/meta.json`;
      const content = await this.platform.readFile(metaPath);
      const meta: ChatMeta = JSON.parse(content);
      return createChatFromMeta(meta);
    } catch {
      return null;
    }
  }

  async findAll(): Promise<Chat[]> {
    try {
      const chatsDir = await this.getChatsDir();
      const entries = await this.platform.listDir(chatsDir);

      // 并行读取所有 meta.json，避免 N+1
      const metas = await Promise.all(
        entries.map(async (entry) => {
          try {
            const metaPath = `${chatsDir}/${entry}/meta.json`;
            const content = await this.platform.readFile(metaPath);
            return JSON.parse(content) as ChatMeta;
          } catch {
            return null;
          }
        })
      );

      return metas
        .filter((meta): meta is ChatMeta => meta !== null)
        .map(createChatFromMeta)
        .sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
    } catch {
      return [];
    }
  }

  async update(id: string, data: Partial<Chat>): Promise<void> {
    const chat = await this.findById(id);
    if (!chat) {
      throw new Error(`Chat not found: ${id}`);
    }

    const updated: Chat = {
      ...chat,
      ...data,
      updatedAt: timestamp(),
    };

    const chatsDir = await this.getChatsDir();
    const metaPath = `${chatsDir}/${id}/meta.json`;
    await this.platform.writeFile(metaPath, JSON.stringify(chatToMeta(updated), null, 2));
  }

  async delete(id: string): Promise<void> {
    const chatsDir = await this.getChatsDir();
    const chatDir = `${chatsDir}/${id}`;
    const files = await this.platform.listDir(chatDir);

    // 并行删除文件
    await Promise.all(files.map((file) => this.platform.deleteFile(`${chatDir}/${file}`)));

    this.onChange?.(id);
  }

  async addMessage(chatId: string, message: MessageDTO): Promise<void> {
    const chatsDir = await this.getChatsDir();
    const messagesPath = `${chatsDir}/${chatId}/messages.json`;

    // 读-修改-写操作（MVP 简化处理，生产环境需考虑文件锁或原子操作）
    const content = await this.platform.readFile(messagesPath);
    const data = JSON.parse(content);
    data.messages.push(message);
    await this.platform.writeFile(messagesPath, JSON.stringify(data, null, 2));

    // 更新会话时间
    await this.update(chatId, {});
    this.onChange?.(chatId);
  }

  async getMessages(chatId: string): Promise<MessageDTO[]> {
    const chatsDir = await this.getChatsDir();
    const messagesPath = `${chatsDir}/${chatId}/messages.json`;
    const content = await this.platform.readFile(messagesPath);
    const data = JSON.parse(content);
    return data.messages || [];
  }

  async getMemory(chatId: string): Promise<string> {
    const chatsDir = await this.getChatsDir();
    const memoryPath = `${chatsDir}/${chatId}/memory.md`;
    try {
      return await this.platform.readFile(memoryPath);
    } catch {
      return DEFAULT_MEMORY_CONTENT;
    }
  }

  async updateMemory(chatId: string, content: string): Promise<void> {
    const chatsDir = await this.getChatsDir();
    const memoryPath = `${chatsDir}/${chatId}/memory.md`;
    await this.platform.writeFile(memoryPath, content);
  }

  async getSpeakerIndex(chatId: string): Promise<number> {
    const chat = await this.findById(chatId);
    return chat?.currentSpeakerIndex ?? 0;
  }

  async updateSpeakerIndex(chatId: string, index: number): Promise<void> {
    const chatsDir = await this.getChatsDir();
    const metaPath = `${chatsDir}/${chatId}/meta.json`;

    // 直接读取 meta.json 并更新，避免冗余的 findById
    const content = await this.platform.readFile(metaPath);
    const meta: ChatMeta = JSON.parse(content);
    meta.currentSpeakerIndex = index;

    await this.platform.writeFile(metaPath, JSON.stringify(meta, null, 2));
  }

  async findByPersona(personaId: string): Promise<Chat[]> {
    const all = await this.findAll();
    return all.filter((chat) => chat.personaIds.includes(personaId));
  }

  async findRecent(limit: number): Promise<Chat[]> {
    const all = await this.findAll();
    return all.slice(0, limit);
  }

  onChange?: (chatId: string) => void;
}
