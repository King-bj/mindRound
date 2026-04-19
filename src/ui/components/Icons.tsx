/**
 * 图标组件
 * @description 使用 lucide-react 提供一致的 SVG 图标
 */
export {
  /** Tab Bar Icons */
  MessageCircle,
  Users,
  Settings,
  Plus,
  Search,
  MoreHorizontal,
  ArrowLeft,
  User,
  Send,
  Paperclip,
  Smile,
  X,
  ChevronRight,
  Loader2,
} from 'lucide-react';

/**
 * 空状态插画组件
 * @description SVG 插画替代 emoji，提供更好的视觉一致性
 */
export const EmptyChatsIllustration = () => (
  <svg
    width="80"
    height="80"
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="10" y="15" width="50" height="35" rx="8" fill="var(--avatar-bg)" stroke="var(--list-border)" strokeWidth="2"/>
    <rect x="18" y="25" width="25" height="4" rx="2" fill="var(--tab-inactive)" opacity="0.5"/>
    <rect x="18" y="33" width="18" height="4" rx="2" fill="var(--tab-inactive)" opacity="0.3"/>
    <path d="M15 50 L25 58 L40 45" stroke="var(--tab-active)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="58" cy="55" r="12" fill="var(--tab-active)" opacity="0.2"/>
    <path d="M54 55 L58 59 L66 51" stroke="var(--tab-active)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const EmptyContactsIllustration = () => (
  <svg
    width="80"
    height="80"
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle cx="30" cy="28" r="14" fill="var(--avatar-bg)" stroke="var(--list-border)" strokeWidth="2"/>
    <circle cx="30" cy="24" r="6" fill="var(--tab-inactive)" opacity="0.4"/>
    <path d="M18 42 C18 36 24 32 30 32 C36 32 42 36 42 42" stroke="var(--tab-inactive)" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
    <circle cx="55" cy="35" r="10" fill="var(--avatar-bg)" stroke="var(--list-border)" strokeWidth="2"/>
    <circle cx="55" cy="32" r="4" fill="var(--tab-inactive)" opacity="0.4"/>
    <path d="M47 45 C47 41 51 38 55 38 C59 38 63 41 63 45" stroke="var(--tab-inactive)" strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
    <circle cx="40" cy="58" r="8" fill="var(--tab-active)" opacity="0.15"/>
    <path d="M37 58 L39 60 L43 56" stroke="var(--tab-active)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
  </svg>
);

export const LoadingSpinner = ({ size = 24 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ animation: 'spin 1s linear infinite' }}
    aria-hidden="true"
  >
    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    <circle cx="12" cy="12" r="10" stroke="var(--tab-inactive)" strokeWidth="3" strokeOpacity="0.3"/>
    <path d="M12 2 A10 10 0 0 1 22 12" stroke="var(--tab-active)" strokeWidth="3" strokeLinecap="round"/>
  </svg>
);
