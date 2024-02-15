import { loadApp } from './loadApp.js';

const NOT_LOADED = "NOT_LOADED";
const LOADING_SOURCE_CODE = "LOADING_SOURCE_CODE";
const NOT_BOOTSTRAPPED = "NOT_BOOTSTRAPPED";
const BOOTSTRAPPING = "BOOTSTRAPPING";
const NOT_MOUNTED = "NOT_MOUNTED";
const MOUNTING = "MOUNTING";
const MOUNTED = "MOUNTED";
const UPDATING = "UPDATING";
const UNMOUNTING = "UNMOUNTING";
const UNLOADING = "UNLOADING";
const LOAD_ERROR = "LOAD_ERROR";
const SKIP_BECAUSE_BROKEN = "SKIP_BECAUSE_BROKEN";

const apps = [];
const appsToUnloadMap = {};
const appsToUnMountMap = {}
let started = false;
let currentUrl = window.location.href;

export function start(opts) {
  started = true;
}

export function isStarted() {
  return started;
}

export function registerMicroApps(apps, lifeCycles) {
  apps.forEach((app) => {
    const { name, activeRule, props, ...appConfig } = app;
    registerApplication({
      name,
      loadApp: async () => {
        const { mount, unmount } = (
          await loadApp({ name, props, ...appConfig }, {}, lifeCycles)
        )();
        return {
          mount: [...mount],
          unmount: [...unmount],
        };
      },
      activeWhen: activeRule,
      customProps: props,
    });
  });
}

export function registerApplication(appConfig) {
  // 检测是否已经注册过
  if (!apps.some(item => item.name === appConfig.name)) {
    apps.push(Object.assign({
      ...appConfig,
      status: NOT_LOADED
    }));
    reroute()
  }
}

export function getAppChanges() {
  const appsToUnload = [],
    appsToUnmount = [],
    appsToLoad = [],
    appsToMount = [];

  apps.forEach((app) => {
    const appShouldBeActive = app.activeWhen === window.location.pathname
    switch (app.status) {
      case NOT_LOADED: // 未加载，初始化
        appsToLoad.push(app);
        break;
      case appShouldBeActive && NOT_MOUNTED:
        appsToMount.push(app);
        break;
      case !appShouldBeActive && MOUNTED:
        appsToUnmount.push(app);
        break;
    }
  });
  console.log(appsToUnload, appsToUnmount, appsToLoad, appsToMount);
  return { appsToUnload, appsToUnmount, appsToLoad, appsToMount };
}

export function toLoadPromise(appOrParcel) {
  return Promise.resolve().then(() => {
    appOrParcel.status = LOADING_SOURCE_CODE;
    return appOrParcel.loadPromise = Promise.resolve()
      .then(() => {
        return appOrParcel.loadApp(appOrParcel).then((val) => {
          appOrParcel.status = NOT_MOUNTED;
          appOrParcel.mount = val.mount
          appOrParcel.unmount = val.unmount
          return appOrParcel;
        });
      })

  });
}

export function reroute(pendingPromises = []) {
  let startTime, profilerKind;

  const { appsToUnload, appsToUnmount, appsToLoad, appsToMount } = getAppChanges();

  let appsThatChanged,
    oldUrl = currentUrl,
    newUrl = (currentUrl = window.location.href);
  if (isStarted()) {
    return performAppChanges();
  } else {
    return loadApps(); // 初始化
  }

  async function loadApps() {
    const loadPromises = appsToLoad.map(toLoadPromise);
  }

  function toUnloadPromise(app) {
    app.status = UNLOADING;
    delete appsToUnloadMap[app.name];
    delete app.bootstrap;
    delete app.mount;
    delete app.unmount;
    delete app.unload;
    app.status = NOT_LOADED;
    return app;
  }

  function toUnmountPromise(app) {
    app.status = UNMOUNTING;
    app.unmount.map(f => f())
    app.status = NOT_MOUNTED;
    return app;
  }


  function performAppChanges() {
    return Promise.resolve().then(() => {

      return Promise.resolve().then(() => {
        const unloadPromises = appsToUnload.map(toUnloadPromise);

        const unmountUnloadPromises = appsToUnmount.map(toUnmountPromise);

        const allUnmountPromises = unmountUnloadPromises.concat(unloadPromises);

        const unmountAllPromise = Promise.all(allUnmountPromises);

        let unmountFinishedTime;

        const loadThenMountPromises = appsToLoad.map((app) => {
          app.status = NOT_MOUNTED;
        });
        const mountPromises = appsToMount
          .filter((appToMount) => appsToLoad.indexOf(appToMount) < 0)
          .map((appToMount) => {
            appToMount.status = MOUNTED
            appToMount.mount.map(f => f())
          });

      });
    });
  }
}
window.addEventListener("hashchange", (e) => {
  e.preventDefault()
  reroute()
});
window.addEventListener("popstate", (e) => {
  e.preventDefault()
  reroute()
});
window.addEventListener("pushState", (e) => {
  reroute()
});
