import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonaInfoPanel } from './PersonaInfoPanel';
import type { Persona } from '../../core/domain/Persona';

const samplePersona: Persona = {
  id: 'author-skill',
  name: '作者名',
  description: '这是描述\n第二行',
  avatar: null,
  tags: ['写作', '产品'],
};

describe('PersonaInfoPanel', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <PersonaInfoPanel isOpen={false} persona={samplePersona} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows Level 1 fields when open with persona', () => {
    const onClose = vi.fn();
    render(<PersonaInfoPanel isOpen persona={samplePersona} onClose={onClose} />);

    expect(screen.getByText('作者名')).toBeInTheDocument();
    expect(screen.getByText('author-skill')).toBeInTheDocument();
    expect(screen.getByText(/这是描述/)).toBeInTheDocument();
    expect(screen.getByText('写作')).toBeInTheDocument();
    expect(screen.getByText('产品')).toBeInTheDocument();
  });

  it('shows missing message when persona is null', () => {
    render(<PersonaInfoPanel isOpen persona={null} onClose={vi.fn()} />);
    expect(screen.getByText('未找到作者信息')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<PersonaInfoPanel isOpen persona={samplePersona} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    expect(onClose).toHaveBeenCalled();
  });
});
