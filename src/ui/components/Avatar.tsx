/**
 * 头像组件
 */
import React from 'react';

interface AvatarProps {
  name: string;
  avatar: string | null;
  size?: 'small' | 'medium';
}

export const Avatar: React.FC<AvatarProps> = ({ name, avatar, size = 'medium' }) => {
  const sizeClass = size === 'small' ? 'avatar-small' : 'avatar-medium';

  return (
    <div className={`avatar ${sizeClass}`}>
      {avatar ? (
        <img src={avatar} alt={name} />
      ) : (
        <span className="avatar-placeholder">{name[0]}</span>
      )}
    </div>
  );
};
