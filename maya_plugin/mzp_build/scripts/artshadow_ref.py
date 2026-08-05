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
def load_audio(audio_path, offset=0):
    """导入音频文件到 Maya 时间轴（wav/mp3 等），返回 audio 节点名"""
    if not audio_path or not os.path.exists(audio_path):
        print(u'[画影客] 音频文件不存在: %s' % audio_path)
        return None
    audio_path = audio_path.replace('\\', '/')
    try:
        # 先清理同名的旧 audio 节点（避免重复导入）
        want_base = os.path.basename(audio_path).lower()
        for node in cmds.ls(type='audio'):
            try:
                fn = cmds.getAttr(node + '.filename') or ''
                if os.path.basename(fn.replace('\\', '/').lower()) == want_base:
                    cmds.delete(node)
            except Exception:
                pass
        # 导入音频（Maya 通过 file import 创建 audio 节点）
        imported = cmds.file(audio_path, i=True, type='audio')
        node = None
        if isinstance(imported, (list, tuple)) and imported:
            for it in imported:
                if cmds.nodeType(it) == 'audio':
                    node = it
                    break
            if not node:
                node = imported[-1]
        elif imported:
            node = imported
        if not node:
            audios = cmds.ls(type='audio')
            node = audios[-1] if audios else None
        if node:
            try:
                cmds.setAttr(node + '.offset', float(offset))
            except Exception:
                pass
            try:
                d = cmds.getAttr(node + '.duration')
                if d:
                    end = max(1, int(round(float(d) + float(offset))))
                    cmds.playbackOptions(max=end, aet=end)
            except Exception:
                pass
            print(u'[画影客] 音频已导入: %s (%s)' % (node, os.path.basename(audio_path)))
            return node
        print(u'[画影客] 音频导入后未找到 audio 节点')
        return None
    except Exception as e:
        print(u'[画影客] 音频导入失败: %s' % e)
        return None


def find_audio_in_folder(folder):
    """在文件夹中查找音频文件（ref_audio.wav 优先）"""
    if not folder or not os.path.isdir(folder):
        return None
    try:
        pref = os.path.join(folder, 'ref_audio.wav')
        if os.path.exists(pref):
            return pref
        for f in sorted(os.listdir(folder)):
            if f.lower().endswith(('.wav', '.mp3', '.aif', '.aiff', '.m4a')):
                return os.path.join(folder, f)
    except Exception:
        pass
    return None


def freeze_in_place(objects=None, t_axes=(True, False, True), r_axes=(False, False, False)):
    """
    定在原地：把选中对象的指定位移/旋转轴钉在当前值（parentConstraint 实现）。
    t_axes: (X,Y,Z) 位移冻结开关；r_axes: (X,Y,Z) 旋转冻结开关。
    返回创建的约束名列表。
    """
    if not objects:
        objects = cmds.ls(selection=True, type='transform')
    if not objects:
        raise RuntimeError(u'请先选中角色（根控制）')
    if not any(t_axes) and not any(r_axes):
        raise RuntimeError(u'请至少勾选一个冻结通道')
    unfreeze_in_place()
    cnsts = []
    for obj in objects:
        if not cmds.objExists(obj):
            continue
        loc = cmds.spaceLocator(name='artshadow_freeze_loc')[0]
        try:
            pos = cmds.xform(obj, query=True, worldSpace=True, translation=True)
            cmds.xform(loc, worldSpace=True, translation=pos)
        except Exception:
            pass
        try:
            rot = cmds.xform(obj, query=True, worldSpace=True, rotation=True)
            cmds.xform(loc, worldSpace=True, rotation=rot)
        except Exception:
            pass
        skip_t = []
        if not t_axes[0]: skip_t.append('x')
        if not t_axes[1]: skip_t.append('y')
        if not t_axes[2]: skip_t.append('z')
        skip_r = []
        if not r_axes[0]: skip_r.append('x')
        if not r_axes[1]: skip_r.append('y')
        if not r_axes[2]: skip_r.append('z')
        try:
            cnst = cmds.parentConstraint(loc, obj,
                                         skipTranslate=skip_t,
                                         skipRotate=skip_r,
                                         maintainOffset=True,
                                         name='artshadow_freeze_cnst')
        except Exception as e:
            raise RuntimeError(u'创建约束失败(%s): %s' % (obj, e))
        cnsts.append(cnst)
    if not cnsts:
        raise RuntimeError(u'没有可冻结的对象')
    t_txt = ''.join(['T' if x else '-' for x in t_axes])
    r_txt = ''.join(['R' if x else '-' for x in r_axes])
    print(u'[画影客] 已定在原地: %s (位移 %s, 旋转 %s)' % (', '.join(objects), t_txt, r_txt))
    return cnsts


