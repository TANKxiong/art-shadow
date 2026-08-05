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

    # 兼容：纯数字文件名（00001.png）Maya 可能不识别，自动重命名为 frame_0001.png
    base_dir = os.path.dirname(seq_file)
    base_n = os.path.basename(seq_file)
    if re.match(r'^\d+\.(png|jpg|jpeg|tga|tif|tiff|exr|bmp)$', base_n, re.I):
        renamed = False
        try:
            files = sorted(os.listdir(base_dir))
            for f in files:
                if re.match(r'^\d+\.(png|jpg|jpeg|tga|tif|tiff|exr|bmp)$', f, re.I):
                    new_f = 'frame_' + f
                    if not os.path.exists(os.path.join(base_dir, new_f)):
                        os.rename(os.path.join(base_dir, f), os.path.join(base_dir, new_f))
                        renamed = True
            if renamed:
                seq_file = os.path.join(base_dir, 'frame_' + base_n)
                print(u'[画影客] 已自动重命名序列为 Maya 友好格式 (frame_0001.png)')
        except Exception as e:
            print(u'[画影客] 序列重命名失败: %s' % e)

    w, h = get_image_size(seq_file)
    if not w or not h:
        w, h = 1920, 1080
    # 提示超大图片（逐帧加载慢会导致播放卡顿）
    if w > 2048 or h > 2048:
        print(u'[画影客] 提示: 图片尺寸 %dx%d 较大，Maya 逐帧加载可能卡顿；'
              u'若卡顿建议在画影客导出时选较小分辨率' % (w, h))

    # 判断序列是否已是 Maya 点号格式（ref.N.png），是则直接使用，不再生成第二套
    seq_dir = os.path.dirname(seq_file)
    seq_base = os.path.basename(seq_file)
    ext = os.path.splitext(seq_base)[1].lower()
    dot_re = re.compile(r'^ref\.\d+\.(?:png|jpg|jpeg|tga|tif|tiff|exr|bmp)$', re.I)
    if dot_re.match(seq_base):
        # 已是 ref.1.png 点号格式：直接用原目录
        maya_dir = seq_dir
        prep_ok = True
        frame_count = len([f for f in os.listdir(maya_dir) if dot_re.match(f)])
        print(u'[画影客] 序列已是 Maya 点号格式，直接使用: %s (%d 帧)' % (maya_dir, frame_count))
    elif os.path.basename(os.path.normpath(seq_dir)) == '_maya_seq':
        # 选中的文件夹本身就是 _maya_seq（旧流程遗留），直接使用，避免嵌套
        maya_dir = seq_dir
        prep_ok = True
        seq_file = os.path.join(maya_dir, 'ref.1%s' % ext)
        frame_count = len([f for f in os.listdir(maya_dir)
                           if f.lower().endswith(ext) and f.startswith('ref.')])
        print(u'[画影客] 已是 Maya 序列目录，直接使用: %s (%d 帧)' % (maya_dir, frame_count))
    else:
        # 普通序列（frame_0001.png 等）：复制到子目录 _maya_seq/ 转成点号格式
        maya_dir = os.path.join(seq_dir, '_maya_seq')
        prep_ok = False
        try:
            if not os.path.isdir(maya_dir):
                os.makedirs(maya_dir)
            # 清空旧的
            for f in os.listdir(maya_dir):
                if f.lower().endswith(ext):
                    try: os.remove(os.path.join(maya_dir, f))
                    except Exception: pass
            # 复制并按帧号重命名（去前导零，Maya 点号格式）
            files_sorted = sorted(os.listdir(seq_dir))
            frame_no = 1
            for f in files_sorted:
                if f.lower().endswith(ext) and not f.startswith('_'):
                    dst = os.path.join(maya_dir, 'ref.%d%s' % (frame_no, ext))
                    try:
                        import shutil
                        shutil.copy2(os.path.join(seq_dir, f), dst)
                        frame_no += 1
                    except Exception:
                        pass
            if frame_no > 1:
                prep_ok = True
                seq_file = os.path.join(maya_dir, 'ref.1%s' % ext)
                frame_count = frame_no - 1
                print(u'[画影客] 已准备 Maya 序列: %s (%d 帧)' % (maya_dir, frame_count))
        except Exception as e:
            print(u'[画影客] 序列准备失败，使用原目录: %s' % e)

    cam = cam_name or ('ref_%s_cam' % view)
    plane_name = 'ref_%s_plane' % view
    # 清理旧的同名相机和参考面（避免重名加序号）
    for old in cmds.ls(cam, plane_name):
        if old and cmds.objExists(old):
            try: cmds.delete(old)
            except Exception: pass
    for old in cmds.ls('ref_%s_*' % view, type='transform'):
        if old and cmds.objExists(old):
            try: cmds.delete(old)
            except Exception: pass

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

    # 创建 imagePlane：用 camera 参数创建（Maya 标准方式，平面成为相机子节点，跟随相机移动）
    # 尺寸 = 相机在平面距离处的视野大小（正好铺满相机画面）
    plane_name = 'ref_%s_plane' % view
    import math as _math
    try:
        fl = cmds.getAttr(cam + '.focalLength')
        hfa = cmds.getAttr(cam + '.horizontalFilmAperture')
        vfa = cmds.getAttr(cam + '.verticalFilmAperture')
        vfov = 2 * _math.atan(vfa / (2.0 * fl)) if fl else _math.radians(40)
        plane_h = 2.0 * dist * _math.tan(vfov / 2.0)
        plane_w = plane_h * (hfa / vfa) if vfa else plane_h * w / float(h)
    except Exception:
        plane_w = img_scale
        plane_h = plane_w * h / float(w) if w else plane_w
    try:
        cmds.imagePlane(camera=cam, name=plane_name, width=plane_w, height=plane_h)
    except Exception as e:
        # 兜底：先独立创建，再 parent 到相机（保证跟随）
        cmds.imagePlane(name=plane_name, width=plane_w, height=plane_h)
        try: cmds.parent(plane_name, cam, add=True, shape=True)
        except Exception: pass
    # 用实际创建的 transform 名（camera 模式下 Maya 可能自动改名加序号）
    # 收集创建前后的 imagePlane transform，找到新增的那个
    try:
        all_plane_transforms = cmds.ls(type='imagePlane', long=False) or []
        # imagePlane ls 返回 shape 名，转成 transform
        new_plane = None
        for sp in all_plane_transforms:
            parent = cmds.listRelatives(sp, parent=True)
            if parent and 'ref_' in parent[0] and view in parent[0]:
                new_plane = parent[0]
                break
        if new_plane:
            plane_name = new_plane
    except Exception:
        pass
    # 确认 plane_name 存在，否则搜索
    if not cmds.objExists(plane_name):
        try:
            for t in cmds.ls('ref_%s*' % view, type='transform'):
                if cmds.objExists(t):
                    plane_name = t
                    break
        except Exception:
            pass
    if not cmds.objExists(plane_name):
        raise RuntimeError(u'imagePlane transform 未找到 (尝试了 %s)' % plane_name)
    # 用名字直接找 shape
    plane_shape = None
    shapes = cmds.listRelatives(plane_name, shapes=True, type='imagePlane')
    if shapes:
        plane_shape = shapes[0]
    if not plane_shape and cmds.objExists(plane_name + 'Shape'):
        plane_shape = plane_name + 'Shape'
    if not plane_shape:
        raise RuntimeError(u'imagePlane shape 未找到: %s' % plane_name)
    print(u'[画影客] 平面已创建并挂到相机: %s (%s)' % (plane_name, plane_shape))

    # 设置序列图片：用点号格式 ref.#.png（Maya 最兼容的序列识别）
    import re as _re
    m = _re.search(r'(\d+)(\.(?:png|jpg|jpeg|tga|tif|tiff|exr|bmp))$', seq_file, _re.I)
    if m:
        maya_name = seq_file[:m.start(1)] + '#' + m.group(2)
    else:
        maya_name = seq_file
    maya_name = maya_name.replace('\\', '/')
    try:
        cmds.setAttr(plane_shape + '.imageName', maya_name, type='string')
        cmds.setAttr(plane_shape + '.useFrameExtension', 1)
        cmds.setAttr(plane_shape + '.frameExtension', 1)  # 首帧号 = 1
        cmds.setAttr(plane_shape + '.frameOffset', 0)
    except Exception as e:
        print(u'[画影客] 设置图片失败: %s' % e)

    # 确保 imagePlane 显示在相机前（depth 保持默认即可，lookThru 后可见）
    try:
        cmds.setAttr(plane_shape + '.visibility', 1)
    except Exception:
        pass

    # imagePlane 朝向：默认面对相机 -Z，无需翻转
    # 但侧面视角需要转 90 度对准 XZ 平面
    plane = plane_name  # transform 名（创建时固定 name，已清理旧的不会重名）
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
    try:
        cmds.playbackOptions(loop='once')
    except Exception:
        pass

    # 自动切换到该相机视角，确保能看到参考面
    try:
        cmds.lookThru(cam)
    except Exception:
        pass
    # 确保 imagePlane 显示
    try:
        cmds.setAttr(plane + '.visibility', 1)
        cmds.select(plane)
    except Exception:
        pass

    # 锁定选择方便操作
    cmds.select(cam)
    print(u'[画影客] 参考已创建: %s (序列 %d 帧, %dx%d)' % (cam, frame_count, w, h))
    return cam, plane


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
        self.window = cmds.window(self.window, title=u'画影客工具',
                                  widthHeight=(430, 560), sizeable=True)
        cmds.window(self.window, edit=True, minimizeButton=True)

        cmds.columnLayout(adjustableColumn=True, rowSpacing=4)

        # ===== 标题 =====
        cmds.text(label=u'画影客工具', font='boldLabelFont', height=24, align='center')

        # ===== 分区一：导入工具 =====
        cmds.frameLayout(label=u'导入工具', collapsable=True, collapse=False)
        cmds.columnLayout(adjustableColumn=True, rowSpacing=4)
        cmds.textFieldButtonGrp('as_folder', label=u'序列文件夹:', buttonLabel=u'浏览...',
                                buttonCommand=self.browse_folder)
        cmds.rowLayout(numberOfColumns=2, columnWidth2=(90, 250))
        cmds.text(label=u'视角:', align='right')
        cmds.optionMenu('as_view')
        cmds.menuItem(label=u'正面 front')
        cmds.menuItem(label=u'侧面 side')
        cmds.menuItem(label=u'背面 back')
        cmds.menuItem(label=u'顶面 top')
        cmds.setParent('..')
        cmds.rowLayout(numberOfColumns=2, columnWidth2=(90, 250))
        cmds.text(label=u'参考宽度:', align='right')
        cmds.floatFieldGrp('as_scale', numberOfFields=1, value1=20.0, label='')
        cmds.setParent('..')
        cmds.rowLayout(numberOfColumns=2, columnWidth2=(90, 250))
        cmds.text(label=u'帧率:', align='right')
        cmds.floatFieldGrp('as_fps', numberOfFields=1, value1=25.0, label='')
        cmds.setParent('..')
        cmds.button(label=u'导入参考', command=self.do_import,
                    bgc=(0.3, 0.45, 0.6), height=26)
        cmds.setParent('..')
        cmds.setParent('..')
        cmds.separator(h=4)

        # ===== 分区二：多视角 =====
        cmds.frameLayout(label=u'多视角参考', collapsable=True, collapse=False)
        cmds.columnLayout(adjustableColumn=True, rowSpacing=4)
        cmds.text(label=u'一键创建 正面 + 侧面 + 背面 三个参考相机', align='left')
        cmds.textFieldButtonGrp('as_folder_m', label=u'序列文件夹:', buttonLabel=u'浏览...',
                                buttonCommand=self.browse_folder)
        cmds.button(label=u'创建多视角', command=self.do_multi,
                    bgc=(0.3, 0.45, 0.6), height=26)
        cmds.setParent('..')
        cmds.setParent('..')
        cmds.separator(h=4)

        # ===== 分区三：时间轴 =====
        cmds.frameLayout(label=u'时间轴工具', collapsable=True, collapse=False)
        cmds.columnLayout(adjustableColumn=True, rowSpacing=4)
        cmds.button(label=u'跳转首帧', command=lambda _: jump_start(), height=24)
        cmds.button(label=u'跳转末帧', command=lambda _: jump_end(), height=24)
        cmds.button(label=u'循环播放', command=lambda _: self.toggle_loop(), height=24)
        cmds.setParent('..')
        cmds.setParent('..')
        cmds.separator(h=4)

        # ===== 日志 =====
        cmds.frameLayout(label=u'日志', collapsable=True, collapse=False)
        cmds.scrollField('as_log', editable=False, height=110, wordWrap=True)
        cmds.setParent('..')
        cmds.setParent('..')

        cmds.showWindow(self.window)


    def toggle_loop(self):
        try:
            cur = cmds.playbackOptions(query=True, loop='playbackOptions')
        except Exception:
            cur = ''
        try:
            cmds.playbackOptions(loop='continuous')
            self.log(u'已开启循环播放')
        except Exception as e:
            self.log(u'循环设置失败: %s' % e)

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
        return view, float(scale or 20.0), float(fps or 25.0)

    def do_import(self, _=None):
        if not self.folder:
            self.log(u'请先选择文件夹')
            return
        try:
            view, scale, fps = self.get_params()
            set_fps(fps)
            cam, plane = create_reference(view, self.folder, img_scale=scale)
            # 诊断：输出 imagePlane 当前 imageName，方便排查看不到的问题
            try:
                img = cmds.getAttr(plane + '.imageName')
                ufe = cmds.getAttr(plane + '.useFrameExtension')
                self.log(u'✅ 创建完成: %s / %s' % (cam, plane))
                self.log(u'   图片: %s' % img)
                self.log(u'   序列模式: %s' % ufe)
                import os as _os
                if _os.path.exists(img):
                    self.log(u'   文件存在 ✓')
                else:
                    # 尝试还原为第一帧检查
                    import re as _re
                    guess = _re.sub(r'#+', '1', img)
                    self.log(u'   原路径不存在，尝试第一帧: %s' % guess)
                    self.log(u'   第一帧存在: %s' % _os.path.exists(guess))
            except Exception as e2:
                self.log(u'✅ 创建完成: %s (诊断输出失败: %s)' % (cam, e2))
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
    """在 Maya 菜单栏创建「画影客」菜单（功能归类）"""
    menu = 'artshadow_menu'
    if cmds.menu(menu, exists=True):
        cmds.deleteUI(menu)
    cmds.menu(menu, label=u'画影客', parent='MayaWindow', tearOff=True)

    # ---- 导入工具（子菜单，集中所有导入功能）----
    cmds.menuItem(label=u'📥 导入工具', subMenu=True, tearOff=True)
    cmds.menuItem(label=u'📥 打开导入工具窗口', command=lambda _: show())
    cmds.menuItem(divider=True, label=u'快速导入')
    cmds.menuItem(label=u'🎬 创建正面参考', command=lambda _: create_reference('front', _pick_folder()))
    cmds.menuItem(label=u'📐 创建侧面参考', command=lambda _: create_reference('side', _pick_folder()))
    cmds.menuItem(label=u'🔄 创建背面参考', command=lambda _: create_reference('back', _pick_folder()))
    cmds.menuItem(label=u'🎥 创建多视角（正+侧+背）', command=lambda _: create_multi_quick())
    cmds.setParent('..')

    # ---- 时间轴工具（子菜单）----
    cmds.menuItem(label=u'⏱ 时间轴工具', subMenu=True)
    cmds.menuItem(label=u'⏮ 跳转首帧', command=lambda _: jump_start())
    cmds.menuItem(label=u'⏭ 跳转末帧', command=lambda _: jump_end())
    cmds.menuItem(label=u'🔁 循环播放', command=lambda _: toggle_loop_menu())
    cmds.setParent('..')

    cmds.menuItem(divider=True)
    cmds.menuItem(label=u'❓ 帮助', command=lambda _: show_help())


def toggle_loop_menu():
    try:
        cmds.playbackOptions(loop='continuous')
        print(u'[画影客] 已开启循环播放')
    except Exception as e:
        print(u'[画影客] 循环设置失败: %s' % e)


def show_help():
    cmds.confirmDialog(title=u'画影客工具', message=u'画影客 - Maya 参考素材导入工具\n\n'
                       u'工作流：画影客导出 PNG 序列帧 → 本工具导入创建参考相机',
                       button=[u'确定'], defaultButton=u'确定', dismissString=u'确定')

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
