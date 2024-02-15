export function getRender(appInstanceId, appContent) {
  const render = ({ element, container }) => {
    const containerElement = document.querySelector(container);
    // 清除容器内子元素
    while (containerElement.firstChild) {
      containerElement.removeChild(containerElement.firstChild);
    }
    if (element) {
      containerElement.appendChild(element)
    }
  };

  return render;
}