def _freeze_cnsts():
    """找出所有画影客创建的冻结约束（parentConstraint/pointConstraint/orientConstraint）"""
    found = []
    for typ in ('parentConstraint', 'pointConstraint', 'orientConstraint'):
        for c in cmds.ls(type=typ) or []:
            try:
                name = cmds.parentConstraint(c, query=True, name=True)
            except Exception:
                try:
                    name = cmds.pointConstraint(c, query=True, name=True)
                except Exception:
                    name = c
            if name and 'artshadow_freeze' in name:
                found.append(c)
    return found


def unfreeze_in_place():
    """解除定格：删除画影客创建的约束和 locator"""
    removed = []
    for c in _freeze_cnsts():
        try:
            cmds.delete(c)
            removed.append(c)
        except Exception:
            pass
    for l in cmds.ls('artshadow_freeze_loc*') or []:
        try:
            cmds.delete(l)
        except Exception:
            pass
    if removed:
        print(u'[画影客] 已解除定格: %s' % ', '.join(removed))
    else:
        print(u'[画影客] 当前没有定格状态')
    return removed


def freeze_status():
    """返回当前定格状态信息（约束列表）"""
    return _freeze_cnsts()


def make_loop_in_place(objects=None, start_frame=None, end_frame=None):
    """
    原地循环走（运动提取 motion extraction）：
    走路本质：身体前进，支撑脚世界不动，摆动脚迈步。
    正确转换：只把「身体(基准)」的世界 X/Z 钉在起始位置，
    其他所有关节的「世界轨迹保持不变」（支撑脚踩地不动、摆动脚正常迈步），
    然后按新身体位置重新解算每个关节的本地位移/旋转。
    结果：身体原地踏步，腿前后交错自然，不滑步。
    """
    import math as _math
    from maya.api import OpenMaya as _om

    if not objects:
        objects = cmds.ls(selection=True, type='transform')
    if not objects:
        raise RuntimeError(u'请先选中角色（根控制）')
    if start_frame is None:
        try:
            start_frame = int(round(cmds.playbackOptions(query=True, min=True)))
        except Exception:
            start_frame = 1
    if end_frame is None:
        try:
            end_frame = int(round(cmds.playbackOptions(query=True, max=True)))
        except Exception:
            end_frame = start_frame
    if end_frame <= start_frame:
        end_frame = start_frame + 1

    # 1) 收集候选对象：选中 + 所有 transform 子级
    candidates = []
    for obj in objects:
        if cmds.objExists(obj) and obj not in candidates:
            candidates.append(obj)
        try:
            for child in cmds.listRelatives(obj, allDescendents=True, type='transform') or []:
                if cmds.objExists(child) and child not in candidates:
                    candidates.append(child)
        except Exception:
            pass

    # 2) 只保留区间内有 translate 或 rotate 关键帧的对象
    animated = []
    for obj in candidates:
        try:
            kf = cmds.keyframe(obj, attribute=('translateX', 'translateZ', 'rotateX', 'rotateZ'),
                               query=True, time=(start_frame, end_frame)) or []
            if kf:
                animated.append(obj)
        except Exception:
            pass
    if not animated:
        raise RuntimeError(u'在选中对象及其子级中，没有找到 %d-%d 帧内的动画关键帧。请确认选中的是角色的根控制/骨架' % (start_frame, end_frame))

    # 3) 自动找基准：水平位移幅度最大的对象（身体/重心）
    best_root = objects[0]
    best_amp = -1.0
    for obj in animated:
        try:
            x0 = cmds.getAttr(obj + '.translateX', time=start_frame)
            x1 = cmds.getAttr(obj + '.translateX', time=end_frame)
            z0 = cmds.getAttr(obj + '.translateZ', time=start_frame)
            z1 = cmds.getAttr(obj + '.translateZ', time=end_frame)
            amp = abs(x1 - x0) + abs(z1 - z0)
            if amp > best_amp:
                best_amp = amp
                best_root = obj
        except Exception:
            pass
    if best_amp <= 0:
        raise RuntimeError(u'未检测到水平前进位移（%d-%d 帧），请确认播放范围覆盖完整走路循环' % (start_frame, end_frame))
    root = best_root

    # 4) 拓扑排序：父先子后（层级浅的在前）
    def _depth(o):
        d = 0
        p = o
        while True:
            try:
                par = cmds.listRelatives(p, parent=True, type='transform')
                if not par:
                    break
                p = par[0]
                d += 1
            except Exception:
                break
        return d
    try:
        animated.sort(key=_depth)
    except Exception:
        pass

    # 5) 起始帧基准世界位置
    cmds.currentTime(start_frame)
    base_m = cmds.xform(root, query=True, worldSpace=True, matrix=True)
    base_x = base_m[12]
    base_z = base_m[14]
    print(u'[画影客] 基准对象: %s (水平位移 %.2f)' % (root, best_amp))

    # 6) 逐帧：钉住身体，保持其他对象世界轨迹，重新解算本地
    processed = []
    for t in range(start_frame, end_frame + 1):
        cmds.currentTime(t)
        # 读取所有对象当前世界矩阵
        wm = {}
        ok = True
        for obj in animated:
            try:
                wm[obj] = _om.MMatrix(cmds.xform(obj, query=True, worldSpace=True, matrix=True))
            except Exception:
                ok = False
                break
        if not ok:
            continue
        # 新世界矩阵：所有对象世界 X/Z 减去身体位移 D(t)（保持相对身体关系）
        # 身体原地踏步，腿脚相对身体的动画完全不变 = 跑步机走路
        rp = wm[root]
        rmt = _om.MTransformationMatrix(rp)
        rtr = rmt.translation(_om.MSpace.kWorld)
        dx = rtr.x - base_x
        dz = rtr.z - base_z
        if abs(dx) < 0.0001 and abs(dz) < 0.0001:
            new_wm = dict(wm)
        else:
            shift = _om.MTransformationMatrix()
            shift.setTranslation(_om.MVector(-dx, 0.0, -dz), _om.MSpace.kWorld)
            sm = shift.asMatrix()
            new_wm = {}
            for obj in animated:
                new_wm[obj] = sm * wm[obj]
        # 写回：本地 = inv(父级新世界) * 新世界
        for obj in animated:
            try:
                parent = cmds.listRelatives(obj, parent=True, type='transform')
                pm = new_wm.get(parent[0]) if parent else None
                if pm is None:
                    local = new_wm[obj]
                else:
                    local = pm.inverse() * new_wm[obj]
                tf = _om.MTransformationMatrix(local)
                tr = tf.translation(_om.MSpace.kTransform)
                quat = tf.rotation(asQuaternion=True)
                try:
                    order = int(cmds.getAttr(obj + '.rotateOrder') or 0)
                except Exception:
                    order = 0
                euler = quat.asEulerRotation()
                try:
                    euler.reorderIt(order)
                except Exception:
                    pass
                rx = _math.degrees(euler.x)
                ry = _math.degrees(euler.y)
                rz = _math.degrees(euler.z)
                cmds.setAttr(obj + '.translate', tr.x, tr.y, tr.z)
                cmds.setAttr(obj + '.rotate', rx, ry, rz)
                cmds.setKeyframe(obj, attribute='translate', time=t)
                cmds.setKeyframe(obj, attribute='rotate', time=t)
                if obj not in processed:
                    processed.append(obj)
            except Exception:
                pass

    if not processed:
        raise RuntimeError(u'处理失败（%d-%d 帧）' % (start_frame, end_frame))
    try:
        cmds.playbackOptions(min=start_frame, max=end_frame,
                             ast=start_frame, aet=end_frame,
                             loop='continuous')
    except Exception:
        pass
    print(u'[画影客] 已生成原地循环走，处理 %d 个对象（区间 %d-%d 帧）' % (len(processed), start_frame, end_frame))
    print(u'[画影客] 身体原地，脚世界轨迹保持（支撑脚踩地、摆动脚迈步）')
    return processed


