export function createSandboxContainer(appName, elementGetter) {

  function createFakeWindow(globalContext) {
    // 创建一个空对象，用于模拟全局对象
    const fakeWindow = {};
    // 获取全局上下文中的所有属性名
    Object.getOwnPropertyNames(globalContext)
      .filter((p) => {
        // 获取属性 p 的属性描述符
        const descriptor = Object.getOwnPropertyDescriptor(globalContext, p);
        // 返回不可配置的属性
        return !descriptor?.configurable;
      })
      .forEach((p) => {
        const descriptor = Object.getOwnPropertyDescriptor(globalContext, p);
        if (descriptor) {
          // 检查属性是否有 getter 方法
          const hasGetter = Object.prototype.hasOwnProperty.call(descriptor, 'get');
          // 在模拟的全局对象上定义属性，并使用属性描述符冻结属性
          Object.defineProperty(fakeWindow, p, Object.freeze(descriptor));
        }
      });

    return fakeWindow
  }

  class ProxySandbox {
    name
    proxy
    sandboxRunning = true;

    active() {
      this.sandboxRunning = true;
    }

    inactive() {
      this.sandboxRunning = false;
    }

    constructor(name, globalContext = window, opts) {
      this.name = name;
      this.globalContext = globalContext;
      const fakeWindow = createFakeWindow(globalContext);

      const proxy = new Proxy(fakeWindow, {
        set: (target, p, value) => {
          if (this.sandboxRunning) {
            target[p] = value;
          }
          return true;
        },

        get: (target, p) => {
          if (p === "window") {
            return target
          }
          const value = target[p];
          return value;
        },
      });
      this.proxy = proxy;
    }
  }
  const sandbox = new ProxySandbox(appName, window);
  return {
    instance: sandbox,
    mount() {
      sandbox.active();
    },
    unmount() {
      sandbox.inactive();
    },
  };
}
