// A classic script can also explain why opening index.html as file:// cannot load modules.
(() => {
  const showError = text => {
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = text;
    document.querySelector('#main').replaceChildren(message);
  };
  if (location.protocol === 'file:') {
    showError('请先在项目目录运行 npm start，再打开 http://127.0.0.1:8000/ 预览。也可以直接使用已发布的网站链接。');
    return;
  }
  const mainUrl = new URL('./main.js', document.currentScript.src);
  import(mainUrl.href).catch(error => {
    console.error(error);
    showError('页面未能加载，请检查网络后刷新。如果刚更新网站，请确认 src 和 data 文件夹也已上传。');
  });
})();
