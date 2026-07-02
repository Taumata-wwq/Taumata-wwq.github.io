#!/usr/bin/env python3
"""
Taumata 本地开发服务器
- 静态文件服务（支持 ES module）
- POST /api/save  → 直接写入 projects.json
- GET  /api/list-images → 列出 assets/images/ 中的原图（排除 thumb/ 子目录）
- POST /api/upload-image → 保存外部图片到 assets/images/（时间戳命名）并自动生成缩略图
- POST /api/delete-image → 删除原图及对应缩略图
"""

import json
import os
import re
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

PORT = 8000
ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(ROOT, 'assets', 'data', 'projects.json')
IMG_DIR = os.path.join(ROOT, 'assets', 'images')
THUMB_DIR = os.path.join(IMG_DIR, 'thumb')
THUMB_WIDTH = 600
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
        elif path == '/api/delete-image':
            self._handle_delete()
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

    # ---------- 列出图片（排除 thumb 子目录，按名称倒序） ----------
    def _handle_list_images(self):
        images = []
        if os.path.isdir(IMG_DIR):
            for name in os.listdir(IMG_DIR):
                full = os.path.join(IMG_DIR, name)
                if not os.path.isfile(full):
                    continue  # 跳过子目录（thumb/）
                ext = os.path.splitext(name)[1].lower()
                if ext in IMG_EXT:
                    images.append(name)
        # 按名称倒序（新上传的时间戳更大，排在前）
        images.sort(reverse=True)
        self._json_ok({'images': images})

    # ---------- 上传图片（同时生成缩略图） ----------
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

        # 自动生成缩略图
        thumb_path = self._make_thumbnail(filepath)

        self._json_ok({
            'ok': True,
            'path': f'assets/images/{filename}',
            'filename': filename,
            'thumb': f'assets/images/thumb/{os.path.splitext(filename)[0]}.jpg' if thumb_path else None
        })

    # ---------- 删除图片（原图 + 缩略图） ----------
    def _handle_delete(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            payload = json.loads(body)
            filename = payload.get('filename', '').strip()
            if not filename:
                self._json_err(400, 'filename 不能为空')
                return
            # 安全检查：禁止路径穿越
            if '/' in filename or '\\' in filename or '..' in filename:
                self._json_err(400, '非法文件名')
                return
            ext = os.path.splitext(filename)[1].lower()
            if ext not in IMG_EXT:
                self._json_err(400, '不支持的文件类型')
                return
            filepath = os.path.join(IMG_DIR, filename)
            deleted = []
            # 删除原图
            if os.path.isfile(filepath):
                os.remove(filepath)
                deleted.append(filename)
            # 删除缩略图（同名 .jpg）
            thumb_name = os.path.splitext(filename)[0] + '.jpg'
            thumb_path = os.path.join(THUMB_DIR, thumb_name)
            if os.path.isfile(thumb_path):
                os.remove(thumb_path)
                deleted.append('thumb/' + thumb_name)
            self._json_ok({'ok': True, 'deleted': deleted})
        except json.JSONDecodeError:
            self._json_err(400, 'JSON 格式错误')
        except Exception as e:
            self._json_err(500, str(e))

    # ---------- 生成缩略图（保存到 thumb/ 子目录，统一 .jpg 格式） ----------
    @staticmethod
    def _make_thumbnail(filepath):
        if not HAS_PIL:
            print('[thumb] PIL 未安装，跳过缩略图生成')
            return None
        try:
            img = Image.open(filepath)
            w, h = img.size
            if w > THUMB_WIDTH:
                new_h = int(h * THUMB_WIDTH / w)
                thumb = img.resize((THUMB_WIDTH, new_h), Image.LANCZOS)
            else:
                thumb = img.copy()
            os.makedirs(THUMB_DIR, exist_ok=True)
            name = os.path.splitext(os.path.basename(filepath))[0]
            thumb_path = os.path.join(THUMB_DIR, name + '.jpg')
            if thumb.mode != 'RGB':
                thumb = thumb.convert('RGB')
            thumb.save(thumb_path, 'JPEG', quality=80, optimize=True)
            print(f'[thumb] 已生成: {os.path.basename(thumb_path)} ({thumb.size[0]}x{thumb.size[1]})')
            return thumb_path
        except Exception as e:
            print(f'[thumb] 生成失败 {filepath}: {e}')
            return None

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
        # 静态资源缓存策略：
        # - 图片（时间戳命名，永不改变）→ 缓存 30 天 + immutable
        # - CSS/JS（可能更新）→ 缓存 7 天
        # - projects.json / API → 不缓存
        path = urlparse(self.path).path.lower()
        if any(path.endswith(ext) for ext in ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif')):
            self.send_header('Cache-Control', 'public, max-age=2592000, immutable')
        elif any(path.endswith(ext) for ext in ('.css', '.js')):
            self.send_header('Cache-Control', 'public, max-age=604800')
        elif path.endswith('projects.json') or path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
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
