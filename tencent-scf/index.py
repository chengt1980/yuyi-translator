# -*- coding: utf-8 -*-
# 腾讯云 云函数 SCF —— 百度大模型文本翻译 API 代理
# 用途：浏览器 -> 腾讯云函数(持 API Key) -> 百度大模型文本翻译 API
# 说明：该接口无 CORS/JSONP，纯前端无法直连，故经本函数转发。
# 运行入口：main_handler
#
# 密钥建议通过「环境变量」注入，避免明文。未配置环境变量时回退到下方默认值。
#
# 环境变量：
#   BAIDU_APPID   百度翻译 AppID
#   BAIDU_API_KEY 百度大模型文本翻译 API 的 API Key

import base64
import json
import os
import urllib.request as ur

UPSTREAM = 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate'

APPID = os.environ.get('BAIDU_APPID', '20260922002689300')
API_KEY = os.environ.get('BAIDU_API_KEY', 'A4B9_daouitvlqic8voc6q0a0')

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
}


def _resp(status_code, body, extra_headers=None):
    """返回 SCF 事件函数 + API 网关约定的响应结构。"""
    headers = dict(CORS_HEADERS)
    if extra_headers:
        headers.update(extra_headers)
    if isinstance(body, (dict, list)):
        body = json.dumps(body, ensure_ascii=False)
    return {
        'statusCode': status_code,
        'headers': headers,
        'body': body,
    }


def main_handler(event, context):
    # 预检请求（部分场景由 API 网关跨域配置拦截，这里也兜底处理）
    method = (event.get('httpMethod') or 'GET').upper()
    if method == 'OPTIONS':
        return _resp(200, '')

    if method != 'POST':
        return _resp(405, {'error_code': '405', 'error_msg': 'Method Not Allowed'})

    # 解析请求体（API 网关可能以 base64 传回）
    raw = event.get('body') or '{}'
    if event.get('isBase64Encoded'):
        try:
            raw = base64.b64decode(raw).decode('utf-8', 'ignore')
        except Exception:
            pass
    try:
        data = json.loads(raw)
    except Exception:
        return _resp(400, {'error_code': '400', 'error_msg': 'Invalid JSON body'})

    q = (data or {}).get('q')
    fr = (data or {}).get('from')
    to = (data or {}).get('to')
    if not q or not fr or not to:
        return _resp(200, {'error_code': '54000', 'error_msg': '参数缺失：需要 q / from / to'})

    payload = json.dumps({
        'appid': APPID,
        'q': q,
        'from': fr,
        'to': to,
        'model_type': (data or {}).get('model_type') or 'llm',
    }, ensure_ascii=False).encode('utf-8')

    req = ur.Request(UPSTREAM, data=payload, headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY,
    })

    try:
        with ur.urlopen(req, timeout=15) as resp:
            text = resp.read().decode('utf-8', 'ignore')
            return _resp(resp.status, text)
    except Exception as e:
        return _resp(502, {'error_code': '599', 'error_msg': '无法连接百度：%s' % e})