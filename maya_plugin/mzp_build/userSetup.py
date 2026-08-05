# -*- coding: utf-8 -*-
"""
画影客 Maya 插件自动加载器（Maya 2022 专用 scripts 目录）
启动时自动注册「画影客」菜单。
"""
import sys
import traceback


def _load_artshadow():
    try:
        import artshadow_ref
        if 'artshadow_ref' in sys.modules:
            try:
                import importlib
                importlib.reload(artshadow_ref)
            except Exception:
                pass
        try:
            artshadow_ref.build_menu()
            print(u'[画影客] 菜单已注册：Maya 菜单栏 -> 画影客')
        except Exception as e:
            print(u'[画影客] 菜单注册失败: %s' % e)
        return True
    except Exception as e:
        print(u'[画影客] 加载失败: %s' % e)
        traceback.print_exc()
        return False


try:
    # Maya 2022 scripts 目录本身就在 sys.path，无需额外处理
    _load_artshadow()
except Exception:
    traceback.print_exc()
