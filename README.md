# 语译 · 个人在线中英互译

一个简洁、有个性、可随时在线的中英互译小工具，专为运维 IT 人员日常翻译技术文档、英文邮件而设计。

- **翻译引擎**：百度翻译开放平台 **大模型文本翻译 API**（依托大模型理解，翻译更精准自然）
- **架构**：前端静态托管在 GitHub Pages，由腾讯云函数（函数URL）作为代理转发翻译请求
- **安全**：百度 API Key 只存在于腾讯云函数服务端，浏览器不接触密钥

## 功能

- 中英互译，默认自动检测语言
- 可输入或粘贴长文档，一键出结果
- 浅色/深色主题切换（记住你的选择）
- 自动翻译（输入时实时出结果，无需手动切换目标语言）
- 一键复制译文、互换语言、清空
- 本地历史记录（最多 50 条，仅存于你的浏览器）

## 为什么需要代理？

百度「大模型文本翻译 API」**不支持浏览器跨域**（客户端不带 `Access-Control-Allow-*` 头，也不支持 JSONP），所以纯前端无法直连它。必须由一个小代理在服务端持有 API Key 并转发请求，从而避开 CORS。这里使用腾讯云函数 SCF 的函数URL 作为代理（国内可直接访问，个人免费额度内基本零费用）。

## 目录结构

```
├── tencent-scf/index.py  # 腾讯云函数代理（持有 API Key 转发到百度）
├── public/               # 前端静态资源（GitHub Pages 托管）
│   ├── index.html
│   ├── style.css
│   └── app.js
├── worker.js             # （可选）旧 Cloudflare Worker 代理，已不用于当前方案
├── api/translate.js      # （可选）旧 Vercel 通用版代理，已不用于当前方案
└── .env.example          # 凭据说明
```

## 一、准备百度翻译凭据

1. 打开 [百度翻译开放平台](https://fanyi-api.baidu.com/)，登录后进入「管理控制台」。
2. 开通「大模型文本翻译 API」服务。
3. 在「开发者信息」获取 **AppID**；在【API Key 管理】页面创建 **API Key**（用于大模型文本翻译 API 鉴权）。保存好两者。

## 二、部署腾讯云函数代理

在腾讯云控制台创建云函数（需腾讯云账号并实名认证）：

1. 进入 [云函数控制台](https://console.cloud.tencent.com/scf)，开通服务（领取免费额度）。
2. 创建函数，运行环境选 **Python**，提交方法选「在线编辑」，粘贴 `tencent-scf/index.py` 的内容，入口函数写 `index.main_handler`。
3. （可选，更安全）在函数「高级配置 → 环境变量」里设置：
   ```
   BAIDU_APPID=你的AppID
   BAIDU_API_KEY=你的百度大模型API Key
   ```
4. 部署后，在函数详情页开启 **函数URL**：访问方式选「公网访问 / 开放」。
5. 记下生成的函数URL地址，形如：`https://<名称>-<id>.ap-guangzhou.tencentscf.com`。

## 三、把代理地址填入前端

编辑 `public/app.js`，把 `BAIDU_PROXY` 常量替换成你自己函数URL地址：

```js
const BAIDU_PROXY = 'https://<名称>-<id>.ap-guangzhou.tencentscf.com';
```

然后提交并推送到 Git，GitHub Actions 会自动重新构建部署 GitHub Pages。

## 四、本地验证（可选）

```bash
curl -s -X POST "你的函数URL地址" \
  -H 'Content-Type: application/json' \
  -d '{"appid":"你的AppID","q":"你好世界","from":"zh","to":"en","model_type":"llm"}'
```

能看到 `trans_result` 里的译文即成功。也可直接用浏览器打开 `public/index.html` 走本地服务联调。

## 使用小技巧

- 快捷键：`Ctrl/Cmd + Enter` 翻译，`Ctrl/Cmd + K` 清空。
- 开启「自动翻译」后，输入或粘贴内容即实时出结果，自动识别中英文方向。

## 常见问题

**提示「翻译服务连接失败，请确认代理已部署」**：检查 `public/app.js` 里的 `BAIDU_PROXY` 是否为你的函数URL地址、且代理地址可正常访问。

**提示「未授权 / token 错误」**：检查腾讯云函数里的 `BAIDU_APPID` / `BAIDU_API_KEY` 是否与百度控制台一致，并确认已开通「大模型文本翻译 API」服务。

**提示「访问频率受限」**：免费版有 QPS 限制，转录连续快速输入时稍慢属正常，稍等片刻再试即可。

## 安全说明

请勿把百度 API Key 写入任何纯前端（浏览器可读取）的代码。密钥应只存在于代理服务端（腾讯云函数环境变量），或用默认值兜底时注意本仓库若公开库会泄露凭据。