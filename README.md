# 语译 · 个人在线中英互译

一个简洁、有个性、可随时在线的中英互译小工具，专为运维 IT 人员日常翻译技术文档、英文邮件而设计。

- **翻译引擎**：百度翻译开放平台 API
- **托管方式**：Vercel 无服务器托管（免费，无需自备服务器/域名）
- **安全**：百度密钥只存在 Vercel 后端环境变量，浏览器不接触密钥

## 功能

- 中英互译，默认自动检测语言
- 可输入或粘贴长文档，一键出结果
- 浅色/深色主题切换（记住你的选择）
- 自动翻译（输入停顿 1.5 秒后自动翻译）
- 一键复制译文、互换语言、清空
- 本地历史记录（最多 50 条，仅存于你的浏览器）

## 技术栈

- 前端：原生 HTML / CSS / JS（无构建、无依赖）
- 后端：Vercel Serverless Function（Node.js，仅用内置 `crypto` + `fetch`）

## 目录结构

```
├── api/translate.js     # 后端代理函数（接触百度密钥的唯一地方）
├── public/              # 前端静态资源
│   ├── index.html
│   ├── style.css
│   └── app.js
├── vercel.json          # Vercel 配置
├── package.json
└── .env.example         # 本地开发环境变量示例
```

## 一、准备百度翻译凭据

1. 打开 [百度翻译开放平台](https://fanyi-api.baidu.com/)，登录后进入「管理控制台」。
2. 开通「通用文本翻译 API」（标准版免费；高级版免费且有更高 QPS，根据自己情况选）。
3. 在「开发者信息」中找到你的 **AppID** 和 **密钥（Secret）**，保存好，后面要用。

> 标准版与高级版的接口调用方式完全一致（`appid + salt + MD5 签名`），本工具两者通用，无需改代码。

## 二、本地运行（可选，方便调试）

```bash
# 1. 安装 Vercel CLI（已装可跳过）
npm i -g vercel

# 2. 复制环境变量示例并填入真实凭据
cp .env.example .env
# 编辑 .env，填入 BAIDU_APPID 和 BAIDU_SECRET

# 3. 启动本地服务
vercel dev
# 访问 http://localhost:3000
```

## 三、部署到 Vercel（在线访问）

```bash
# 1. 登录
vercel login

# 2. 在项目目录首次部署（会自动创建项目并给你一个 xxx.vercel.app 子域名）
vercel
```

部署后还需要配置线上环境变量：

1. 登录 Vercel 控制台，进入刚创建的项目。
2. 依次打开 **Settings → Environment Variables**。
3. 添加两个变量并保存：
   - `BAIDU_APPID` = 你的 AppID
   - `BAIDU_SECRET` = 你的密钥
4. 回到 **Deployments**，点击最新部署右侧的 `⋯` → `Redeploy`，重新部署生效。
5. 访问 `https://<你的项目名>.vercel.app`，完成！

> 之后每次代码更新，push 到 Git 或运行 `vercel --prod` 即可自动重新部署。

## 使用小技巧

- 快捷键：`Ctrl/Cmd + Enter` 翻译，`Ctrl/Cmd + K` 清空。
- 开启「自动翻译」后，粘贴长文档稍等片刻即自动出结果。

## 常见问题

**翻译提示「未授权 / 签名错误」**：检查 Vercel 后台的 `BAIDU_APPID` / `BAIDU_SECRET` 是否与百度控制台一致，并确认已重新部署。

**提示「请求过于频繁」**：百度翻译标准版 QPS 约 1 次/秒，连续快速翻译会触发限制，稍等片刻再试即可。

**本地看不到效果但线上正常 / 反之**：本地使用 `.env` 文件，线上使用 Vercel 环境变量，两者是分开配置的。

## 安全说明

`.env` 和密钥不会提交进 git（见 `.gitignore`）。请勿把百度密钥写入任何前端代码或公开仓库。