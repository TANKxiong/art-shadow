# -*- coding: utf-8 -*-
"""画影客插件安装辅助：把加载代码合并进 userSetup.py（不覆盖已有内容）"""
import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')


def main():
    if len(sys.argv) < 2:
        print('usage: install_helper.py <scripts_dir>')
        return 1
    scripts_dir = sys.argv[1]
    target = os.path.join(scripts_dir, 'userSetup.py')
    add_block = u"""

# ===== artshadow (画影客) auto load =====
try:
    import artshadow_ref
    artshadow_ref.build_menu()
except Exception:
    pass
"""
    try:
        if os.path.exists(target):
            with io.open(target, 'r', encoding='utf-8') as f:
                content = f.read()
            if 'artshadow' in content:
                print(u'[已存在] userSetup.py 已包含画影客加载代码，跳过')
                return 0
            # 备份
            bak = target + '.bak'
            try:
                with io.open(bak, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(u'[备份] 原 userSetup.py 已备份为 userSetup.py.bak')
            except Exception:
                pass
            with io.open(target, 'a', encoding='utf-8') as f:
                f.write(add_block)
            print(u'[完成] 已合并加载代码到现有 userSetup.py')
        else:
            with io.open(target, 'w', encoding='utf-8') as f:
                f.write(u'# 画影客插件自动加载\n' + add_block)
            print(u'[完成] 已创建 userSetup.py')
        return 0
    except Exception as e:
        print(u'[错误] %s' % e)
        return 1


if __name__ == '__main__':
    sys.exit(main())