class ReferenceImporter(object):
    def __init__(self):
        self.window = 'artshadow_ref_win'
        self.folder = ''

    def show(self):
        if cmds.window(self.window, exists=True):
            cmds.deleteUI(self.window)
        self.window = cmds.window(self.window, title=u'画影客工具',
                                  widthHeight=(430, 420), sizeable=True)
        cmds.window(self.window, edit=True, minimizeButton=True)

        cmds.columnLayout(adjustableColumn=True, rowSpacing=4)

        # ===== 标题 =====
        cmds.text(label=u'画影客工具', font='boldLabelFont', height=24, align='center')

        # ===== 分区一：导入参考序列 =====
        cmds.frameLayout(label=u'导入参考序列', collapsable=True, collapse=False)
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
        cmds.text(label=u'提示：若文件夹内有 ref_audio.wav 会自动加载音频',
                  align='left', font='smallPlainLabelFont')
        cmds.setParent('..')
        cmds.setParent('..')
        cmds.separator(h=4)

        # ===== 分区二：导入音频 =====
        cmds.frameLayout(label=u'导入音频', collapsable=True, collapse=False)
        cmds.columnLayout(adjustableColumn=True, rowSpacing=4)
        cmds.text(label=u'手动导入音频文件到 Maya 时间轴（wav/mp3/aif 等）', align='left')
        cmds.button(label=u'导入音频...', command=self.import_audio,
                    bgc=(0.3, 0.45, 0.6), height=26)
        cmds.setParent('..')
        cmds.setParent('..')
        cmds.separator(h=4)

                # ===== 分区三：角色工具（定在原地）=====
        cmds.frameLayout(label=u'角色工具', collapsable=True, collapse=False)
        cmds.columnLayout(adjustableColumn=True, rowSpacing=6)
        cmds.text(label=u'选中角色根控制，自由选择要冻结的通道', align='left',
                  font='smallPlainLabelFont')

        # 位移冻结（横向排列三个勾选框）
        cmds.frameLayout(label=u'位移冻结', collapsable=False)
        cmds.rowLayout(numberOfColumns=3, columnWidth3=(70, 70, 70))
        cmds.checkBox('as_freeze_x', label=u'X', value=True)
        cmds.checkBox('as_freeze_y', label=u'Y', value=False)
        cmds.checkBox('as_freeze_z', label=u'Z', value=True)
        cmds.setParent('..')
        cmds.setParent('..')

        # 旋转冻结（横向排列三个勾选框）
        cmds.frameLayout(label=u'旋转冻结', collapsable=False)
        cmds.rowLayout(numberOfColumns=3, columnWidth3=(70, 70, 70))
        cmds.checkBox('as_freeze_rx', label=u'X', value=False)
        cmds.checkBox('as_freeze_ry', label=u'Y', value=False)
        cmds.checkBox('as_freeze_rz', label=u'Z', value=False)
        cmds.setParent('..')
        cmds.setParent('..')

        # 按钮行
        cmds.rowLayout(numberOfColumns=2, columnWidth2=(160, 160), adjustableColumn=1)
        cmds.button(label=u'定在原地', command=self.do_freeze,
                    bgc=(0.5, 0.4, 0.2), height=28)
        cmds.button(label=u'解除定格', command=self.do_unfreeze,
                    bgc=(0.3, 0.3, 0.36), height=28)
        cmds.setParent('..')

        # 原地循环（整行按钮 + 说明）
        cmds.button(label=u'原地循环走', command=self.do_loop,
                    bgc=(0.2, 0.4, 0.5), height=28)
        cmds.text(label=u'提示：先设好时间轴播放范围（如走两步的区间），', align='left',
                  font='smallPlainLabelFont')
        cmds.text(label=u'选中根控制后点击，即生成原地循环动画', align='left',
                  font='smallPlainLabelFont')

        # 状态条（带背景色，定格中显示）
        cmds.text('as_freeze_state', label=u'未定格', align='center',
                  font='boldLabelFont', height=22, backgroundColor=(0.16, 0.16, 0.2))
        cmds.setParent('..')
        cmds.setParent('..')
        cmds.separator(h=4)

