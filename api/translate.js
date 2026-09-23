// 百度翻译 API 代理函数
// 这是唯一接触百度密钥(BAIDU_SECRET)的地方，浏览器永远不会访问到它。
// Vercel Node Serverless 函数，不需要任何第三方依赖。

const crypto = require('crypto');

const BAIDU_API = 'https://api.fanyi.baidu.com/api/trans/vip/translate';

// 错误码 -> 友好提示
const ERROR_MESSAGES = {
  '52003': '未授权：APPID 或密钥不正确，请检查 Vercel 环境变量。',
  '54001': '签名错误：密钥(SECRET)配置有误。',
  '54003': '请求过于频繁，超出免费版 QPS(约1次/秒)限制，请稍候再试。',
  '58001': '不支持的翻译方向，请检查语言参数。',
  '54000': '请求参数有误。',
  '58002': '服务被禁用或配额不足，请检查百度控制台。',
};

function md5(text) {
  return crypto.createHash('md5').update(text, 'utf8').digest('hex');
}

module.exports = async function (req, res) {
  // 仅允许 POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: '仅支持 POST 请求。' });
    return;
  }

  const appid = process.env.BAIDU_APPID;
  const secret = process.env.BAIDU_SECRET;

  if (!appid || !secret) {
    res.status(500).json({
      error: '后端未配置 BAIDU_APPID / BAIDU_SECRET 环境变量，请在 Vercel 后台配置后重新部署。',
    });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'object' ? req.body : {};
  } catch (e) {
    body = {};
  }

  const q = (body.q || '').toString().trim();
  const from = (body.from || 'auto').toString();
  const to = (body.to || 'zh').toString();

  if (!q) {
    res.status(400).json({ error: '请输入待翻译的内容。' });
    return;
  }

  const salt = Date.now().toString();
  const sign = md5(appid + q + salt + secret);

  const params = new URLSearchParams({
    q,
    from,
    to,
    appid,
    salt,
    sign,
  });

  try {
    const upstream = await fetch(BAIDU_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: params.toString(),
    });

    const data = await upstream.json();

    // 百度返回 error_code 表示失败
    if (data.error_code) {
      const msg =
        ERROR_MESSAGES[data.error_code] ||
        `百度翻译返回错误(${data.error_code})：${data.error_msg || '未知错误'}`;
      res.status(200).json({ error: msg, error_code: data.error_code });
      return;
    }

    // 成功：data.trans_result = [{ src, dst }, ...]
    res.status(200).json({
      ok: true,
      from: data.from || from,
      to: data.to || to,
      result: (data.trans_result || []).map((t) => t.dst),
    });
  } catch (e) {
    res.status(502).json({ error: '无法连接百度翻译服务，请检查网络或稍后重试。' });
  }
};