# -*- coding: utf-8 -*-
"""
画影客 - 参考素材导入工具 (Maya Python 插件)
=============================================
功能：
  1. 选择 PNG 序列帧文件夹（由画影客导出，或任意序列帧）
  2. 自动创建正面相机 + imagePlane 加载序列
  3. 自动对齐：相机对准 imagePlane、匹配帧率/分辨率
  4. 时间轴控制器：播放/暂停/逐帧/归零
  5. 可创建多视角（正面/侧面/背面）imagePlane 参考

安装：
  将本文件放入 Maya 脚本目录（如 Documents/maya/scripts/）
  在 Maya 脚本编辑器中执行：
      import artshadow_ref
      artshadow_ref.build_menu()
  或直接运行窗口：artshadow_ref.show()

用法：
  1. 执行后出现窗口
  2. 选择序列帧文件夹（图片名为 001.png、002.png... 或 name_001.png 均可）
  3. 点击「导入参考」
  4. 自动创建相机 + imagePlane，并设置播放范围
"""

from __future__ import print_function
import os
import re

import maya.cmds as cmds
import maya.mel as mel


# ---------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------
def find_sequence_files(folder):
    """扫描文件夹，找出图片序列（按文件名中的数字排序）"""
    exts = ('.png', '.jpg', '.jpeg', '.tga', '.tif', '.tiff', '.exr', '.bmp')
    files = []
    for f in os.listdir(folder):
        low = f.lower()
        if low.endswith(exts):
            files.append(f)
    if not files:
        return None, None

    def frame_key(name):
        nums = re.findall(r'(\d+)', name)
        return int(nums[-1]) if nums else 0

    files.sort(key=frame_key)
    return os.path.join(folder, files[0]), len(files)


def get_image_size(image_path):
    """读取图片尺寸（读取 PNG/JPEG 头部，快速，不依赖 Maya 加载）"""
    try:
        with open(image_path, 'rb') as f:
            head = f.read(30)
        if head[:8] == b'\x89PNG\r\n\x1a\n':
            import struct
            w, h = struct.unpack('>II', head[16:24])
            return w, h
        if head[:2] == b'\xff\xd8':
            # JPEG: 扫描 SOF 段
            i = 2
            while i < len(head):
                if head[i] != 0xFF:
                    i += 1
                    continue
                marker = head[i+1]
                if marker in (0xC0, 0xC1, 0xC2, 0xC3):
                    h, w = struct.unpack('>HH', head[i+5:i+9])
                    return w, h
                i += 2
    except Exception:
        pass
    return 1920, 1080


