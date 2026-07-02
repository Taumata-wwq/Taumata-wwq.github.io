#!/usr/bin/env python3
"""
Taumata 本地开发服务器
- 静态文件服务（支持 ES module）
- POST /api/save  → 直接写入 projects.json
- GET  /api/list-images → 列出 assets/images/ 中的图片
- POST /api/upload-image → 保存外部图片到 assets/images/（时间戳命名）
"""

import json
import os
import re
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

PORT = 8000
ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(ROOT, 'assets', 'data', 'projects.json')
IMG_DIR = os.path.join(ROOT, 'assets', 'images')
IMG_EXT = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif'}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # ---------- API 路由 ----------
    def do_POST(self):
        path = urlparse(self.path).path
        if path == '/api/save':
            self._handle_save()
        elif path == '/api/upload-image':
            self._handle_upload()
        else:
            self.send_error(404)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/list-images':
            self._handle_list_images()
        else:
            super().do_GET()

    # ---------- 保存 projects.json ----------
    def _handle_save(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
            with open(DATA_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            self._json_ok({'ok': True, 'message': 'projects.json 已保存'})
        except json.JSONDecodeError:
            self._json_err(400, 'JSON 格式错误')
        except Exception as e:
            self._json_err(500, str(e))

    # ---------- 列出图片 ----------
    def _handle_list_images(self):
        images = []
        if os.path.isdir(IMG_DIR):
            for name in sorted(os.listdir(IMG_DIR)):
                ext = os.path.splitext(name)[1].lower()
                if ext in IMG_EXT:
                    images.append(name)
        self._json_ok({'images': images})

    # ---------- 上传图片 ----------
    def _handle_upload(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        ext = '.png'
        ct = self.headers.get('Content-Type', '')
        if 'jpeg' in ct or 'jpg' in ct:
            ext = '.jpg'
        elif 'gif' in ct:
            ext = '.gif'
        elif 'webp' in ct:
            ext = '.webp'
        elif 'svg' in ct:
            ext = '.svg'
        elif 'bmp' in ct:
            ext = '.bmp'
        elif 'avif' in ct:
            ext = '.avif'

        ts = time.strftime('%Y%m%d%H%M%S')
        filename = ts + ext
        os.makedirs(IMG_DIR, exist_ok=True)
        filepath = os.path.join(IMG_DIR, filename)
        # 避免重名
        counter = 0
        while os.path.exists(filepath):
            counter += 1
            filename = f'{ts}_{counter}{ext}'
            filepath = os.path.join(IMG_DIR, filename)

        with open(filepath, 'wb') as f:
            f.write(body)
        self._json_ok({
            'ok': True,
            'path': f'assets/images/{filename}',
            'filename': filename
        })

    # ---------- 工具方法 ----------
    def _json_ok(self, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def _json_err(self, code, msg):
        body = json.dumps({'ok': False, 'error': msg}, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def log_message(self, fmt, *args):
        # 简化日志
        print(f'[{self.log_date_time_string()}] {fmt % args}')


def main():
    print(f'Taumata 开发服务器 → http://127.0.0.1:{PORT}')
    print(f'  主页: http://127.0.0.1:{PORT}/')
    print(f'  后台: http://127.0.0.1:{PORT}/admin.html')
    print(f'  数据: {DATA_FILE}')
    print('  按 Ctrl+C 停止\n')
    server = HTTPServer(('127.0.0.1', PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止')
        server.server_close()


if __name__ == '__main__':
    main()
