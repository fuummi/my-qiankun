import { importEntry } from './import-html-entry/index.js';
import { ScopedCSS } from './css.js'
import { getRender } from './render.js'
import { createSandboxContainer } from './sandbox.js'
let processor;

function createElement(appContent, appName) {
  const containerElement = document.createElement('div');
  containerElement.innerHTML = appContent;
  const appElement = containerElement.firstChild
  const attr = appElement.getAttribute('data-qiankun');
  if (!attr) {
    appElement.setAttribute('data-qiankun', appName); // 加上data-qiankun属性，css隔离的基础
  }

  const process = (appWrapper, stylesheetElement, appName) => {
    if (!processor) {
      processor = new ScopedCSS(appName);
    }
    const tag = (appWrapper.tagName || '').toLowerCase();
    if (tag && stylesheetElement.tagName === 'STYLE') {
      const prefix = `${tag}[data-qiankun="${appName}"]`;
      processor.process(stylesheetElement, prefix);
    }
  };

  const styleNodes = appElement.querySelectorAll('style') || [];
  styleNodes.forEach((stylesheetElement) => {
    process(appElement, stylesheetElement, appName);
  });
  return appElement;
}

export async function loadApp(app, configuration = {}, lifeCycles) {
  const { entry, name: appName } = app;
  // 获取html模板，执行script的函数
  const { template, execScripts } = await importEntry(entry);
  // 只有在div里，template才有效
  const appContent = `<div id="__microapp_wrapper_for_${appName}__">${template}</div> `;
  const render = getRender(appName, appContent);

  let sandboxContainer = createSandboxContainer(appName, () => appWrapperElement);
  // 用沙箱的代理对象作为接下来使用的全局对象
  const global = sandboxContainer.instance.proxy;
  const parcelConfigGetter = (remountContainer = app.container) => {
    let appWrapperElement;

    const parcelConfig = {
      name: appName,
      // bootstrap, 生命周期1
      mount: [
        // 添加 mount hook, 确保每次应用加载前容器 dom 结构已经设置完毕
        () => {
          appWrapperElement = createElement(appContent, appName);
        },
        sandboxContainer.mount,
        async () => {
          await execScripts(global, true);
        },
        // beforeMount 生命周期2
        // mount 生命周期3
        () => render({ element: appWrapperElement, container: remountContainer }),
        // afterMount 生命周期4

      ],
      unmount: [
        // beforeUnmount 生命周期5
        // unmount 生命周期6
        sandboxContainer.unmount,
        // afterUnmount 生命周期7
        () => {
          render({ element: null, container: remountContainer });
          appWrapperElement = null;
        },
      ],
    };
    return parcelConfig;
  };

  return parcelConfigGetter;
}