# ---------------------------------------------------------------
# 核心：创建参考相机 + imagePlane
# ---------------------------------------------------------------
def create_reference(view, image_folder, cam_name=None, img_scale=10.0,
                     rotate=None, frame_range=None):
    """
    创建一个相机 + imagePlane 参考。

    参数:
        view: 'front' / 'side' / 'back' / 'top' 等，决定相机朝向
        image_folder: 序列帧文件夹
        cam_name: 自定义相机名（默认 参考_{view}）
        img_scale: imagePlane 宽度（场景单位，默认 10）
        rotate: 额外旋转 (x,y,z)，用于微调
        frame_range: (startFrame, endFrame) 覆盖播放范围
    返回: 相机名
    """
    seq_file, frame_count = find_sequence_files(image_folder)
    if not seq_file:
        raise RuntimeError(u'文件夹中没有找到图片序列: %s' % image_folder)

    w, h = get_image_size(seq_file)
    if not w or not h:
        w, h = 1920, 1080

    cam = cam_name or ('ref_%s_cam' % view)
    if cmds.objExists(cam):
        cmds.delete(cam)

    # 创建相机
    cam = cmds.camera(name=cam, focalLength=50, displayResolution=False)[0]

    # 基础朝向（相机的 -Z 方向对着 imagePlane 正面）
    orient = {'front': (0, 0, 0), 'side': (0, 90, 0), 'back': (0, 180, 0),
              'top': (-90, 0, 0), 'bottom': (90, 0, 0)}
    rx, ry, rz = orient.get(view, (0, 0, 0))
    if rotate:
        rx += rotate[0]; ry += rotate[1]; rz += rotate[2]
    cmds.rotate(rx, ry, rz, cam)

    # 相机位置（离参考面一定距离）
    dist = img_scale * 3.0
    cmds.move(0, 0, dist, cam)

    # 创建 imagePlane
    plane = cmds.imagePlane(camera=cam, name='ref_%s_plane' % view,
                            width=img_scale, height=img_scale * h / float(w),
                            frameIncrement=1.0,
                            imageName=seq_file.replace('\\', '/'),
                            useFrameExtension=True,
                            frameOffset=0)[0]
    # 确保序列帧名带 # 占位（Maya 序列格式）
    base = re.sub(r'\d+\.(png|jpg|jpeg|tga|tif|tiff|exr|bmp)$',
                  r'#.#\1', seq_file, flags=re.I)
    cmds.setAttr(plane + '.imageName', base.replace('\\', '/'), type='string')
    cmds.setAttr(plane + '.useFrameExtension', 1)
    cmds.setAttr(plane + '.frameExtension', 1)

    # imagePlane 朝向：默认面对相机 -Z，无需翻转
    # 但侧面视角需要转 90 度对准 XZ 平面
    if view in ('side', 'back'):
        cmds.rotate(0, 90 if view == 'side' else 0, 0, plane)
    elif view == 'top':
        cmds.rotate(-90, 0, 0, plane)

    # 设置播放范围
    if frame_range:
        start, end = frame_range
    else:
        start = 1
        end = max(1, frame_count)
    cmds.playbackOptions(min=start, max=end, ast=start, aet=end)

    # 锁定选择方便操作
    cmds.select(cam)
    print(u'[画影客] 参考已创建: %s (序列 %d 帧, %dx%d)' % (cam, frame_count, w, h))
    return cam


# ---------------------------------------------------------------
# 时间轴控制（方便逐帧看参考）
# ---------------------------------------------------------------
def set_fps(fps=25):
    """设置时间轴帧率"""
    mapping = {24: 'game', 25: 'pal', 30: 'ntsc', 50: 'pal', 60: 'game'}
    key = 25
    for k in mapping:
        if abs(k - fps) < abs(key - fps):
            key = k
    try:
        mel.eval('currentUnit -time %s' % mapping[key])
        cmds.playbackOptions(loop='continuous')
    except Exception:
        pass


def jump_start():
    cmds.currentTime(cmds.playbackOptions(q=True, min=True))


def jump_end():
    cmds.currentTime(cmds.playbackOptions(q=True, max=True))


