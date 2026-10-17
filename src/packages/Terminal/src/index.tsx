import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Terminal } from './Terminal';

const register = (attempt = 0) => {
  const api = typeof window === 'undefined' ? null : (window as any).OSjs;
  if (!api || typeof api.register !== 'function') {
    if (attempt < 100 && typeof window !== 'undefined') {
      window.setTimeout(() => register(attempt + 1), 50);
    }
    return;
  }

  api.register('Terminal', (core: any, args: any, options: any, metadata: any) => {
    const proc = core.make('osjs/application', {args, options, metadata});
    const win = proc.createWindow({
      id: 'Terminal',
      title: core.make('osjs/locale').translatableFlat(metadata.title) || 'Terminal',
      icon: proc.resource(metadata.icon),
      dimension: {width: 900, height: 580},
      position: 'center'
    });

    let root: Root | null = null;
    win.on('destroy', () => {
      if (root) {
        root.unmount();
        root = null;
      }
      proc.destroy();
    });

    win.render(($content: HTMLElement) => {
      $content.style.padding = '0';
      $content.style.margin = '0';
      $content.style.width = '100%';
      $content.style.height = '100%';
      $content.style.overflow = 'hidden';
      root = createRoot($content);
      root.render(React.createElement(Terminal, {onClose: () => win.destroy()}));
    });

    return proc;
  });
};

register();
