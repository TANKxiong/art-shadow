# 画影客 → Maya 参考素材导入工具

## 文件说明
- `artshadow_ref.py` — Maya Python 插件（参考素材导入工具）

## 安装 Maya 插件
1. 把 `artshadow_ref.py` 复制到 Maya 脚本目录：
   - Windows: `C:\Users\你的用户名\Documents\maya\scripts\`
   - 或 Maya 里执行 `print(cmds.internalVar(userScriptDir=1))` 查看目录
2. 在 Maya 脚本编辑器（Python 标签）执行：
   ```python
   import artshadow_ref
   artshadow_ref.build_menu()
   ```
3. 菜单栏出现「画影客」菜单；或直接执行 `artshadow_ref.show()` 打开工具窗口

## 使用方法
### 方式一：从画影客导出（推荐）
1. 画影客素材库 → 打开视频预览 → 点 **🎬 导入 Maya**
2. 自动用 FFmpeg 把视频转成 PNG 序列帧，保存到素材同目录的 `xxx_maya` 文件夹
3. 弹窗显示导出位置和帧数
4. 在 Maya 工具窗口选择该文件夹 → 点「导入参考」

### 方式二：直接选序列帧
- 任意 PNG/JPEG 序列帧文件夹（001.png、002.png...）都支持

### 工具窗口功能
- **视角**：正面 / 侧面 / 背面 / 顶面（决定相机朝向）
- **参考宽度**：imagePlane 在场景中的宽度（单位，默认 10）
- **帧率**：匹配视频帧率（默认 25）
- **导入参考**：创建相机 + imagePlane + 设置播放范围
- **多视角一键创建**：正面 + 侧面 + 背面三个参考相机
- **首帧 / 末帧**：时间轴快速跳转

## 生成的场景结构
- `ref_front_cam` — 参考相机（自动对准 imagePlane）
- `ref_front_plane` — imagePlane（加载序列帧）

## 说明
- 原始素材**不会被修改**，PNG 序列是临时导出
- 序列帧保存在素材同目录的 `_maya` 子文件夹，删除不影响原素材
- Maya 2020+ 通用，Python 2/3 均可（Maya 2022+ 默认 Python 3）
