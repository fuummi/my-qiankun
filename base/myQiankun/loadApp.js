import { importEntry } from './import-html-entry/index.js';
import { ScopedCSS } from './css.js'
import { getRender } from './render.js'
import { createSandboxContainer } from './sandbox.js'
let processor;

export function getDefaultTplWrapper(name) {
  return (tpl) => {
    return `<div id="__qiankun_microapp_wrapper_for_${name}__">
      ${tpl
        .replace('<head>', `<myQiankun-head>`)
        .replace('</head>', `</myQiankun-head>`)
      }
    </div > `;
  };
}

function createElement(appContent, appInstanceId) {
  const containerElement = document.createElement('div');
  containerElement.innerHTML = appContent;
  const appElement = containerElement.firstChild

  const attr = appElement.getAttribute('data-qiankun');
  if (!attr) {
    appElement.setAttribute('data-qiankun', appInstanceId);
  }

  const process = (appWrapper, stylesheetElement, appName) => {
    if (!processor) {
      processor = new ScopedCSS();
    }
    const tag = (appWrapper.tagName || '').toLowerCase();
    if (tag && stylesheetElement.tagName === 'STYLE') {
      const prefix = `${tag}[data-qiankun="${appName}"]`;
      processor.process(stylesheetElement, prefix);
    }
  };

  const styleNodes = appElement.querySelectorAll('style') || [];
  styleNodes.forEach((stylesheetElement) => {
    process(appElement, stylesheetElement, appInstanceId);
  });
  return appElement;
}

export async function loadApp(app, configuration = {}, lifeCycles) {
  const { entry, name: appName } = app;
  const appInstanceId = appName;

  const { template, execScripts } = await importEntry(entry);

  const appContent = getDefaultTplWrapper(appName)(template);

  let initialAppWrapperElement = createElement(
    appContent,
    appName,
  );

  const initialContainer = app.container
  const legacyRender = 'render' in app ? app.render : undefined;

  const render = getRender(appInstanceId, appContent);
  // 这里返回shadowRoot？？？
  const initialAppWrapperGetter = () => initialAppWrapperElement

  let global = window;
  let sandbox = null
  let mountSandbox = () => Promise.resolve();
  let unmountSandbox = () => Promise.resolve();
  let sandboxContainer;
  sandboxContainer = createSandboxContainer(
    appInstanceId,
    initialAppWrapperGetter,
  );
  // 用沙箱的代理对象作为接下来使用的全局对象
  global = sandboxContainer.instance.proxy;
  mountSandbox = sandboxContainer.mount;
  unmountSandbox = sandboxContainer.unmount;

  // const {
  //   beforeUnmount = [],
  //   afterUnmount = [],
  //   afterMount = [],
  //   beforeMount = [],
  //   beforeLoad = [],
  // } = mergeWith({}, getAddOns(global, assetPublicPath), lifeCycles, (v1, v2) => concat(v1 ?? [], v2 ?? []));

  // await execHooksChain(toArray(beforeLoad), app, global);

  // get the lifecycle hooks from module exports
  const scriptExports = await execScripts(global, sandbox);
  // const { bootstrap, mount, unmount, update } = getLifecyclesFromExports(
  //   scriptExports,
  //   appName,
  //   global,
  //   sandboxContainer?.instance?.latestSetProp,
  // );

  // const { onGlobalStateChange, setGlobalState, offGlobalStateChange } =
  //   getMicroAppStateActions(appInstanceId);

  // FIXME temporary way
  // const syncAppWrapperElement2Sandbox = (element) => (initialAppWrapperElement = element);

  const parcelConfigGetter = (remountContainer = initialContainer) => {
    let appWrapperElement;
    let appWrapperGetter;

    const parcelConfig = {
      name: appInstanceId,
      // bootstrap, 生命周期1
      mount: [
        // initial wrapper element before app mount/remount
        async () => {
          appWrapperElement = initialAppWrapperElement;
          appWrapperGetter = () => appWrapperElement;
        },
        // 添加 mount hook, 确保每次应用加载前容器 dom 结构已经设置完毕
        async () => {
          const useNewContainer = remountContainer !== initialContainer;
          if (useNewContainer || !appWrapperElement) {
            appWrapperElement = createElement(appContent, appInstanceId);
          }
          render({ element: appWrapperElement, container: remountContainer });
        },
        mountSandbox,
        // async () => execHooksChain(toArray(beforeMount), app, global), // 生命周期2
        // async (props) => mount({ ...props, container: appWrapperGetter(), setGlobalState, onGlobalStateChange }), // 生命周期3
        async () => render({ element: appWrapperElement, container: remountContainer }),
        // async () => execHooksChain(toArray(afterMount), app, global), // 生命周期4
      ],
      unmount: [
        // async () => execHooksChain(toArray(beforeUnmount), app, global), // 生命周期5
        // async (props) => unmount({ ...props, container: appWrapperGetter() }), // 生命周期6
        unmountSandbox,
        // async () => execHooksChain(toArray(afterUnmount), app, global), // 生命周期7
        async () => {
          render({ element: null, container: remountContainer });
          appWrapperElement = null;
        },
      ],
    };
    return parcelConfig;
  };

  return parcelConfigGetter;
}