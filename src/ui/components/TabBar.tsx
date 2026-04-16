/**
 * 底部导航栏
 * @description 微信风格底部 Tab 导航
 */
import React from 'react';
import { MessageCircle, Users, Settings } from './Icons';

export type TabType = 'chats' | 'contacts' | 'settings';

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

interface TabItemProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  ariaLabel: string;
}

const TabItem: React.FC<TabItemProps> = ({ icon, label, isActive, onClick, ariaLabel }) => (
  <button
    className={`tab-item ${isActive ? 'active' : ''}`}
    onClick={onClick}
    aria-label={ariaLabel}
    aria-current={isActive ? 'page' : undefined}
  >
    <span className="tab-icon" aria-hidden="true">{icon}</span>
    <span className="tab-label">{label}</span>
  </button>
);

export const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange }) => {
  return (
    <nav className="tab-bar" role="tablist" aria-label="主导航">
      <TabItem
        icon={<MessageCircle size={24} strokeWidth={1.75} />}
        label="对话"
        isActive={activeTab === 'chats'}
        onClick={() => onTabChange('chats')}
        ariaLabel="对话"
      />
      <TabItem
        icon={<Users size={24} strokeWidth={1.75} />}
        label="通讯录"
        isActive={activeTab === 'contacts'}
        onClick={() => onTabChange('contacts')}
        ariaLabel="通讯录"
      />
      <TabItem
        icon={<Settings size={24} strokeWidth={1.75} />}
        label="设置"
        isActive={activeTab === 'settings'}
        onClick={() => onTabChange('settings')}
        ariaLabel="设置"
      />
    </nav>
  );
};
