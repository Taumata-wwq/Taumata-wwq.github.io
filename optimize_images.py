#!/usr/bin/env python3
"""
图片优化脚本
- 将图片压缩到适合网页的尺寸和质量
- 原地替换 assets/images/ 中的图片
- 生成缩略图用于列表/卡片展示（_thumb 后缀）
"""

import os
import sys
from PIL import Image

IMG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'images')
MAX_WIDTH = 1920        # 大图最大宽度
THUMB_WIDTH = 600       # 缩略图宽度
JPEG_QUALITY = 85       # JPEG 压缩质量
JPEG_EXT = {'.jpg', '.jpeg'}
PNG_EXT = {'.png'}
ALL_EXT = JPEG_EXT | PNG_EXT | {'.webp', '.gif'}


def optimize_image(filepath):
    """压缩单张图片，返回 (原大小, 新大小)"""
    orig_size = os.path.getsize(filepath)
    ext = os.path.splitext(filepath)[1].lower()

    img = Image.open(filepath)
    # 转换模式：RGBA/P 保持不变，其他转为 RGB
    if img.mode in ('RGBA', 'LA', 'P'):
        has_transparency = 'transparency' in img.info or img.mode == 'RGBA'
    else:
        has_transparency = False
        if img.mode != 'RGB':
            img = img.convert('RGB')

    # 缩放大图
    w, h = img.size
    if w > MAX_WIDTH:
        new_h = int(h * MAX_WIDTH / w)
        img = img.resize((MAX_WIDTH, new_h), Image.LANCZOS)

    # 保存
    if ext in JPEG_EXT:
        img = img.convert('RGB') if img.mode != 'RGB' else img
        img.save(filepath, 'JPEG', quality=JPEG_QUALITY, optimize=True)
    elif ext in PNG_EXT:
        if not has_transparency and (img.mode == 'RGBA' or 'transparency' in img.info):
            # 有透明通道的 PNG 保持 PNG
            img.save(filepath, 'PNG', optimize=True)
        else:
            # 无透明的 PNG 也保持 PNG 但优化
            img.save(filepath, 'PNG', optimize=True)
    else:
        img.save(filepath, optimize=True)

    new_size = os.path.getsize(filepath)
    return orig_size, new_size


def make_thumbnail(filepath):
    """为大图生成缩略图（_thumb 后缀），返回缩略图路径或 None"""
    ext = os.path.splitext(filepath)[1].lower()
    if ext not in ALL_EXT:
        return None

    img = Image.open(filepath)
    w, h = img.size
    if w <= THUMB_WIDTH:
        return None  # 已经够小，不需要缩略图

    new_h = int(h * THUMB_WIDTH / w)
    thumb = img.resize((THUMB_WIDTH, new_h), Image.LANCZOS)

    name = os.path.splitext(os.path.basename(filepath))[0]
    thumb_path = os.path.join(os.path.dirname(filepath), name + '_thumb.jpg')
    thumb = thumb.convert('RGB') if thumb.mode != 'RGB' else thumb
    thumb.save(thumb_path, 'JPEG', quality=80, optimize=True)
    return thumb_path


def main():
    if not os.path.isdir(IMG_DIR):
        print(f"目录不存在: {IMG_DIR}")
        sys.exit(1)

    files = []
    for name in sorted(os.listdir(IMG_DIR)):
        ext = os.path.splitext(name)[1].lower()
        if ext in ALL_EXT and '_thumb' not in name:
            files.append(os.path.join(IMG_DIR, name))

    if not files:
        print("没有找到图片文件")
        return

    print(f"找到 {len(files)} 张图片，开始优化…\n")
    total_orig = 0
    total_new = 0
    thumb_count = 0

    for fp in files:
        name = os.path.basename(fp)
        try:
            orig, new = optimize_image(fp)
            total_orig += orig
            total_new += new
            ratio = (1 - new / orig) * 100 if orig > 0 else 0
            print(f"  {name}: {orig/1024:.0f}KB → {new/1024:.0f}KB (-{ratio:.0f}%)")

            # 生成缩略图
            thumb_path = make_thumbnail(fp)
            if thumb_path:
                thumb_count += 1
        except Exception as e:
            print(f"  {name}: 失败 - {e}")
            total_orig += os.path.getsize(fp)
            total_new += os.path.getsize(fp)

    print(f"\n总计: {total_orig/1024/1024:.1f}MB → {total_new/1024/1024:.1f}MB "
          f"(节省 {(total_orig-total_new)/1024/1024:.1f}MB)")
    if thumb_count:
        print(f"生成了 {thumb_count} 张缩略图")


if __name__ == '__main__':
    main()
