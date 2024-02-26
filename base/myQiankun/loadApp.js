import { importEntry } from './import-html-entry/index.js';
import { ScopedCSS } from './ScopedCSS.js'
import { getRender } from './render.js'
import { createSandboxContainer } from './sandbox.js'
let processor;

function execHooksChain(hooks, app, global = window) {
  return () => {
    if (hooks.length) {
      return hooks.map((hook) => hook(app, global));
    }
  }
}

function createElement(appContent, appName, strictStyleIsolation = false) {
  const containerElement = document.createElement('div');
  containerElement.innerHTML = appContent;
  const appElement = containerElement.firstChild
  if (strictStyleIsolation) {
    const { innerHTML } = appElement;
    appElement.innerHTML = '';
    let shadow;
    if (appElement.attachShadow) {
      shadow = appElement.attachShadow({ mode: 'open' });
    } else {
      shadow = appElement.createShadowRoot();
    }
    shadow.innerHTML = innerHTML;
  } else {
    const attr = appElement.getAttribute('micro-app');
    if (!attr) {
      appElement.setAttribute('micro-app', appName); // 加上micro-app属性，css隔离的基础
    }

    const process = (appWrapper, stylesheetElement, appName) => {
      if (!processor) {
        processor = new ScopedCSS(appName);
      }
      const tag = (appWrapper.tagName || '').toLowerCase();
      if (tag && stylesheetElement.tagName === 'STYLE') {
        const prefix = `${tag}[micro-app="${appName}"]`;
        processor.process(stylesheetElement, prefix);
      }
    };

    const styleNodes = appElement.querySelectorAll('style') || [];
    styleNodes.forEach((stylesheetElement) => {
      process(appElement, stylesheetElement, appName);
    });
  }
  return appElement;
}

export async function loadApp(app, lifeCycles) {
  const { entry, name: appName } = app;
  // 获取html模板，执行script的函数
  const { template, execScripts } = await importEntry(entry, { prefetch: true, singular: true, sandbox: true });
  // 只有在div里，template才有效
  const appContent = `<div id="__microapp_wrapper_for_${appName}__">${template}</div> `;
  const render = getRender(appName, appContent);

  let sandboxContainer = createSandboxContainer(appName, () => appWrapperElement);
  const global = sandboxContainer.instance.proxy;

  const {
    beforeUnmount = [],
    afterUnmount = [],
    afterMount = [],
    beforeMount = [],
    beforeLoad = [],
  } = lifeCycles;

  // beforeLoad 生命周期1
  execHooksChain(beforeLoad, app, global);

  const { scriptExports } = await execScripts(global, true);
  const { bootstrap, mount, unmount, update } = scriptExports

  // 用沙箱的代理对象作为接下来使用的全局对象
  const parcelConfigGetter = (remountContainer = app.container) => {
    let appWrapperElement;
    const parcelConfig = {
      name: appName,
      mount: [
        // 添加 mount hook, 确保每次应用加载前容器 dom 结构已经设置完毕
        () => {
          appWrapperElement = createElement(appContent, appName, true);
        },
        sandboxContainer.mount,
        async () => {
          await execScripts(global, true);
        },
        // beforeMount 生命周期2
        execHooksChain(beforeMount, app, global),
        () => render({ element: appWrapperElement, container: remountContainer }),
        // afterMount 生命周期3
        execHooksChain(afterMount, app, global),

      ],
      unmount: [
        // beforeUnmount 生命周期4
        execHooksChain(beforeUnmount, app, global),
        sandboxContainer.unmount,
        () => {
          render({ element: null, container: remountContainer });
          appWrapperElement = null;
        },
        // afterUnmount 生命周期5
        execHooksChain(afterUnmount, app, global),
      ],
    };
    return parcelConfig;
  };

  return parcelConfigGetter;
}