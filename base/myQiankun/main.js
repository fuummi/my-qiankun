import { loadApp } from './loadApp.js';

const NOT_LOADED = "NOT_LOADED";
const LOADING_SOURCE_CODE = "LOADING_SOURCE_CODE";
const NOT_MOUNTED = "NOT_MOUNTED";
const MOUNTING = "MOUNTING";
const MOUNTED = "MOUNTED";
const UNMOUNTING = "UNMOUNTING";
const UNLOADING = "UNLOADING";

// 注册应用存储
const apps = [];
let started = false;

export function start(opts) {
  started = true;
}

// 乾坤对single-spa注册应用的封装
export function registerMicroApps(apps, lifeCycles) { // 乾坤
  apps.forEach((app) => {
    const { name, activeRule, props, ...appConfig } = app;
    registerApplication({
      name,
      loadApp: async () => {
        const { mount, unmount } = (
          await loadApp({ name, props, ...appConfig }, lifeCycles)
        )();
        return {
          mount: [...mount],
          unmount: [...unmount],
        };
      },
      activeWhen: activeRule,
    });
  });
  reroute()
}

// 注册应用
function registerApplication(appConfig) {
  // 检测是否已经注册过，避免重复注册
  if (!apps.some(item => item.name === appConfig.name)) {
    apps.push(Object.assign({
      ...appConfig,
      status: NOT_LOADED
    }));
  }
}

function toLoad(app) {
  app.status = LOADING_SOURCE_CODE;
  return app.loadApp(app).then((val) => {
    app.status = NOT_MOUNTED;
    app.mount = val.mount
    app.unmount = val.unmount
    return app;
  });
}

function toUnload(app) {
  app.status = UNLOADING;
  delete app.mount;
  delete app.unmount;
  app.status = NOT_LOADED;
  return app;
}

function toUnmount(app) {
  app.status = UNMOUNTING;
  app.unmount.map(f => f())
  app.status = NOT_MOUNTED;
  return app;
}

function toMount(app) {
  app.status = "MOUNTING";
  app.mount.map(f => f())
  app.status = MOUNTED
}

function getAppChanges() {
  const appsToUnload = [],
    appsToUnmount = [],
    appsToLoad = [],
    appsToMount = [];

  apps.forEach((app) => {
    const appShouldBeActive = app.activeWhen === window.location.pathname // !
    switch (app.status) {
      case NOT_LOADED: // 未加载，初始化
        appsToLoad.push(app);
        break;
      case NOT_MOUNTED:
        if (appShouldBeActive) { // 激活，挂载
          appsToMount.push(app);
        }
        break;
      case MOUNTED:
        if (!appShouldBeActive) { // 卸载
          appsToUnmount.push(app);
        }
        break;
    }
  });
  // console.log(appsToUnload, appsToUnmount, appsToLoad, appsToMount);
  return { appsToUnload, appsToUnmount, appsToLoad, appsToMount };
}

// 路由变换
function reroute() {
  const { appsToUnload, appsToUnmount, appsToLoad, appsToMount } = getAppChanges();
  if (started) {
    // 重新渲染应用
    const unloadPromises = appsToUnload.map(toUnload); // 清除
    const unmountUnloadPromises = appsToUnmount.map(toUnmount); // 卸载
    const mountPromises = appsToMount.map(toMount); // 挂载
  } else {
    return appsToLoad.map(toLoad); // 初始化
  }
}

window.addEventListener("popstate", (e) => {
  e.preventDefault()
  reroute()
});
window.addEventListener("pushState", (e) => {
  reroute()
});
window.addEventListener("replaceState", (e) => {
  reroute()
});
