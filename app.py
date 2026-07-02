#!/usr/bin/env python3
"""
Taumata 桌面管理台
- 内嵌 admin 页面（QWebEngineView）
- 后台运行 serve.py 服务器
- 菜单栏提供：服务器控制、Git 推送、查看主页等
"""

import sys
import os
import threading
import subprocess
import webbrowser
from http.server import HTTPServer

from PySide6.QtWidgets import (
    QApplication, QMainWindow, QInputDialog, QLineEdit,
    QMessageBox, QStatusBar, QProgressDialog
)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtCore import QUrl, Qt, QThread, Signal
from PySide6.QtGui import QAction, QKeySequence

PORT = 8000
ROOT = os.path.dirname(os.path.abspath(__file__))


# ---------- 后台服务器线程 ----------
class ServerThread(threading.Thread):
    def __init__(self, port=PORT):
        super().__init__(daemon=True)
        self.port = port
        self.httpd = None
        self.error = None

    def run(self):
        try:
            from serve import Handler
            Handler.protocol_version = 'HTTP/1.0'
            self.httpd = HTTPServer(('127.0.0.1', self.port), Handler)
            self.httpd.serve_forever()
        except OSError as e:
            self.error = e
        except Exception as e:
            self.error = e

    def stop(self):
        if self.httpd:
            self.httpd.shutdown()
            self.httpd.server_close()
            self.httpd = None


# ---------- Git 操作线程（避免阻塞 UI） ----------
class GitWorker(QThread):
    finished_signal = Signal(str, bool)  # (output, success)

    def __init__(self, commands, cwd=ROOT):
        super().__init__()
        self.commands = commands if isinstance(commands, list) else [commands]
        self.cwd = cwd

    def run(self):
        outputs = []
        ok = True
        for cmd in self.commands:
            try:
                result = subprocess.run(
                    cmd, cwd=self.cwd, capture_output=True, text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
                )
                if result.stdout.strip():
                    outputs.append(result.stdout.strip())
                if result.stderr.strip():
                    outputs.append(result.stderr.strip())
                if result.returncode != 0:
                    ok = False
                    break
            except Exception as e:
                outputs.append(str(e))
                ok = False
                break
        self.finished_signal.emit('\n'.join(outputs), ok)