# ===== 日志 =====
        cmds.frameLayout(label=u'日志', collapsable=True, collapse=False)
        cmds.scrollField('as_log', editable=False, height=120, wordWrap=True)
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

    def import_audio(self, _=None):
        """手动选择音频文件导入 Maya"""
        try:
            files = cmds.fileDialog2(dialogStyle=2, fileMode=1,
                                     caption=u'选择音频文件',
                                     fileFilter=u'音频文件 (*.wav *.mp3 *.aif *.aiff *.m4a);;所有文件 (*.*)')
            if files:
                path = files[0]
                node = load_audio(path)
                if node:
                    self.log(u'🎵 音频已导入: %s (%s)' % (node, os.path.basename(path)))
                else:
                    self.log(u'❌ 音频导入失败: %s' % path)
        except Exception as e:
            self.log(u'❌ 导入音频出错: %s' % e)

    def do_freeze(self, _=None):
        """定在原地：冻结选中角色的指定位移轴"""
        try:
            sel = cmds.ls(selection=True, type='transform')
            if not sel:
                self.log(u'❌ 请先选中角色（根控制）')
                return
            t_axes = (cmds.checkBox('as_freeze_x', query=True, value=True),
                      cmds.checkBox('as_freeze_y', query=True, value=True),
                      cmds.checkBox('as_freeze_z', query=True, value=True))
            r_axes = (cmds.checkBox('as_freeze_rx', query=True, value=True),
                      cmds.checkBox('as_freeze_ry', query=True, value=True),
                      cmds.checkBox('as_freeze_rz', query=True, value=True))
            if not any(t_axes) and not any(r_axes):
                self.log(u'❌ 请至少勾选一个冻结通道（位移或旋转）')
                return
            names = freeze_in_place(sel, t_axes, r_axes)
            t_txt = ''.join(['T' if x else '-' for x in t_axes])
            r_txt = ''.join(['R' if x else '-' for x in r_axes])
            self.log(u'📍 已定在原地: %s' % ', '.join(sel))
            self.log(u'   位移冻结 %s, 旋转冻结 %s' % (t_txt, r_txt))
            self.log(u'   约束: %s' % ', '.join(names))
            cmds.text('as_freeze_state', edit=True,
                      label=u'已定格 (位移 %s, 旋转 %s)' % (t_txt, r_txt),
                      backgroundColor=(0.12, 0.3, 0.18))
        except Exception as e:
            self.log(u'❌ 定在原地失败: %s' % e)

    def do_unfreeze(self, _=None):
        """解除定格"""
        try:
            removed = unfreeze_in_place()
            if removed:
                self.log(u'✅ 已解除定格: %s' % ', '.join(removed))
            else:
                self.log(u'当前没有定格状态')
            cmds.text('as_freeze_state', edit=True, label=u'未定格',
                      backgroundColor=(0.16, 0.16, 0.2))
        except Exception as e:
            self.log(u'❌ 解除定格失败: %s' % e)

    def do_loop(self, _=None):
        """原地循环走（v9 安全版）：
        1. 第一个选中的对象 = 根控制器（身体）
        2. 自动记录当前基准位置 + 每帧前进量 D(t)
        3. 身体：删除 X/Z 位移曲线钉在基准（不动旋转）
        4. 脚/手：逐帧读取原始世界位置，减 D(t)，用 cmds.xform 设置世界位置
           （只改位移，旋转完全不动，不会乱飞）
        5. 循环播放
        """
        try:
            sel = cmds.ls(selection=True, type='transform')
            if not sel:
                self.log(u'❌ 请先选中根控制器（第一个选中的将作为身体）')
                return
            root = sel[0]
            try:
                start = int(round(cmds.playbackOptions(query=True, min=True)))
                end = int(round(cmds.playbackOptions(query=True, max=True)))
            except Exception:
                start, end = 1, 2
            if end <= start:
                end = start + 1
            self.log(u'🎯 根(身体): %s' % root)

            # 1) 收集候选对象：其他选中对象 + 所有 transform 子级
            candidates = []
            for obj in sel:
                if cmds.objExists(obj) and obj not in candidates:
                    candidates.append(obj)
                try:
                    for child in cmds.listRelatives(obj, allDescendents=True, type='transform') or []:
                        if cmds.objExists(child) and child not in candidates:
                            candidates.append(child)
                except Exception:
                    pass

            # 2) 记录基准位置 + 每帧前进量 D(t)（在删曲线之前！）
            cmds.currentTime(start)
            base_m = cmds.xform(root, query=True, worldSpace=True, matrix=True)
            base_x, base_z = base_m[12], base_m[14]
            self.log(u'   基准位置: X=%.2f Z=%.2f' % (base_x, base_z))
            dseq = {}
            for t in range(start, end + 1):
                try:
                    cmds.currentTime(t)
                    m = cmds.xform(root, query=True, worldSpace=True, matrix=True)
                    dseq[t] = (m[12] - base_x, m[14] - base_z)
                except Exception:
                    dseq[t] = (0.0, 0.0)

            # 3) 删除根 X/Z 位移曲线，钉在基准（身体原地，旋转不动）
            cmds.currentTime(start)
            sx = cmds.getAttr(root + '.translateX')
            sz = cmds.getAttr(root + '.translateZ')
            try:
                cmds.cutKey(root, attribute='translateX', time=(start, end))
                cmds.cutKey(root, attribute='translateZ', time=(start, end))
                cmds.setKeyframe(root, attribute='translateX', time=start, value=sx)
                cmds.setKeyframe(root, attribute='translateX', time=end, value=sx)
                cmds.setKeyframe(root, attribute='translateZ', time=start, value=sz)
                cmds.setKeyframe(root, attribute='translateZ', time=end, value=sz)
                self.log(u'✅ 身体位移已锁定')
            except Exception as e:
                self.log(u'❌ 锁定位移失败: %s' % e)
                return

            # 4) 补偿对象：区间内 X/Z 值在动的对象（含约束驱动）
            targets = []
            for obj in candidates:
                if obj == root:
                    continue
                try:
                    x0 = cmds.getAttr(obj + '.translateX', time=start)
                    x1 = cmds.getAttr(obj + '.translateX', time=end)
                    z0 = cmds.getAttr(obj + '.translateZ', time=start)
                    z1 = cmds.getAttr(obj + '.translateZ', time=end)
                    if abs(x1 - x0) > 0.001 or abs(z1 - z0) > 0.001:
                        targets.append(obj)
                except Exception:
                    pass
            self.log(u'  补偿对象 %d 个' % len(targets))

            # 5) 逐帧补偿：只改世界位移（cmds.xform 原生处理父级，不碰旋转）
            def _depth(o):
                d = 0
                p = o
                while True:
                    try:
                        par = cmds.listRelatives(p, parent=True, type='transform')
                        if not par:
                            break
                        p = par[0]
                        d += 1
                    except Exception:
                        break
                return d
            try:
                targets.sort(key=_depth)
            except Exception:
                pass
            processed = []
            for t in range(start, end + 1):
                cmds.currentTime(t)
                dx, dz = dseq.get(t, (0.0, 0.0))
                if abs(dx) < 0.0001 and abs(dz) < 0.0001:
                    continue
                # 先读所有对象的原始世界位置（未修改时）
                orig_pos = {}
                ok = True
                for obj in targets:
                    try:
                        orig_pos[obj] = cmds.xform(obj, query=True, worldSpace=True, translation=True)
                    except Exception:
                        ok = False
                        break
                if not ok:
                    continue
                # 按拓扑顺序（父先子后）设置世界位置（减前进量）
                for obj in targets:
                    try:
                        p0 = orig_pos[obj]
                        cmds.xform(obj, worldSpace=True,
                                   translation=[p0[0] - dx, p0[1], p0[2] - dz])
                        cmds.setKeyframe(obj, attribute='translate', time=t)
                        if obj not in processed:
                            processed.append(obj)
                    except Exception:
                        pass
            try:
                cmds.playbackOptions(min=start, max=end, ast=start, aet=end, loop='continuous')
            except Exception:
                pass
            self.log(u'🔄 已生成原地循环走 (区间 %d-%d, 补偿 %d 对象)' % (start, end, len(processed)))
            self.log(u'   只改位移不动旋转，位置基于基准 %d 帧' % start)
            cmds.text('as_freeze_state', edit=True,
                      label=u'🔄 原地循环中 (%d-%d 帧)' % (start, end),
                      backgroundColor=(0.12, 0.28, 0.4))
        except Exception as e:
            self.log(u'❌ 原地循环失败: %s' % e)
            import traceback
            self.log(traceback.format_exc())

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
            # 自动加载同目录音频（ref_audio.wav 优先）
            audio = find_audio_in_folder(self.folder)
            if audio:
                load_audio(audio)
                self.log(u'🎵 已加载音频: %s' % os.path.basename(audio))
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
            # 自动加载同目录音频
            audio = find_audio_in_folder(self.folder)
            if audio:
                load_audio(audio)
                self.log(u'🎵 已加载音频: %s' % os.path.basename(audio))
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

    # ---- 导入工具（子菜单）----
    cmds.menuItem(label=u'导入工具', subMenu=True, tearOff=True)
    cmds.menuItem(label=u'打开导入工具窗口', command=lambda _: show())
    cmds.menuItem(divider=True)
    cmds.menuItem(label=u'导入音频...', command=lambda _: import_audio_quick())
    cmds.setParent('..')

    cmds.menuItem(divider=True)
    cmds.menuItem(label=u'帮助', command=lambda _: show_help())


def toggle_loop_menu():
    try:
        cmds.playbackOptions(loop='continuous')
        print(u'[画影客] 已开启循环播放')
    except Exception as e:
        print(u'[画影客] 循环设置失败: %s' % e)


def import_audio_quick():
    """菜单快捷入口：选择音频文件导入"""
    try:
        files = cmds.fileDialog2(dialogStyle=2, fileMode=1,
                                 caption=u'选择音频文件',
                                 fileFilter=u'音频文件 (*.wav *.mp3 *.aif *.aiff *.m4a);;所有文件 (*.*)')
        if files:
            node = load_audio(files[0])
            print(u'[画影客] 音频导入: %s' % (node or u'失败'))
    except Exception as e:
        print(u'[画影客] 导入音频出错: %s' % e)


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
