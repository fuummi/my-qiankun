const proxyAttachContainerConfigMap = new Map()
const styledComponentCSSRulesMap = new Map();

export function patchStrictSandbox(
  appName,
  appWrapperGetter,
  sandbox,
  mounting = true,
) {
  const { proxy } = sandbox;
  let containerConfig = proxyAttachContainerConfigMap.get(proxy);
  if (!containerConfig) {
    containerConfig = {
      appName,
      proxy,
      appWrapperGetter,
      dynamicStyleSheetElements: [],
      strictGlobal: true,
    };
    proxyAttachContainerConfigMap.set(proxy, containerConfig); // 缓存配置
  }
  const { dynamicStyleSheetElements } = containerConfig;

  return function free() {

    dynamicStyleSheetElements.forEach((styleElement) => { // 暂存css变化
      styledComponentCSSRulesMap.set(styleElement, styleElement.sheet.cssRules);
    });

    return function rebuild() {
      dynamicStyleSheetElements.forEach((stylesheetElement) => {
        const appWrapper = appWrapperGetter();
        appWrapper.insertBefore(stylesheetElement)
        const cssRules = getStyledElementCSSRules(stylesheetElement);
        for (let i = 0; i < cssRules.length; i++) { // 遍历重新插入css规则
          const cssRule = cssRules[i];
          const cssStyleSheetElement = stylesheetElement.sheet;
          cssStyleSheetElement.insertRule(cssRule.cssText, cssStyleSheetElement.cssRules.length);
        }
      });
    };
  };
}

export function createSandboxContainer(
  appName,
  elementGetter,
) {
  class ProxySandbox {
    proxyWindow;
    isRunning = false;
    appName;
    active() {
      this.isRunning = true;
    }
    inactive() {
      this.isRunning = false;
    }
    constructor(appName, window) {
      this.appName = appName
      const fakeWindow = Object.create(window);
      this.proxyWindow = new Proxy(fakeWindow, {
        set: (target, prop, value, receiver) => {
          if (this.isRunning) {
            target[prop] = value;
          }
        },
        get: (target, prop, receiver) => {
          return prop in target ? target[prop] : window[prop];
        },
      });
    }
  }
  const sandbox = new ProxySandbox(appName, window);
  const bootstrappingFreers = patchStrictSandbox(appName, elementGetter, sandbox)
  let mountingFreers = [];
  let sideEffectsRebuilders = [];

  return {
    instance: sandbox,

    /**
     * 沙箱被 mount
     * 可能是从 bootstrap 状态进入的 mount
     * 也可能是从 unmount 之后再次唤醒进入 mount
     */
    async mount() {
      /* ------------------------------------------ 因为有上下文依赖（window），以下代码执行顺序不能变 ------------------------------------------ */

      /* ------------------------------------------ 1. 启动/恢复 沙箱------------------------------------------ */
      sandbox.active();

      const sideEffectsRebuildersAtBootstrapping = sideEffectsRebuilders.slice(0, bootstrappingFreers.length);
      const sideEffectsRebuildersAtMounting = sideEffectsRebuilders.slice(bootstrappingFreers.length);

      // must rebuild the side effects which added at bootstrapping firstly to recovery to nature state
      if (sideEffectsRebuildersAtBootstrapping.length) {
        sideEffectsRebuildersAtBootstrapping.forEach((rebuild) => rebuild());
      }

      /* ------------------------------------------ 2. 开启全局变量补丁 ------------------------------------------*/
      // render 沙箱启动时开始劫持各类全局监听，尽量不要在应用初始化阶段有 事件监听/定时器 等副作用
      mountingFreers = patchStrictSandbox(appName, elementGetter, sandbox, true);

      /* ------------------------------------------ 3. 重置一些初始化时的副作用 ------------------------------------------*/
      // 存在 rebuilder 则表明有些副作用需要重建
      if (sideEffectsRebuildersAtMounting.length) {
        sideEffectsRebuildersAtMounting.forEach((rebuild) => rebuild());
      }
      sideEffectsRebuilders = [];
    },

    /**
     * 恢复 global 状态，使其能回到应用加载之前的状态
     */
    async unmount() {
      sideEffectsRebuilders = [bootstrappingFreers, mountingFreers].map((free) => free());
      sandbox.inactive();
    },
  };
}