# ---------------------------------------------------------------
# 窗口 UI
# ---------------------------------------------------------------
class ReferenceImporter(object):
    def __init__(self):
        self.window = 'artshadow_ref_win'
        self.folder = ''

    def show(self):
        if cmds.window(self.window, exists=True):
            cmds.deleteUI(self.window)
        self.window = cmds.window(self.window, title=u'画影客 - 参考素材导入',
                                  widthHeight=(400, 320), sizeable=True)

        # 主布局：所有控件自动挂到当前布局，用 setParent('..') 返回
        cmds.columnLayout(adjustableColumn=True, rowSpacing=6)

        cmds.text(label=u'选择序列帧文件夹（画影客导出的 PNG 序列）', align='left')
        cmds.textFieldButtonGrp('as_folder', label=u'文件夹:',
                                buttonLabel=u'浏览...',
                                buttonCommand=self.browse_folder)

        # 视角
        cmds.rowLayout(numberOfColumns=2, columnWidth2=(90, 240))
        cmds.text(label=u'视角:', align='right')
        cmds.optionMenu('as_view')
        cmds.menuItem(label=u'正面 front')
        cmds.menuItem(label=u'侧面 side')
        cmds.menuItem(label=u'背面 back')
        cmds.menuItem(label=u'顶面 top')
        cmds.setParent('..')

        # 参考宽度
        cmds.rowLayout(numberOfColumns=2, columnWidth2=(90, 240))
        cmds.text(label=u'参考宽度:', align='right')
        cmds.floatFieldGrp('as_scale', numberOfFields=1, value1=10.0, label='')
        cmds.setParent('..')

        # 帧率
        cmds.rowLayout(numberOfColumns=2, columnWidth2=(90, 240))
        cmds.text(label=u'帧率:', align='right')
        cmds.floatFieldGrp('as_fps', numberOfFields=1, value1=25.0, label='')
        cmds.setParent('..')

        cmds.separator(h=8)

        # 按钮行
        cmds.rowLayout(numberOfColumns=3, columnWidth3=(120, 90, 90))
        cmds.button(label=u'导入参考', command=self.do_import)
        cmds.button(label=u'首帧', command=lambda _: jump_start())
        cmds.button(label=u'末帧', command=lambda _: jump_end())
        cmds.setParent('..')

        cmds.button(label=u'多视角一键创建（正面+侧面+背面）',
                    command=self.do_multi)

        cmds.separator(h=4)
        cmds.scrollField('as_log', editable=False, height=120,
                         wordWrap=True)

        cmds.showWindow(self.window)

    def log(self, msg):
        cmds.scrollField('as_log', edit=True, insertText=msg + '\n', insertionPosition=0)

    def browse_folder(self, _=None):
        import re as _re
        folder = cmds.fileDialog2(dialogStyle=2, fileMode=3,
                                  caption=u'选择序列帧文件夹')
        if folder:
            self.folder = folder[0]
            cmds.textFieldButtonGrp('as_folder', edit=True, text=self.folder)

    def get_params(self):
        view_map = {u'正面 front': 'front', u'侧面 side': 'side',
                    u'背面 back': 'back', u'顶面 top': 'top'}
        view = view_map.get(cmds.optionMenu('as_view', query=True, value=True), 'front')
        scale = cmds.floatFieldGrp('as_scale', query=True, value1=True)
        fps = cmds.floatFieldGrp('as_fps', query=True, value1=True)
        return view, float(scale or 10.0), float(fps or 25.0)

    def do_import(self, _=None):
        if not self.folder:
            self.log(u'请先选择文件夹')
            return
        try:
            view, scale, fps = self.get_params()
            set_fps(fps)
            cam = create_reference(view, self.folder, img_scale=scale)
            self.log(u'✅ 创建完成: %s' % cam)
        except Exception as e:
            self.log(u'❌ 错误: %s' % e)
            import traceback
            self.log(traceback.format_exc())

    def do_multi(self, _=None):
        if not self.folder:
            self.log(u'请先选择文件夹')
            return
        try:
            view, scale, fps = self.get_params()
            set_fps(fps)
            for v in ('front', 'side', 'back'):
                create_reference(v, self.folder, img_scale=scale)
            self.log(u'✅ 多视角参考已创建 (正面/侧面/背面)')
        except Exception as e:
            self.log(u'❌ 错误: %s' % e)
            import traceback
            self.log(traceback.format_exc())


_importer = ReferenceImporter()


def show():
    _importer.show()


def build_menu():
    """在 Maya 菜单栏创建「画影客」菜单"""
    menu = 'artshadow_menu'
    if cmds.menu(menu, exists=True):
        cmds.deleteUI(menu)
    cmds.menu(menu, label=u'画影客', parent='MayaWindow', tearOff=True)
    cmds.menuItem(label=u'参考素材导入工具', command=lambda _: show())
    cmds.menuItem(label=u'创建正面参考', command=lambda _: create_reference('front', _pick_folder()))
    cmds.menuItem(label=u'创建多视角参考', command=lambda _: create_multi_quick())
    cmds.menuItem(divider=True)
    cmds.menuItem(label=u'跳转到首帧', command=lambda _: jump_start())
    cmds.menuItem(label=u'跳转到末帧', command=lambda _: jump_end())


def _pick_folder():
    import maya.cmds as _c
    folder = _c.fileDialog2(dialogStyle=2, fileMode=3, caption=u'选择序列帧文件夹')
    return folder[0] if folder else ''


def create_multi_quick():
    folder = _pick_folder()
    if folder:
        for v in ('front', 'side', 'back'):
            create_reference(v, folder, img_scale=10.0)
        print(u'[画影客] 多视角参考创建完成')


# 直接运行窗口
if __name__ == '__main__':
    show()


# Maya 拖放加载入口（消除 DROP 警告，拖入 .py 自动加载菜单）
def onMayaDroppedPythonFile(*args):
    build_menu()
    print(u'[画影客] 插件已加载，菜单栏可找到「画影客」')
