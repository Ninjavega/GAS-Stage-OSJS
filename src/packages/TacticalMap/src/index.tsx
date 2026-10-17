import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import './index.css';
import { TacticalMap } from './TacticalMap';

// OS.js Application Registration
const register = () => {
  if (typeof window !== 'undefined' && (window as any).OSjs) {
    (window as any).OSjs.register('TacticalMap', (core: any, args: any, options: any, metadata: any) => {
      const title = core.make('osjs/locale').translatableFlat(metadata.title);
      const proc = core.make('osjs/application', { args, options, metadata });

      const win = proc.createWindow({
        id: 'TacticalMap',
        title: title || 'Tactical Map',
        icon: proc.resource(metadata.icon),
        dimension: { width: 1050, height: 680 },
        position: 'center'
      });

      let root: Root | null = null;

      win.on('destroy', () => {
        if (root) {
          try {
            root.unmount();
          } catch (e) {
            console.warn(e);
          }
          root = null;
        }
        proc.destroy();
      });

      win.render(($content: HTMLElement, windowInstance: any) => {
        $content.style.padding = '0';
        $content.style.margin = '0';
        $content.style.overflow = 'hidden';
        $content.style.width = '100%';
        $content.style.height = '100%';

        root = createRoot($content);
        root.render(React.createElement(TacticalMap, { core, win: windowInstance }));
      });

      return proc;
    });
  }
};

register();

export { TacticalMap };
