# Calene

基于 [Galène](https://galene.org/) WebRTC SFU 的**双人沉浸式视频聊天 & 投屏伴随 Web App**，使用纯 **Vite + Svelte 5 + Tailwind CSS v4** 构建，并深度融合现代 Chrome 前沿 Web 平台能力。

## 核心特性

- **深空电影感毛玻璃 UI**：全屏沉浸画布、自动隐匿底部胶囊、发言声纹微光、iPhone 安全区（`100dvh` + `env(safe-area-inset-*)`）。
- **零摩擦四态流转**：镜像候场（自动探测 `.status.json` 在线状态 & 记住固定房间凭证）→ 单人等待（一键邀请/系统分享）→ 双人面对面（磁吸可拖拽/折叠自拍浮窗）→ 投屏一起看舞台。
- **跨端智能适配**：
  - **桌面 Chrome**：Document Picture-in-Picture + Auto-PiP 伴随置顶小窗、Captured Surface Control（不切标签页直接滚屏/缩放共享页）、View Transitions 物理转场、Native Popover + CSS Anchor Positioning、Media Session 硬件键控制、`setSinkId` 扬声器热切换、Screen Wake Lock、PWA 标题栏融合。
  - **iPhone / Safari**：竖屏投屏自动上下分屏（上方 16:9 投屏支持双指捏合缩放，下方对方大画面）、横屏全屏沉浸、一键翻转前后摄、自动隐藏不支持的网页投屏按钮。
- **零后端改造的双人微交互**（复用 Galène 原生协议）：投屏激光笔点击涟漪、自动淡出悬浮消息与飘屏表情、拖拽 P2P 文件直传（WebRTC DataChannel）、本地离屏 Canvas 拍照留念。
- **严格 CSP 兼容**：零内联脚本、零内联样式、零 `blob:` 图片标签，可直接部署进 Galène `static/` 目录。

## 开发环境（devenv + Node.js + Galène）

本项目通过 [devenv](https://devenv.sh/) 统一管理 Node.js 与本地 Galène 服务端（配置见 `devenv.nix`）：

```sh
# 首次安装依赖
devenv shell -- npm install

# 一键同时启动本地 Galène (127.0.0.1:8443)、Vite 热更新 (5173) 与 Tailscale HTTPS 代理 (443)
# 默认加载 ./groups/example.json（测试账号：ali / bob，密码：1234）
# iPhone 直接打开 Tailscale 打印的 https://<host>.<tailnet>.ts.net/group/example/ 即可秒级热更新调试
# 附带调试浮层：URL 加 ?debug=1，或在通话内连点 3 下左上角房间胶囊即可开关视口/安全区/视频盒模型数值
devenv up

# 异常退出时手动清理 tailscale serve 规则
devenv shell -- serve-reset

# 发版前验证生产构建 + Galène 严格 CSP（方式 2：直接挂载 dist/ 到 Galène -static）
devenv shell -- preview-galene
```

如需临时代理到外部 Galène 实例，可覆盖环境变量：

```sh
VITE_GALENE_PROXY_TARGET=https://your-galene-host devenv shell -- npm run dev
```

## 构建与部署

```sh
npm run check   # TypeScript & Svelte 5 类型检查
npm run build   # 生成 dist/（同时包含 index.html 与 galene.html 双入口）
```

部署方式：

1. **NixOS Flake 集成（推荐）**：本仓库导出 `packages.<system>.default` 与 `overlays.default`，构建产物即完整静态目录，可直接挂载到 `services.galene.staticDir`：

   ```nix
   # flake.nix
   inputs.calene = {
     url = "github:p-zany/calene";
     inputs.nixpkgs.follows = "nixpkgs";
   };

   # NixOS 模块中
   services.galene.staticDir = inputs.calene.packages.${pkgs.stdenv.hostPlatform.system}.default;
   ```

2. **直接替换 Galène `static/` 目录**：将 `dist/` 内所有文件复制到 Galène 的 `static/` 目录，同源零配置即可支持 `/` 与 `/group/<name>/`。
3. **独立静态托管 + 反代**：部署 `dist/` 到 Nginx / Caddy / Cloudflare Pages，反代 `/ws` 与 `/group/*/.status`（含 `.status.json`）到 Galène 服务（或构建时通过 `VITE_GALENE_ORIGIN` 指定服务端地址）。