# ---------- 主窗口 ----------
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Taumata 管理台")
        self.resize(1280, 860)
        self.server_thread = None
        self.git_workers = []

        self._start_server()
        self._setup_ui()
        self._create_menus()
        self._create_statusbar()

    # ---------- 服务器 ----------
    def _start_server(self):
        self.server_thread = ServerThread(PORT)
        self.server_thread.start()
        # 等待一小段时间检查是否启动成功
        threading.Timer(0.5, self._check_server_status).start()

    def _check_server_status(self):
        if self.server_thread.error:
            err = self.server_thread.error
            if 'Address already in use' in str(err):
                # 端口已被占用，说明已有服务器在运行，直接连接
                pass
            else:
                QMessageBox.warning(self, "服务器错误", f"无法启动服务器:\n{err}")

    def _restart_server(self):
        if self.server_thread:
            self.server_thread.stop()
        self.server_thread = ServerThread(PORT)
        self.server_thread.start()
        self.statusBar().showMessage("服务器已重启 · 127.0.0.1:%d" % PORT, 3000)
        self.web_view.reload()

    # ---------- UI ----------
    def _setup_ui(self):
        self.web_view = QWebEngineView()
        self.setCentralWidget(self.web_view)
        self.web_view.setUrl(QUrl("http://127.0.0.1:%d/admin.html" % PORT))

    def _create_menus(self):
        menubar = self.menuBar()

        # 文件菜单
        m_file = menubar.addMenu("文件(&F)")
        act_reload = QAction("刷新页面", self)
        act_reload.setShortcut(QKeySequence("F5"))
        act_reload.triggered.connect(self.web_view.reload)
        m_file.addAction(act_reload)
        m_file.addSeparator()
        act_exit = QAction("退出", self)
        act_exit.setShortcut(QKeySequence("Ctrl+Q"))
        act_exit.triggered.connect(self.close)
        m_file.addAction(act_exit)

        # 视图菜单
        m_view = menubar.addMenu("视图(&V)")
        act_admin = QAction("管理后台", self)
        act_admin.triggered.connect(lambda: self.web_view.setUrl(QUrl("http://127.0.0.1:%d/admin.html" % PORT)))
        m_view.addAction(act_admin)
        act_home = QAction("主页", self)
        act_home.triggered.connect(lambda: self.web_view.setUrl(QUrl("http://127.0.0.1:%d/" % PORT)))
        m_view.addAction(act_home)
        m_view.addSeparator()
        act_browser = QAction("在浏览器中打开", self)
        act_browser.triggered.connect(self._open_in_browser)
        m_view.addAction(act_browser)

        # 服务器菜单
        m_server = menubar.addMenu("服务器(&S)")
        act_restart = QAction("重启服务器", self)
        act_restart.triggered.connect(self._restart_server)
        m_server.addAction(act_restart)

        # Git 菜单
        m_git = menubar.addMenu("Git(&G)")
        act_status = QAction("查看状态", self)
        act_status.triggered.connect(self._git_status)
        m_git.addAction(act_status)
        m_git.addSeparator()
        act_push = QAction("推送到 GitHub…", self)
        act_push.setShortcut(QKeySequence("Ctrl+Shift+P"))
        act_push.triggered.connect(self._git_push)
        m_git.addAction(act_push)

    def _create_statusbar(self):
        sb = QStatusBar()
        sb.showMessage("服务器运行中 · 127.0.0.1:%d" % PORT)
        self.setStatusBar(sb)

    # ---------- 操作 ----------
    def _open_in_browser(self):
        url = self.web_view.url().toString()
        if not url:
            url = "http://127.0.0.1:%d/admin.html" % PORT
        webbrowser.open(url)

    def _git_status(self):
        # 检查是否为 git 仓库
        if not os.path.isdir(os.path.join(ROOT, '.git')):
            QMessageBox.information(self, "Git 状态", "当前目录还不是 Git 仓库。\n请先使用「推送到 GitHub」初始化。")
            return
        worker = GitWorker([['git', 'status', '--short'], ['git', 'log', '--oneline', '-5']])
        worker.finished_signal.connect(self._on_git_status_done)
        self.git_workers.append(worker)
        worker.start()
        self.statusBar().showMessage("正在获取 Git 状态…")

    def _on_git_status_done(self, output, ok):
        self.statusBar().showMessage("Git 状态已获取", 3000)
        title = "Git 状态" if ok else "Git 状态（有错误）"
        text = output if output else ("工作区干净" if ok else "无输出")
        QMessageBox.information(self, title, text)

    def _git_push(self):
        # 如果不是 git 仓库，先初始化
        is_repo = os.path.isdir(os.path.join(ROOT, '.git'))
        if not is_repo:
            reply = QMessageBox.question(
                self, "初始化 Git 仓库",
                "当前目录还不是 Git 仓库。\n是否要初始化并添加 GitHub 远程仓库？",
                QMessageBox.Yes | QMessageBox.No, QMessageBox.Yes
            )
            if reply != QMessageBox.Yes:
                return
            # 输入 GitHub 仓库地址
            remote_url, ok = QInputDialog.getText(
                self, "GitHub 仓库地址",
                "请输入 GitHub 仓库地址（HTTPS 或 SSH）:",
                QLineEdit.Normal,
                "https://github.com/Taumata-wwq/Taumata-wwq.github.io.git"
            )
            if not ok or not remote_url.strip():
                return
            remote_url = remote_url.strip()
            # 初始化并添加远程
            worker = GitWorker([
                ['git', 'init'],
                ['git', 'remote', 'add', 'origin', remote_url]
            ])
            progress = QProgressDialog("正在初始化 Git 仓库…", "取消", 0, 0, self)
            progress.setWindowModality(Qt.WindowModal)
            progress.setWindowTitle("Git 初始化")
            worker.finished_signal.connect(lambda out, success: self._on_init_done(out, success, progress))
            self.git_workers.append(worker)
            worker.start()
            progress.exec()
            return

        # 已是 git 仓库：检查是否有改动
        try:
            result = subprocess.run(
                ['git', 'status', '--short'], cwd=ROOT, capture_output=True, text=True,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            )
            changes = result.stdout.strip()
        except Exception:
            changes = ''

        if not changes:
            # 没有改动，直接拉取并推送
            reply = QMessageBox.question(
                self, "推送到 GitHub",
                "工作区没有未提交的改动。\n是否直接拉取远程并推送？",
                QMessageBox.Yes | QMessageBox.No, QMessageBox.No
            )
            if reply != QMessageBox.Yes:
                return
            self._do_push([])
            return

        # 有改动：输入提交信息
        msg, ok = QInputDialog.getText(
            self, "推送到 GitHub",
            "提交信息:", QLineEdit.Normal, "更新内容"
        )
        if not ok or not msg.strip():
            return
        self._do_push([msg.strip()])

    def _on_init_done(self, output, success, progress):
        progress.close()
        if not success:
            QMessageBox.warning(self, "初始化失败", output or "未知错误")
            return
        QMessageBox.information(self, "初始化成功", "Git 仓库已初始化。\n现在可以推送内容了。")
        # 继续推送
        msg, ok = QInputDialog.getText(
            self, "推送到 GitHub", "提交信息:", QLineEdit.Normal, "首次提交"
        )
        if not ok or not msg.strip():
            return
        self._do_push([msg.strip()])

    def _do_push(self, commit_msgs):
        """执行 add + commit(可选) + push"""
        commands = [['git', 'add', '-A']]
        for msg in commit_msgs:
            commands.append(['git', 'commit', '-m', msg])
        commands.append(['git', 'push', '-u', 'origin', 'HEAD'])

        worker = GitWorker(commands)
        progress = QProgressDialog("正在推送到 GitHub…", "取消", 0, 0, self)
        progress.setWindowModality(Qt.WindowModal)
        progress.setWindowTitle("Git 推送")
        worker.finished_signal.connect(lambda out, success: self._on_push_done(out, success, progress))
        self.git_workers.append(worker)
        worker.start()
        progress.exec()

    def _on_push_done(self, output, success, progress):
        progress.close()
        self.statusBar().showMessage("推送完成" if success else "推送失败", 5000)
        if success:
            QMessageBox.information(self, "推送成功", output or "已推送到 GitHub")
        else:
            QMessageBox.warning(self, "推送失败", output or "推送过程中出现错误")

    # ---------- 关闭 ----------
    def closeEvent(self, event):
        if self.server_thread:
            self.server_thread.stop()
        event.accept()


def main():
    # 确保 serve.py 能被导入
    sys.path.insert(0, ROOT)
    app = QApplication(sys.argv)
    app.setApplicationName("Taumata 管理台")
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == '__main__':
    main()
