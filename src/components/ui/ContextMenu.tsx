import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  variant?: 'default' | 'danger';
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Use capturing phase to ensure we close before other elements might stop propagation
    document.addEventListener('click', handleClickOutside, true);
    // Also close on right click outside
    document.addEventListener('contextmenu', handleClickOutside, true);

    return () => {
      document.removeEventListener('click', handleClickOutside, true);
      document.removeEventListener('contextmenu', handleClickOutside, true);
    };
  }, [onClose]);

  // Prevent context menu from going off-screen (basic handling)
  const safeX = Math.min(x, window.innerWidth - 200); // Assume max width 200px
  const safeY = Math.min(y, window.innerHeight - (items.length * 40)); // Assume max height

  const menu = (
    <div
      ref={menuRef}
      className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[160px]"
      style={{ left: safeX, top: safeY }}
      onContextMenu={(e) => e.preventDefault()} // Prevent default context menu on the menu itself
    >
      {items.map((item, index) => (
        <button
          key={index}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 focus-visible:outline-none focus-visible:bg-gray-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
            item.variant === 'danger' ? 'text-red-600 hover:text-red-700' : 'text-gray-700'
          }`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );

  return createPortal(menu, document.body);
}
