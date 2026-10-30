# 开发与构建

当前验证平台为 Windows 10/11 x64。需要 Node.js 22.12 或更新版本，GitHub Actions 使用 Node.js 24。

## 本地运行

```sh
npm ci
npm test
npm start
```

## 桌面与登录测试

```sh
npm run test:desktop
npm run test:desktop -- --verify-restart
npm run test:profile
```

第二条在第一条通过后运行，验证真正退出、重启后的 Cookie、本地存储和网站列表。桌面测试使用本地模拟网站，不代替你登录或提交真实答案。

`test:profile` 通过五次正常退出验证旧资料迁移、换目录后保持登录、后台网站存储，以及主动注销。构建完成后可运行：

```sh
npm run test:profile -- --packaged
```

这会复制两份实际程序，分别从不同目录启动，使用独立的测试资料。

设置 `LF_QA_PYTHON` 为 Python 路径时，还会运行只读 Win32 边缘命中检查。检查使用透明度为零、无焦点的窗口，不移动鼠标。网页截图只能核对页面布局，不能证明窗口与真实桌面的透明叠加效果；这部分需要另外做视觉检查。

## 构建 Windows 便携包

```sh
npm ci
npm test
npm run check:source
npm run package:win
```

输出为 `dist/LightWindow-<版本>-win32-x64.zip`。打包使用文件白名单和原始 Electron 运行时，不复制个人网址、浏览器缓存、登录资料或测试目录。同版本构建已存在时，先移动旧构建或更新版本号。

GitHub Actions 会执行测试、源码检查、打包和跨目录登录测试。推送与项目版本一致的 `v*` 标签后，Release 工作流会发布 ZIP；发布前应确认对应工作流成功。

## 平台与安全边界

- 目前只有 Windows 打包流程，Mac 和 Linux 未验证。
- 只接受 HTTP/HTTPS 网址。网页使用沙箱，不提供 Node.js、本地文件接口或本地控制面板的 IPC 接口。
- 默认拒绝摄像头、麦克风、定位等额外权限。
- 某些网站的 DRM、浏览器扩展、设备认证或专有登录流程可能不兼容。
- 当前没有发布者代码签名；打包时保留 Electron 运行时原始字节。

代码结构见 [ARCHITECTURE.md](ARCHITECTURE.md)，本地资料与升级见 [UPGRADING.md](UPGRADING.md)，安全说明见 [SECURITY.md](../SECURITY.md)。
